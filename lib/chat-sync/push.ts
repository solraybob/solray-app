import { mergeMessages, sameTranscript } from "../chat-merge";
import { withSoulBackfill } from "../chat-soul";
import { isCurrentGeneration } from "../account-session";
import { trackRequest } from "../api";
import { type ChatMessage, loadSession, saveSession, type StoredSession, apiUrl } from "./store";
import { markUnsent, announceMerged, enqueue, deletedHere, getLocalMeta, getServerConfirmed, startedHere, setSessionLocalMeta, getPendingRenames, markServerConfirmed, clearRenamePending, clearUnsent, unmarkServerConfirmed, dropSessionLocalMeta } from "./marks";
import { uploadableMessages, owedMessages, resolveFromServer } from "./status";

/**
 * Write the outcome of a /chat send into a conversation's saved copy when
 * the page can no longer show it (the member left Chat or opened another
 * conversation): `update` gets the saved messages and returns the new ones.
 * An open Chat page showing that conversation takes it in through the
 * merged-transcript event. The conversation is marked unsent so the next
 * sync uploads what may go up. Returns false when there is no saved copy or
 * the account changed.
 */
export function updateStoredSession(
  sessionId: string, gen: number, update: (messages: ChatMessage[]) => ChatMessage[],
): boolean {
  if (!sessionId || !isCurrentGeneration(gen)) return false;
  const latest = loadSession(sessionId);
  if (!latest) return false;
  const next = update(latest.messages || []);
  saveSession({ ...latest, messages: next });
  markUnsent(sessionId);
  announceMerged(sessionId, next);
  return true;
}

/**
 * Upload one conversation. Resolves true when the server holds it.
 * `gen` is the account generation the write was made under.
 */
export function pushSessionToServer(session: StoredSession, token: string | null, gen: number): Promise<boolean> {
  if (!token) return Promise.resolve(false);
  markUnsent(session.sessionId);
  return enqueue(session.sessionId, () => pushSessionNow(session.sessionId, token, gen));
}

async function pushSessionNow(sessionId: string, token: string, gen: number): Promise<boolean> {
  // Written under an account that has since signed out, or deleted here.
  if (!isCurrentGeneration(gen) || deletedHere.has(sessionId)) return false;
  // The newest local copy, not the one handed in when the write was queued:
  // an earlier queued write may already have folded in later turns.
  const local = loadSession(sessionId);
  if (!local) return false;
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
  const url = `${apiUrl()}/chat/sessions/${encodeURIComponent(sessionId)}`;
  const stillMine = () => isCurrentGeneration(gen) && !deletedHere.has(sessionId);
  try {
    return await trackRequest(async () => {
      const known = getLocalMeta()[sessionId];
      const knownRevision = typeof known?.revision === "number" ? known.revision : null;
      const expectExisting = getServerConfirmed().has(sessionId);
      // A conversation started on this device that the server has never
      // seen is not read first: there is nothing to read yet, and asking
      // for it was a 404 on every new chat.
      if (knownRevision === null && !(startedHere.has(sessionId) && !expectExisting)) {
        // A server that has not reported a revision may still replace on
        // PUT: read its copy first so the write keeps what others added.
        const getRes = await fetch(url, { headers });
        if (!stillMine()) return false;
        if (getRes.status === 404) {
          // Confirmed on the server before and gone now: deleted on another
          // device. Do not bring it back; the next sync drops it here.
          if (expectExisting) return false;
        } else if (getRes.ok) {
          const full = await getRes.json();
          if (!stillMine()) return false;
          takeServerCopy(sessionId, Array.isArray(full?.messages) ? full.messages : []);
          if (typeof full?.revision === "number" && typeof full?.last_message_at === "string") {
            setSessionLocalMeta(sessionId, full.last_message_at, full.revision);
          }
        } else {
          // Unknown server state: a blind replacement could erase turns.
          return false;
        }
      }

      // A rename made here and not confirmed yet goes up as an explicit
      // rename; every other upload is an ordinary transcript upload, which
      // never changes the name on the server (the reply carries the current
      // one). If the server answers with a different name than the one
      // asked for, the rename stays pending and is sent once more with the
      // revision just learned (and again on the next sync if needed).
      for (let attempt = 0; attempt < 2; attempt++) {
        // The newest local copy (the member may have written more meanwhile),
        // with this device's Dynamics partner reference written in if the
        // transcript does not name it yet.
        let latest = loadSession(sessionId) || local;
        const backfilled = withSoulBackfill(sessionId, latest.messages || []);
        if (backfilled !== latest.messages) {
          latest = { ...latest, messages: backfilled };
          saveSession(latest);
        }
        const sent = uploadableMessages(latest.messages || []);
        const baseRevision = getLocalMeta()[sessionId]?.revision;
        const renaming = getPendingRenames().has(sessionId);
        const putRes = await fetch(url, {
          method: "PUT",
          headers,
          body: JSON.stringify({
            session_id: sessionId,
            custom_name: latest.customName || null,
            rename: renaming,
            date_label: latest.date || null,
            messages: sent,
            ...(typeof baseRevision === "number" ? { base_revision: baseRevision } : {}),
            expect_existing: expectExisting,
          }),
        });
        if (!stillMine()) return false;
        if (!putRes.ok) return false;
        const out = await putRes.json().catch(() => ({} as Record<string, unknown>));
        if (!stillMine()) return false;
        markServerConfirmed([sessionId]);
        const sentName = latest.customName || undefined;
        const serverKnown = !!out && "custom_name" in out;
        const serverNameNow = serverKnown && typeof out.custom_name === "string" && out.custom_name
          ? out.custom_name as string : undefined;
        const nowLocal = loadSession(sessionId);
        let renameStillPending = false;
        if (renaming) {
          // Done only when the server reports the name that was asked for
          // (and nothing newer was typed here meanwhile).
          if (serverKnown && serverNameNow === sentName) {
            if ((nowLocal?.customName || undefined) === sentName) clearRenamePending(sessionId);
            else renameStillPending = true;
          } else {
            renameStillPending = true;
          }
        } else if (getPendingRenames().has(sessionId)) {
          // Renamed here while this upload ran: sent next.
          renameStillPending = true;
        } else if (nowLocal && serverKnown) {
          // No rename made here: the server's name is the current one
          // (another device may have renamed or cleared it).
          if ((nowLocal.customName || undefined) !== serverNameNow) saveSession({ ...nowLocal, customName: serverNameNow });
        }
        // The merged transcript the server now holds: take in what other
        // devices added (a server from before the merge sends none).
        const serverNow: ChatMessage[] = Array.isArray(out?.messages) ? out.messages as ChatMessage[] : sent;
        takeServerCopy(sessionId, serverNow);
        if (out && typeof out.last_message_at === "string") {
          setSessionLocalMeta(sessionId, out.last_message_at, typeof out.revision === "number" ? out.revision : undefined);
        }
        if (renameStillPending) {
          // Kept unsent so the next sync sends the rename again.
          if (attempt === 0) continue;
          return true;
        }
        // Only clear "unsent" if nothing newer was written while uploading.
        const after = loadSession(sessionId);
        // (Interrupted and refused messages kept here are not owed to it.)
        if (!after || sameTranscript(mergeMessages(serverNow, owedMessages(after.messages || [])), serverNow)) {
          clearUnsent(sessionId);
        }
        return true;
      }
      return true;
    });
  } catch {
    // Network: the local copy stays and is marked unsent.
    return false;
  }
}

