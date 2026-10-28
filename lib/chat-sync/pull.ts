import { mergeMessages, sameTranscript } from "../chat-merge";
import { withSoulBackfill } from "../chat-soul";
import { isCurrentGeneration, StaleAccountError } from "../account-session";
import { trackRequest } from "../api";
import { ChatSyncUnavailable, pushSessionToServer } from "./push";
import { getPendingRenames, setSessionLocalMeta, deletedHere, dropSessionLocalMeta, unmarkServerConfirmed, clearUnsent, clearRenamePending, getLocalMeta, markUnsent, getUnsent, markServerConfirmed, getServerConfirmed } from "./marks";
import { loadSession, type ChatMessage, saveSession, type StoredSession, apiUrl, removeCachedSession, saveSessionIds, getSessionIds } from "./store";
import { resolveFromServer, owedMessages } from "./status";

// One-time migration flag: after the first sync where local-only sessions
// are pushed to the server, this device is marked as migrated. Later syncs
// treat a confirmed local session missing from the server as deleted on
// another device and remove it here.
const MIGRATION_FLAG = "solray_chat_migrated_v1";

type RemoteEntry = { session_id: string; last_message_at: string | null; revision?: number };

// The list is read in pages until the server stops handing out a cursor. A
// server from before paging answers one page (its newest 100) and no cursor;
// the per-conversation check below covers what that page leaves out.
const LIST_PAGE_SIZE = 200;
const MAX_LIST_PAGES = 50;

async function readServerInventory(base: string, headers: Record<string, string>, live: () => void): Promise<RemoteEntry[]> {
  const out: RemoteEntry[] = [];
  const seen = new Set<string>();
  const cursors = new Set<string>();
  let cursor: string | null = null;
  for (let page = 0; page < MAX_LIST_PAGES; page++) {
    const q: string = `limit=${LIST_PAGE_SIZE}` + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : "");
    const listJson: { sessions?: unknown; next_cursor?: unknown } | null = await trackRequest(async () => {
      const listRes: Response = await fetch(`${base}/chat/sessions?${q}`, { headers });
      live();
      if (!listRes.ok) throw new ChatSyncUnavailable();
      return listRes.json();
    });
    live();
    const rows: unknown[] = Array.isArray(listJson?.sessions) ? listJson.sessions : [];
    for (const r of rows) {
      const e = r as RemoteEntry;
      if (!e || typeof e.session_id !== "string" || seen.has(e.session_id)) continue;
      seen.add(e.session_id);
      out.push(e);
    }
    const next: string | null = typeof listJson?.next_cursor === "string" && listJson.next_cursor ? listJson.next_cursor : null;
    if (!next || cursors.has(next)) return out;
    cursors.add(next);
    cursor = next;
  }
  // Absurdly long history: what was read stands; anything not seen is
  // checked one by one before it could be dropped.
  return out;
}

/** The server's answer for one conversation: its copy, "gone" only on the
 *  server's own not-found answer, or "unknown" (offline, error, a 404 from
 *  something in between). */
async function readServerSession(
  base: string, headers: Record<string, string>, sessionId: string, live: () => void,
): Promise<{ kind: "found"; full: Record<string, unknown> } | { kind: "gone" } | { kind: "unknown" }> {
  try {
    return await trackRequest(async () => {
      const res = await fetch(`${base}/chat/sessions/${encodeURIComponent(sessionId)}`, { headers });
      live();
      const body = await res.json().catch(() => null);
      live();
      if (res.ok && body && typeof body === "object") return { kind: "found" as const, full: body as Record<string, unknown> };
      if (res.status === 404 && body && typeof body === "object" && (body as { detail?: unknown }).detail === "Session not found") {
        return { kind: "gone" as const };
      }
      return { kind: "unknown" as const };
    });
  } catch (e) {
    if (e instanceof StaleAccountError) throw e;
    return { kind: "unknown" };
  }
}

/** The conversation name after taking the server's copy. A name the server
 *  sends (or an explicit null: cleared on another device) wins, unless this
 *  device renamed the conversation and the server has not taken it yet (a
 *  rename made here and not uploaded is newer). Unsent turns alone do not
 *  count: they say nothing about the name. Only when the server leaves the
 *  field out is the local name kept. */
function serverName(sessionId: string, full: Record<string, unknown>, localName: string | undefined): string | undefined {
  if (!("custom_name" in full) || getPendingRenames().has(sessionId)) return localName || undefined;
  return typeof full.custom_name === "string" && full.custom_name ? full.custom_name : undefined;
}

