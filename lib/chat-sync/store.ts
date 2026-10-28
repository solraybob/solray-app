import { accountKey, onAccountSignOut } from "../account-session";
import { getUnsent, getPendingRenames, getServerConfirmed, deletedHere, dropSessionLocalMeta } from "./marks";
import { readStatuses } from "./status";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  isError?: boolean;
  // Who a Dynamics conversation is with (set on its opening message), so
  // the conversation keeps its partner on every device. Ids only, never a
  // chart: the server loads and authorises the chart itself.
  soul?: {
    name?: string | null; connection_id?: string | null; saved_person_id?: string | null;
    // A family reading: everyone else in it, by reference.
    family?: Array<{ name?: string | null; connection_id?: string | null; saved_person_id?: string | null }>;
  };
  // Older transcripts may still carry fields this app no longer reads (a
  // card payload or a tag on a message). They are left as they are: every
  // message is drawn from its plain `content`.
}

export interface StoredSession<M extends ChatMessage = ChatMessage> {
  sessionId: string;
  date: string;
  customName?: string;
  messages: M[];
}

export const apiUrl = () => (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").trim();

// ─── Device cache ──────────────────────────────────────────────────────────

// Transcripts (and the id list) whose newest write could not be stored
// (quota exhausted, storage disabled): kept here, by their account-scoped
// key, and read before storage, so the open conversation and every queued
// upload still see the newest turns (Codex out11-5 #1). An entry is dropped
// as soon as a write of it reaches storage again. Keys carry the account,
// and everything is forgotten when an account signs out.
const memTranscripts = new Map<string, StoredSession>();
const memSessionIds = new Map<string, string[]>();
onAccountSignOut(() => { memTranscripts.clear(); memSessionIds.clear(); });

const transcriptKey = (sessionId: string) => accountKey(`solray_chat_${sessionId}`);

export function getSessionIds(): string[] {
  const mem = memSessionIds.get(accountKey("solray_chat_sessions"));
  if (mem) return [...mem];
  try {
    const v = JSON.parse(localStorage.getItem(accountKey("solray_chat_sessions")) || "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function saveSessionIds(ids: string[]) {
  const key = accountKey("solray_chat_sessions");
  try {
    localStorage.setItem(key, JSON.stringify(ids));
    memSessionIds.delete(key);
  } catch {
    memSessionIds.set(key, [...ids]);
  }
}

export function loadSession(sessionId: string): StoredSession | null {
  const key = transcriptKey(sessionId);
  const mem = memTranscripts.get(key);
  if (mem) return mem;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Write one transcript (memory first, then storage), without touching the
 *  id list. With `evict`, a full storage first frees space it can rebuild
 *  (freeStorageSpace) and tries once more. Returns true when stored. */
export function storeTranscript(session: StoredSession, opts: { evict?: boolean } = {}): boolean {
  const key = transcriptKey(session.sessionId);
  // A whole copy again (memory or storage): no longer only a summary.
  clearEvicted(session.sessionId);
  // Memory first: whatever happens to storage, the newest copy is readable.
  memTranscripts.set(key, session);
  const raw = JSON.stringify(session);
  const attempt = () => {
    try {
      localStorage.setItem(key, raw);
      memTranscripts.delete(key);
      return true;
    } catch {
      return false;
    }
  };
  if (attempt()) return true;
  if (opts.evict === false) return false;
  return freeStorageSpace(session.sessionId, attempt);
}

/** Forget one cached transcript (memory and storage). */
export function removeCachedSession(sessionId: string): void {
  clearEvicted(sessionId);
  const key = transcriptKey(sessionId);
  memTranscripts.delete(key);
  try { localStorage.removeItem(key); } catch { /* gone is gone */ }
}

// ─── Conversations evicted from the device cache ─────────────────────────
//
// A transcript freed to make room (freeStorageSpace) is on the server whole.
// History keeps listing it from a small summary; opening it reads it back
// from the server (fetchSessionFromServer). Account-scoped, with the same
// memory fallback as the other sync records.
const EVICTED_KEY = "solray_chat_evicted";
export interface EvictedSummary { customName?: string; date: string; preview: string; updatedAt: string }
const memEvicted = new Map<string, Record<string, EvictedSummary>>();
onAccountSignOut(() => { memEvicted.clear(); });

function readEvicted(): Record<string, EvictedSummary> {
  const k = accountKey(EVICTED_KEY);
  const mem = memEvicted.get(k);
  if (mem) return { ...mem };
  try {
    const v = JSON.parse(localStorage.getItem(k) || "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, EvictedSummary> : {};
  } catch {
    return {};
  }
}
function writeEvicted(all: Record<string, EvictedSummary>): void {
  const k = accountKey(EVICTED_KEY);
  try {
    localStorage.setItem(k, JSON.stringify(all));
    memEvicted.delete(k);
  } catch {
    memEvicted.set(k, { ...all });
  }
}
function noteEvicted(session: StoredSession): void {
  const msgs = session.messages || [];
  const all = readEvicted();
  all[session.sessionId] = {
    ...(session.customName ? { customName: session.customName } : {}),
    date: session.date || "",
    preview: (msgs.find((m) => m.role === "user")?.content || "").slice(0, 160),
    updatedAt: msgs.length ? msgs[msgs.length - 1].timestamp : "",
  };
  writeEvicted(all);
}
function clearEvicted(sessionId: string): void {
  const all = readEvicted();
  if (sessionId in all) { delete all[sessionId]; writeEvicted(all); }
}

/** The summary History shows for a conversation evicted from this device. */
export function getEvictedSummary(sessionId: string): EvictedSummary | null {
  return readEvicted()[sessionId] || null;
}

/** Put a summary back (a failed delete of an evicted conversation). */
export function restoreEvicted(sessionId: string, summary: EvictedSummary): void {
  const all = readEvicted();
  all[sessionId] = summary;
  writeEvicted(all);
}

/** One History row: the cached transcript, or the summary of one evicted
 *  from this device (`evicted` set, `messages` empty until it is opened). */
export type HistoryEntry = StoredSession & { evicted?: EvictedSummary };

export function historySessions(): HistoryEntry[] {
  const out: HistoryEntry[] = [];
  for (const id of getSessionIds()) {
    const s = loadSession(id);
    if (s) { out.push(s); continue; }
    const e = getEvictedSummary(id);
    if (e) out.push({ sessionId: id, date: e.date, customName: e.customName, messages: [], evicted: e });
  }
  return out;
}

export function saveSession(session: StoredSession, opts: { evict?: boolean } = {}) {
  // Best-effort storage: quota exhaustion or disabled storage must never
  // break the conversation itself or its upload (memory holds the newest).
  storeTranscript(session, opts);
  const ids = getSessionIds();
  if (!ids.includes(session.sessionId)) {
    ids.unshift(session.sessionId);
    saveSessionIds(ids);
  }
}

/**
 * Storage is full. Frees only what can be rebuilt, retrying the write after
 * each step, and stops as soon as it fits:
 *  1. this account's daily forecast and week caches from before yesterday
 *     (dated copies the app never reads again; today's are kept);
 *  2. this account's oldest cached transcripts that the server already holds
 *     whole: confirmed there, nothing unsent, no rename waiting, no message
 *     kept only here (pending, interrupted, refused), not being deleted, and
 *     not the one being written. Their sync record is dropped too, so the
 *     next sync reads them back from the server (into memory if storage is
 *     still full). At most eight per write.
 * Nothing else is touched: charts, other members' namespaces and anything
 * not yet on the server stay.
 */
const EVICT_MAX_TRANSCRIPTS = 8;
function freeStorageSpace(writingId: string, retry: () => boolean): boolean {
  try {
    const now = new Date();
    const y = new Date(now.getTime() - 86_400_000);
    const pad = (n: number) => String(n).padStart(2, "0");
    const localY = `${y.getFullYear()}-${pad(y.getMonth() + 1)}-${pad(y.getDate())}`;
    const utcY = y.toISOString().split("T")[0];
    const cutoff = localY < utcY ? localY : utcY;
    const suffix = accountKey("");
    const stale: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.endsWith(suffix)) continue;
      const base = k.slice(0, k.length - suffix.length);
      const m = /^solray_(?:forecast|week_[a-z]+)_(\d{4}-\d{2}-\d{2})$/.exec(base);
      if (m && m[1] < cutoff) stale.push(k);
    }
    for (const k of stale) { try { localStorage.removeItem(k); } catch { /* ignore */ } }
    if (stale.length && retry()) return true;
  } catch { /* storage unreadable: nothing to free */ }

  const unsent = getUnsent();
  const renames = getPendingRenames();
  const confirmed = getServerConfirmed();
  const statuses = readStatuses();
  const ids = getSessionIds();
  let evicted = 0;
  // The list runs newest first: the oldest are at its end.
  for (let i = ids.length - 1; i >= 0 && evicted < EVICT_MAX_TRANSCRIPTS; i--) {
    const id = ids[i];
    if (id === writingId || !confirmed.has(id) || unsent.has(id) || renames.has(id) || deletedHere.has(id)) continue;
    const key = transcriptKey(id);
    if (memTranscripts.has(key)) continue;   // its newest copy is not in storage
    let held: StoredSession | null = null;
    try { const raw = localStorage.getItem(key); held = raw ? JSON.parse(raw) : null; } catch { held = null; }
    if (!held) continue;
    if ((held.messages || []).some((m) => m && m.id in statuses)) continue;
    try { localStorage.removeItem(key); } catch { continue; }
    // Still listed in History: its name, date and first line stay here
    // (a few bytes), and opening it reads it back from the server.
    noteEvicted(held);
    dropSessionLocalMeta(id);
    evicted++;
    if (retry()) return true;
  }
  return false;
}
