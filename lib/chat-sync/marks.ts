import { accountKey, onAccountSignOut } from "../account-session";
import { type ChatMessage } from "./store";

// Ids the server has confirmed holding (an upload succeeded, or the id
// showed up in a server list). Sync only drops a local session that is
// missing from the server list when it is in this set; a session whose
// upload failed was never confirmed, so it is re-uploaded, never deleted.
const SERVER_CONFIRMED_KEY = "solray_chat_server_confirmed";

// Same rule for the small sync records (unsent, confirmed, renames): a
// write storage refuses is kept in memory for this app session.
const memSets = new Map<string, string[]>();
onAccountSignOut(() => { memSets.clear(); });

function readSet(key: string): Set<string> {
  const mem = memSets.get(accountKey(key));
  if (mem) return new Set(mem);
  try {
    const arr = JSON.parse(localStorage.getItem(accountKey(key)) || "[]");
    return new Set(Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}
function writeSet(key: string, ids: Set<string>) {
  const k = accountKey(key);
  try {
    localStorage.setItem(k, JSON.stringify(Array.from(ids)));
    memSets.delete(k);
  } catch {
    memSets.set(k, Array.from(ids));
  }
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
export function clearUnsent(id: string) {
  const set = getUnsent();
  if (set.delete(id)) writeSet(UNSENT_KEY, set);
}

// Conversations renamed (or cleared) on this device and not yet taken by
// the server. Kept apart from unsent turns: turns written offline say
// nothing about the name, so they must never hold on to a name another
// device has since changed or cleared. Only a rename made here does.
const PENDING_RENAME_KEY = "solray_chat_pending_rename";
export function getPendingRenames(): Set<string> { return readSet(PENDING_RENAME_KEY); }
export function markRenamePending(id: string) {
  const set = getPendingRenames();
  if (!set.has(id)) { set.add(id); writeSet(PENDING_RENAME_KEY, set); }
}
export function clearRenamePending(id: string) {
  const set = getPendingRenames();
  if (set.delete(id)) writeSet(PENDING_RENAME_KEY, set);
}

// Per-session last_message_at as the server reported it, so a sync can
// tell whether the server's copy is newer than this device's.
const SESSION_META_KEY = "solray_chat_session_meta";
type LocalMeta = Record<string, { last_message_at: string; revision?: number }>;

export function getLocalMeta(): LocalMeta {
  try { return JSON.parse(localStorage.getItem(accountKey(SESSION_META_KEY)) || "{}") as LocalMeta; } catch { return {}; }
}
function setLocalMeta(meta: LocalMeta) {
  try { localStorage.setItem(accountKey(SESSION_META_KEY), JSON.stringify(meta)); } catch { /* ignore quota */ }
}
export function setSessionLocalMeta(sessionId: string, last_message_at: string, revision?: number) {
  const meta = getLocalMeta();
  const prev = meta[sessionId];
  const rev = typeof revision === "number" ? revision : prev?.revision;
  meta[sessionId] = typeof rev === "number" ? { last_message_at, revision: rev } : { last_message_at };
  setLocalMeta(meta);
}
export function dropSessionLocalMeta(sessionId: string) {
  const meta = getLocalMeta();
  if (sessionId in meta) { delete meta[sessionId]; setLocalMeta(meta); }
}

// ─── Merged-transcript notifications ───────────────────────────────────────

/** Fired (window event) when an upload pulled in turns from another device. */
export const CHAT_MERGED_EVENT = "solray:chat-merged";

export function announceMerged(sessionId: string, messages: ChatMessage[]) {
  try {
    window.dispatchEvent(new CustomEvent(CHAT_MERGED_EVENT, { detail: { sessionId, messages } }));
  } catch { /* no window (tests without one): the cache is already updated */ }
}

// ─── Uploads ───────────────────────────────────────────────────────────────

// Writes for one conversation run one after another.
const chains = new Map<string, Promise<unknown>>();
// Conversations deleted on this device: any upload still queued for one is
// dropped instead of recreating it on the server.
export const deletedHere = new Set<string>();

export function enqueue<T>(sessionId: string, work: () => Promise<T>): Promise<T> {
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

// Conversations started on this device in this app session and not yet
// stored on the server (in memory: after a reload the first upload simply
// reads first, as for any conversation without a known revision).
export const startedHere = new Set<string>();

/** A new conversation was just started here (the chat page's new id). */
export function noteNewSession(sessionId: string): void {
  startedHere.add(sessionId);
}