/** Take the server's copy of one conversation into the cache, keeping turns
 *  only this device has. Returns true when this device still has turns the
 *  server lacks. */
function storeServerCopy(sessionId: string, full: Record<string, unknown>): boolean {
  const local = loadSession(sessionId);
  const serverMsgs: ChatMessage[] = Array.isArray(full.messages) ? full.messages as ChatMessage[] : [];
  resolveFromServer(serverMsgs);
  const merged = mergeMessages(serverMsgs, local?.messages || []);
  // A copy read from the server never pushes other cached copies out (they
  // would only be read back on the next sync): when storage is full it is
  // kept in memory.
  saveSession({
    sessionId: typeof full.session_id === "string" && full.session_id ? full.session_id : sessionId,
    date: (typeof full.date_label === "string" && full.date_label) || local?.date || "",
    customName: serverName(sessionId, full, local?.customName),
    messages: merged,
  }, { evict: false });
  if (typeof full.last_message_at === "string" && full.last_message_at) {
    setSessionLocalMeta(sessionId, full.last_message_at, typeof full.revision === "number" ? full.revision : undefined);
  }
  // An interrupted or refused message kept here is not owed to the server.
  return !sameTranscript(mergeMessages(serverMsgs, owedMessages(merged)), serverMsgs);
}

/**
 * Read one conversation back from the server into the cache (an evicted
 * one being opened from History). "found" with the transcript, "gone" when
 * the server no longer has it (deleted on another device: forgotten here
 * too), "failed" when the answer is unclear (offline, an error) or the
 * account changed meanwhile.
 */
export async function fetchSessionFromServer(
  sessionId: string, token: string, gen: number,
): Promise<{ kind: "found"; session: StoredSession } | { kind: "gone" } | { kind: "failed" }> {
  if (!isCurrentGeneration(gen)) return { kind: "failed" };
  const live = () => { if (!isCurrentGeneration(gen)) throw new StaleAccountError(); };
  try {
    const got = await readServerSession(apiUrl(), { Authorization: `Bearer ${token}` }, sessionId, live);
    if (!isCurrentGeneration(gen) || deletedHere.has(sessionId)) return { kind: "failed" };
    if (got.kind === "gone") {
      removeCachedSession(sessionId);
      dropSessionLocalMeta(sessionId);
      unmarkServerConfirmed(sessionId);
      clearUnsent(sessionId);
      clearRenamePending(sessionId);
      saveSessionIds(getSessionIds().filter((x) => x !== sessionId));
      return { kind: "gone" };
    }
    if (got.kind !== "found") return { kind: "failed" };
    storeServerCopy(sessionId, got.full);
    const session = loadSession(sessionId);
    return session ? { kind: "found", session } : { kind: "failed" };
  } catch {
    return { kind: "failed" };
  }
}

/**
 * Pull the server's list, reconcile the device cache with it, and upload
 * what only this device has. Resolves the unified id list. Rejects with
 * ChatSyncUnavailable when the server list could not be read (the caller
 * must keep uploads off), or StaleAccountError when the account changed.
 */