/** Fold the server's transcript into this device's cache (and the open
 *  conversation) without dropping anything only this device has. */
function takeServerCopy(sessionId: string, serverMessages: ChatMessage[]) {
  resolveFromServer(serverMessages);
  const latest = loadSession(sessionId);
  if (!latest) return;
  const merged = mergeMessages(serverMessages, latest.messages || []);
  if (!sameTranscript(merged, latest.messages || [])) {
    saveSession({ ...latest, messages: merged });
    announceMerged(sessionId, merged);
  }
}

/**
 * Delete a conversation on the server, after any upload already queued for
 * it. Resolves true when the server no longer has it.
 */
export function deleteSessionOnServer(sessionId: string, token: string, gen: number): Promise<boolean> {
  deletedHere.add(sessionId);
  clearUnsent(sessionId);
  clearRenamePending(sessionId);
  return enqueue(sessionId, async () => {
    if (!isCurrentGeneration(gen)) return false;
    try {
      const res = await trackRequest(() => fetch(`${apiUrl()}/chat/sessions/${encodeURIComponent(sessionId)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      }));
      if (!isCurrentGeneration(gen)) return false;
      // 404: the server no longer has it, already deleted.
      const gone = res.ok || res.status === 404;
      if (gone) {
        unmarkServerConfirmed(sessionId);
        dropSessionLocalMeta(sessionId);
      } else {
        deletedHere.delete(sessionId);
      }
      return gone;
    } catch {
      deletedHere.delete(sessionId);
      return false;
    }
  });
}

/**
 * Call with the current account generation when the chat opens. Deletion
 * marks survive leaving and reopening the chat (a delete may still be
 * running) and are forgotten only when the account changed.
 */
let boundGeneration: number | null = null;
export function bindChatSyncToAccount(generation: number) {
  if (boundGeneration !== null && boundGeneration !== generation) deletedHere.clear();
  boundGeneration = generation;
}

// ─── Reconciliation ────────────────────────────────────────────────────────

/** The server could not be reached or answered with an error. */
export class ChatSyncUnavailable extends Error {
  constructor() {
    super("Chat history could not be reconciled with the server.");
    this.name = "ChatSyncUnavailable";
  }
}
