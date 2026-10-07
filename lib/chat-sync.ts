// Chat history: the device cache and its sync with the server.
//
// localStorage is the cache; the server is the source of truth. The chat
// page saves locally first (instant render) and then uploads. Devices that
// come online later read the server's copy.
//
// The server stores a conversation as one transcript that a PUT replaces.
// Two rules keep a replacement from erasing anything:
//  1. Every upload first reads the server's copy and sends the union of it
//     and this device's copy (messages are only ever appended, and each has
//     its own id). A turn another device added meanwhile is kept, and is
//     written into this device's cache too.
//  2. Nothing is uploaded until this device has reconciled with the server
//     at least once for the signed-in account (syncSessionsFromServer). If
//     that fails (offline, server error), writes stay local and are marked
//     unsent; they go up after the next successful reconciliation.
// Writes for one conversation (uploads and its deletion) run one after
// another in the order they were made.
//
// Not covered here: a turn another device writes in the instant between this
// device's read and its write. Closing that needs a revision check on the
// server's PUT (backend).

import { mergeMessages, sameTranscript } from "./chat-merge";
import { isCurrentGeneration, StaleAccountError } from "./account-session";
import { trackRequest } from "./api";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  isError?: boolean;
  // Who a Dynamics conversation is with (set on its opening message), so
  // the conversation keeps its partner on every device. Ids only, never a
  // chart: the server loads and authorises the chart itself.
  soul?: { name?: string | null; connection_id?: string | null; saved_person_id?: string | null };
}

export interface StoredSession<M extends ChatMessage = ChatMessage> {
  sessionId: string;
  date: string;
  customName?: string;
  messages: M[];
}