export async function syncSessionsFromServer(token: string, gen: number): Promise<string[]> {
  const base = apiUrl();
  const live = () => { if (!isCurrentGeneration(gen)) throw new StaleAccountError(); };
  const headers = { Authorization: `Bearer ${token}` };

  // 1. The whole list, every page (id, last_message_at, revision).
  let remoteSessions: RemoteEntry[];
  try {
    remoteSessions = await readServerInventory(base, headers, live);
  } catch (e) {
    if (e instanceof StaleAccountError) throw e;
    throw new ChatSyncUnavailable();
  }

  const localIds = new Set(getSessionIds());
  const localMeta = getLocalMeta();
  // Conversations opened here as Dynamics readings whose transcript does not
  // name the partner yet (from before transcripts carried it, or started
  // before the saved person was confirmed): written in now and uploaded.
  for (const id of Array.from(localIds)) {
    const s = loadSession(id);
    if (!s) continue;
    const backfilled = withSoulBackfill(id, s.messages || []);
    if (backfilled !== s.messages) {
      saveSession({ ...s, messages: backfilled });
      markUnsent(id);
    }
  }
  const unsent = getUnsent();
  const fetched: string[] = [];

  // 2. Pull each remote session that is new here, newer on the server, or
  //    changed there without a new turn (a rename, a partner reference):
  //    its revision differs from the one this device last saw. Turns only
  //    this device has are kept.
  for (const s of remoteSessions) {
    // Being deleted on this device: never pulled back in.
    if (deletedHere.has(s.session_id)) continue;
    fetched.push(s.session_id);
    const remoteAt = s.last_message_at || "";
    const known = localMeta[s.session_id];
    const localAt = known?.last_message_at || "";
    const revisionChanged = typeof s.revision === "number" && s.revision !== known?.revision;
    const needPull = !localIds.has(s.session_id) || (remoteAt && remoteAt > localAt) || revisionChanged;
    if (!needPull) continue;
    const got = await readServerSession(base, headers, s.session_id, live);
    if (got.kind !== "found") continue;   // retried on the next sync
    // Deleted here while its transcript was on the way: drop the answer.
    if (deletedHere.has(s.session_id)) continue;
    // This device had turns the server lacks: send them up below.
    if (storeServerCopy(s.session_id, got.full)) unsent.add(s.session_id);
  }

  // 3. Local-only sessions. On the first sync on this device they are
  //    history that never reached the server: upload them. After that, a
  //    confirmed session missing from the list is asked for directly: only
  //    the server's own "not found" means it was deleted on another device
  //    and is dropped here. If it is still there (the list moved while it
  //    was read, or a server from before paging), it is kept and synced; if
  //    the answer is unclear, it is kept, unsent turns and all, for the next
  //    sync. A never-confirmed one (its upload failed) is uploaded again,
  //    never deleted.
  const remoteIds = new Set(fetched.filter((id) => !deletedHere.has(id)));
  markServerConfirmed(Array.from(remoteIds));
  const confirmed = getServerConfirmed();
  let migrated = false;
  try { migrated = localStorage.getItem(MIGRATION_FLAG) === "1"; } catch { /* treat as not migrated */ }
  let allUploadsOk = true;
  const toUpload: string[] = [];
  for (const localId of Array.from(localIds)) {
    if (remoteIds.has(localId) || deletedHere.has(localId)) continue;
    if (migrated && confirmed.has(localId)) {
      const got = await readServerSession(base, headers, localId, live);
      if (deletedHere.has(localId)) continue;
      if (got.kind === "gone") {
        removeCachedSession(localId);
        dropSessionLocalMeta(localId);
        unmarkServerConfirmed(localId);
        clearUnsent(localId);
        clearRenamePending(localId);
        continue;
      }
      fetched.push(localId);
      if (got.kind === "found") {
        remoteIds.add(localId);
        if (storeServerCopy(localId, got.full)) unsent.add(localId);
      }
      continue;
    }
    if (loadSession(localId)) { toUpload.push(localId); fetched.push(localId); }
  }
  // Plus server-held conversations with turns not sent yet.
  for (const id of Array.from(unsent)) {
    if (remoteIds.has(id) && !toUpload.includes(id) && loadSession(id)) toUpload.push(id);
  }
  for (const id of toUpload) {
    const local = loadSession(id);
    if (!local) continue;
    const ok = await pushSessionToServer(local, token, gen);
    live();
    if (!ok) allUploadsOk = false;
  }
  if (!migrated && allUploadsOk) {
    try { localStorage.setItem(MIGRATION_FLAG, "1"); } catch { /* retry next sync */ }
  }

  // 4. Conversations started on this device while this sync was reading
  //    (not in the snapshot it began from): kept, and their unsent turns
  //    uploaded now, whether or not Chat is still open to flush them
  //    (Codex out13-5 #1). Never one deleted here meanwhile.
  const fetchedSet = new Set(fetched);
  const addedSince = () => getSessionIds().filter((id) =>
    !localIds.has(id) && !fetchedSet.has(id) && !deletedHere.has(id) && !!loadSession(id));
  const unsentNow = getUnsent();
  for (const id of addedSince()) {
    if (!unsentNow.has(id)) continue;
    const local = loadSession(id);
    if (!local) continue;
    await pushSessionToServer(local, token, gen);
    live();
  }

  // 5. Save the unified id list: what was added meanwhile first (newest),
  //    then server order, without anything deleted here meanwhile
  //    (deletion marks are read now, at the end).
  live();
  const allIds = Array.from(new Set([...addedSince(), ...fetched])).filter((id) => !deletedHere.has(id));
  saveSessionIds(allIds);
  return allIds;
}