const apiUrl = () => (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").trim();

// ─── Device cache ──────────────────────────────────────────────────────────

export function getSessionIds(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem("solray_chat_sessions") || "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function saveSessionIds(ids: string[]) {
  try { localStorage.setItem("solray_chat_sessions", JSON.stringify(ids)); } catch { /* best-effort */ }
}

export function loadSession(sessionId: string): StoredSession | null {
  try {
    const raw = localStorage.getItem(`solray_chat_${sessionId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveSession(session: StoredSession) {
  // Best-effort: quota exhaustion or disabled storage must never break the
  // conversation itself; in-memory state and the server sync still work.
  try {
    localStorage.setItem(`solray_chat_${session.sessionId}`, JSON.stringify(session));
    const ids = getSessionIds();
    if (!ids.includes(session.sessionId)) {
      ids.unshift(session.sessionId);
      saveSessionIds(ids);
    }
  } catch { /* memory + server only */ }
}

// Ids the server has confirmed holding (an upload succeeded, or the id
// showed up in a server list). Sync only drops a local session that is
// missing from the server list when it is in this set; a session whose
// upload failed was never confirmed, so it is re-uploaded, never deleted.
const SERVER_CONFIRMED_KEY = "solray_chat_server_confirmed";

function readSet(key: string): Set<string> {
  try {
    const arr = JSON.parse(localStorage.getItem(key) || "[]");
    return new Set(Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}
function writeSet(key: string, ids: Set<string>) {
  try { localStorage.setItem(key, JSON.stringify(Array.from(ids))); } catch { /* best-effort */ }
}

export function getServerConfirmed(): Set<string> { return readSet(SERVER_CONFIRMED_KEY); }
export function markServerConfirmed(ids: string[]) {
  const set = getServerConfirmed();
  let changed = false;
  for (const id of ids) if (!set.has(id)) { set.add(id); changed = true; }
  if (changed) writeSet(SERVER_CONFIRMED_KEY, set);
}
export function unmarkServerConfirmed(id: string) {
  const set = getServerConfirmed();
  if (set.delete(id)) writeSet(SERVER_CONFIRMED_KEY, set);
}

// Conversations with local writes the server has not taken yet. Survives a
// reload, so turns written offline go up on the next successful sync.
const UNSENT_KEY = "solray_chat_unsent";
export function getUnsent(): Set<string> { return readSet(UNSENT_KEY); }
export function markUnsent(id: string) {
  const set = getUnsent();
  if (!set.has(id)) { set.add(id); writeSet(UNSENT_KEY, set); }
}
function clearUnsent(id: string) {
  const set = getUnsent();
  if (set.delete(id)) writeSet(UNSENT_KEY, set);
}

// Per-session last_message_at as the server reported it, so a sync can
// tell whether the server's copy is newer than this device's.
const SESSION_META_KEY = "solray_chat_session_meta";
type LocalMeta = Record<string, { last_message_at: string }>;

export function getLocalMeta(): LocalMeta {
  try { return JSON.parse(localStorage.getItem(SESSION_META_KEY) || "{}") as LocalMeta; } catch { return {}; }
}
function setLocalMeta(meta: LocalMeta) {
  try { localStorage.setItem(SESSION_META_KEY, JSON.stringify(meta)); } catch { /* ignore quota */ }
}
export function setSessionLocalMeta(sessionId: string, last_message_at: string) {
  const meta = getLocalMeta();
  meta[sessionId] = { last_message_at };
  setLocalMeta(meta);
}
function dropSessionLocalMeta(sessionId: string) {
  const meta = getLocalMeta();
  if (sessionId in meta) { delete meta[sessionId]; setLocalMeta(meta); }
}

// ─── Merged-transcript notifications ───────────────────────────────────────

/** Fired (window event) when an upload pulled in turns from another device. */
export const CHAT_MERGED_EVENT = "solray:chat-merged";

function announceMerged(sessionId: string, messages: ChatMessage[]) {
  try {
    window.dispatchEvent(new CustomEvent(CHAT_MERGED_EVENT, { detail: { sessionId, messages } }));
  } catch { /* no window (tests without one): the cache is already updated */ }
}

// ─── Uploads ───────────────────────────────────────────────────────────────

// Writes for one conversation run one after another.
const chains = new Map<string, Promise<unknown>>();
// Conversations deleted on this device: any upload still queued for one is
// dropped instead of recreating it on the server.
const deletedHere = new Set<string>();

function enqueue<T>(sessionId: string, work: () => Promise<T>): Promise<T> {
  const prev = chains.get(sessionId) || Promise.resolve();
  const next = prev.catch(() => undefined).then(work);
  chains.set(sessionId, next);
  void next.finally(() => {
    if (chains.get(sessionId) === next) chains.delete(sessionId);
  }).catch(() => undefined);
  return next;
}

/** Waits for every queued write of one conversation (tests, deletion). */
export function settled(sessionId: string): Promise<void> {
  return (chains.get(sessionId) || Promise.resolve()).then(() => undefined, () => undefined);
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
  try {
    return await trackRequest(async () => {
      // 1. The server's copy, so this write keeps what other devices added.
      const getRes = await fetch(url, { headers });
      if (!isCurrentGeneration(gen) || deletedHere.has(sessionId)) return false;
      let serverMessages: ChatMessage[] = [];
      if (getRes.status === 404) {
        // Confirmed on the server before and gone now: deleted on another
        // device. Do not bring it back; the next sync drops it here.
        if (getServerConfirmed().has(sessionId)) return false;
      } else if (getRes.ok) {
        const full = await getRes.json();
        if (!isCurrentGeneration(gen) || deletedHere.has(sessionId)) return false;
        serverMessages = Array.isArray(full?.messages) ? full.messages : [];
      } else {
        // Unknown server state: a blind replacement could erase turns.
        return false;
      }

      // Re-read: the member may have written more while the read ran.
      const latest = loadSession(sessionId) || local;
      const merged = mergeMessages(serverMessages, latest.messages || []);
      if (!sameTranscript(merged, latest.messages || [])) {
        saveSession({ ...latest, messages: merged });
        announceMerged(sessionId, merged);
      }

      // 2. Write the union.
      const putRes = await fetch(url, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          session_id: sessionId,
          custom_name: latest.customName || null,
          date_label: latest.date || null,
          messages: merged,
        }),
      });
      if (!isCurrentGeneration(gen)) return false;
      if (!putRes.ok) return false;
      markServerConfirmed([sessionId]);
      // Only clear "unsent" if nothing newer was written while uploading.
      const after = loadSession(sessionId);
      if (!after || sameTranscript(mergeMessages(merged, after.messages || []), merged)) clearUnsent(sessionId);
      const out = await putRes.json().catch(() => ({} as Record<string, string>));
      if (isCurrentGeneration(gen) && out && typeof out.last_message_at === "string") {
        setSessionLocalMeta(sessionId, out.last_message_at);
      }
      return true;
    });
  } catch {
    // Network: the local copy stays and is marked unsent.
    return false;
  }
}

/**
 * Delete a conversation on the server, after any upload already queued for
 * it. Resolves true when the server no longer has it.
 */
export function deleteSessionOnServer(sessionId: string, token: string, gen: number): Promise<boolean> {
  deletedHere.add(sessionId);
  clearUnsent(sessionId);
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

/** The account changed: forget this device's in-memory deletion marks. */
export function resetChatSyncMemory() {
  deletedHere.clear();
}

// ─── Reconciliation ────────────────────────────────────────────────────────

/** The server could not be reached or answered with an error. */
export class ChatSyncUnavailable extends Error {
  constructor() {
    super("Chat history could not be reconciled with the server.");
    this.name = "ChatSyncUnavailable";
  }
}

// One-time migration flag: after the first sync where local-only sessions
// are pushed to the server, this device is marked as migrated. Later syncs
// treat a confirmed local session missing from the server as deleted on
// another device and remove it here.
const MIGRATION_FLAG = "solray_chat_migrated_v1";

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

  // 1. The lightweight list (includes last_message_at).
  let remoteSessions: Array<{ session_id: string; last_message_at: string | null }>;
  try {
    const listJson = await trackRequest(async () => {
      const listRes = await fetch(`${base}/chat/sessions`, { headers });
      live();
      if (!listRes.ok) throw new ChatSyncUnavailable();
      return listRes.json();
    });
    live();
    remoteSessions = Array.isArray(listJson?.sessions) ? listJson.sessions : [];
  } catch (e) {
    if (e instanceof StaleAccountError) throw e;
    throw new ChatSyncUnavailable();
  }

  const localIds = new Set(getSessionIds());
  const localMeta = getLocalMeta();
  const unsent = getUnsent();
  const fetched: string[] = [];

  // 2. Pull each remote session that is new here or newer on the server,
  //    keeping any turns only this device has.
  for (const s of remoteSessions) {
    if (!s || typeof s.session_id !== "string") continue;
    fetched.push(s.session_id);
    const remoteAt = s.last_message_at || "";
    const localAt = localMeta[s.session_id]?.last_message_at || "";
    const needPull = !localIds.has(s.session_id) || (remoteAt && remoteAt > localAt);
    if (!needPull) continue;
    try {
      const full = await trackRequest(async () => {
        const fullRes = await fetch(`${base}/chat/sessions/${encodeURIComponent(s.session_id)}`, { headers });
        live();
        return fullRes.ok ? fullRes.json() : null;
      });
      live();
      if (!full) continue;
      const local = loadSession(s.session_id);
      const serverMsgs: ChatMessage[] = Array.isArray(full.messages) ? full.messages : [];
      const merged = mergeMessages(serverMsgs, local?.messages || []);
      saveSession({
        sessionId: full.session_id || s.session_id,
        date: full.date_label || local?.date || "",
        customName: full.custom_name || local?.customName || undefined,
        messages: merged,
      });
      if (full.last_message_at) setSessionLocalMeta(s.session_id, full.last_message_at);
      // This device had turns the server lacks: send them up below.
      if (!sameTranscript(merged, serverMsgs)) unsent.add(s.session_id);
    } catch (e) {
      if (e instanceof StaleAccountError) throw e;
      /* skip; retried on the next sync */
    }
  }

  // 3. Local-only sessions. On the first sync on this device they are
  //    history that never reached the server: upload them. After that, a
  //    confirmed session missing from the server was deleted on another
  //    device: drop it here. A never-confirmed one (its upload failed) is
  //    uploaded again, never deleted.
  const remoteIds = new Set(fetched);
  markServerConfirmed(Array.from(remoteIds));
  const confirmed = getServerConfirmed();
  let migrated = false;
  try { migrated = localStorage.getItem(MIGRATION_FLAG) === "1"; } catch { /* treat as not migrated */ }
  let allUploadsOk = true;
  const toUpload: string[] = [];
  for (const localId of Array.from(localIds)) {
    if (remoteIds.has(localId)) continue;
    if (migrated && confirmed.has(localId)) {
      try { localStorage.removeItem(`solray_chat_${localId}`); } catch { /* ignore */ }
      dropSessionLocalMeta(localId);
      unmarkServerConfirmed(localId);
      clearUnsent(localId);
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

  // 4. Save the unified id list, server order first.
  const allIds = Array.from(new Set(fetched));
  live();
  saveSessionIds(allIds);
  return allIds;
}
