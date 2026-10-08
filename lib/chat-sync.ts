// Chat history: the device cache and its sync with the server.
//
// localStorage is the cache; the server is the source of truth. The chat
// page saves locally first (instant render) and then uploads. Devices that
// come online later read the server's copy.
//
// The server merges every upload into its copy by message id, atomically
// (a row lock and a revision number), so an upload never erases a turn
// another device wrote, even one written in the same instant. Its reply
// carries the merged transcript, which this device takes into its cache.
// Rules on this side:
//  1. An upload names the revision this device last saw (`base_revision`)
//     and, for a conversation the server held before, `expect_existing`, so
//     one deleted on another device is never recreated.
//  2. Until the server has reported a revision for a conversation (a server
//     from before the merge), an upload first reads the server's copy and
//     sends the union, as before.
//  3. Nothing is uploaded until this device has reconciled with the server
//     at least once for the signed-in account (syncSessionsFromServer). If
//     that fails (offline, server error), writes stay local and are marked
//     unsent; they go up after the next successful reconciliation.
// Writes for one conversation (uploads and its deletion) run one after
// another in the order they were made.

import { mergeMessages, sameTranscript } from "./chat-merge";
import { withSoulBackfill } from "./chat-soul";
import { accountKey, getAuthGeneration, isCurrentGeneration, onAccountSignOut, StaleAccountError } from "./account-session";
import { trackRequest } from "./api";
import type { CrisisCardData } from "./crisis-card";

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
  // The fixed crisis or support card (lib/crisis-card.ts), drawn as a card
  // with call and text buttons. `content` keeps its plain text.
  crisis?: CrisisCardData;
  // "crisis" on both messages of a crisis turn (the member's message and
  // the fixed card). The transcript stays the member's own record, but a
  // tagged turn is never sent back to the AI (the server drops it and tags
  // synced transcripts itself too).
  safety?: "crisis";
}

export interface StoredSession<M extends ChatMessage = ChatMessage> {
  sessionId: string;
  date: string;
  customName?: string;
  messages: M[];
}

const apiUrl = () => (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").trim();

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
function clearUnsent(id: string) {
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
function clearRenamePending(id: string) {
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

// Conversations started on this device in this app session and not yet
// stored on the server (in memory: after a reload the first upload simply
// reads first, as for any conversation without a known revision).
const startedHere = new Set<string>();

/** A new conversation was just started here (the chat page's new id). */
export function noteNewSession(sessionId: string): void {
  startedHere.add(sessionId);
}

// Messages whose /chat outcome is not known yet ("pending"), and messages
// the server refused or the member withdrew ("refused"): kept out of every
// upload, so a refused message can never come back through the server's
// merged transcript (Codex out7-5 #2, out8-5 #2).
//
// The status is stored with the cached conversations (same account-scoped
// storage), not only in memory: leaving Chat or closing the app while a
// message is on its way must not make it uploadable. A pending message
// whose request is no longer running in this app session (the app was
// closed, or the answer never came back) is "interrupted": it stays on
// this device, visible, out of every upload, until it is resolved by
//  - the member sending it again (it is replaced by the new message),
//  - the member removing it (then it counts as withdrawn: refused), or
//  - the server's transcript holding it already (it was uploaded before).
// A refused one stays out for good.
const MSG_STATUS_KEY = "solray_chat_msg_status";
const MSG_STATUS_MAX = 500;
type StoredStatus = { st: "pending" | "refused"; at: number };
type StatusMap = Record<string, StoredStatus>;

// Requests running in this app session (memory: gone after a restart, which
// is what turns a stored "pending" into "interrupted").
const inFlightIds = new Set<string>();
// Mirror for storage that cannot be written (private mode, quota): the
// statuses still hold for this app session.
const memStatus = new Map<string, StoredStatus>();

function readStatuses(): StatusMap {
  const out: StatusMap = {};
  try {
    const raw = JSON.parse(localStorage.getItem(accountKey(MSG_STATUS_KEY)) || "{}");
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
        const s = v as Partial<StoredStatus> | null;
        if (s && (s.st === "pending" || s.st === "refused")) out[id] = { st: s.st, at: typeof s.at === "number" ? s.at : 0 };
      }
    }
  } catch { /* the memory mirror below */ }
  for (const [id, s] of Array.from(memStatus.entries())) if (!(id in out)) out[id] = s;
  return out;
}

/** Fired (window event) when a message's status changes (sent, answered,
 *  refused, released as interrupted, resolved), so an open Chat page
 *  redraws its notes and buttons, also for a send that started on a page
 *  since left. Bound to the account whose statuses changed. */
export const CHAT_STATUS_EVENT = "solray:chat-msg-status";

function announceStatus(): void {
  try {
    window.dispatchEvent(new CustomEvent(CHAT_STATUS_EVENT, {
      detail: { key: accountKey(MSG_STATUS_KEY), generation: getAuthGeneration() },
    }));
  } catch { /* no window (tests without one) */ }
}

/** Whether a status event concerns the account signed in now. */
export function isOwnStatusEvent(e: Event): boolean {
  const d = (e as CustomEvent).detail as { key?: unknown; generation?: unknown } | undefined;
  return !!d && d.key === accountKey(MSG_STATUS_KEY)
    && typeof d.generation === "number" && isCurrentGeneration(d.generation);
}

function writeStatus(id: string, status: StoredStatus | null): void {
  writeStatusQuiet(id, status);
  announceStatus();
}

function writeStatusQuiet(id: string, status: StoredStatus | null): void {
  if (status) memStatus.set(id, status); else memStatus.delete(id);
  try {
    const all = readStatuses();
    if (status) all[id] = status; else delete all[id];
    let ids = Object.keys(all);
    if (ids.length > MSG_STATUS_MAX) {
      // The oldest go first.
      ids = ids.sort((a, b) => all[a].at - all[b].at).slice(ids.length - MSG_STATUS_MAX);
      const kept: StatusMap = {};
      for (const k of ids) kept[k] = all[k];
      localStorage.setItem(accountKey(MSG_STATUS_KEY), JSON.stringify(kept));
      return;
    }
    localStorage.setItem(accountKey(MSG_STATUS_KEY), JSON.stringify(all));
  } catch { /* memory mirror holds it */ }
}

/** A message was just sent to /chat: not uploaded until it settles. */
export function markMessagePending(id: string): void {
  inFlightIds.add(id);
  writeStatus(id, { st: "pending", at: Date.now() });
}

/** Its outcome is known: uploaded from now on, unless it was refused (or
 *  had been refused already: a refusal is never undone). */
export function settleMessage(id: string, refused = false): void {
  inFlightIds.delete(id);
  const cur = readStatuses()[id];
  if (refused) writeStatus(id, { st: "refused", at: Date.now() });
  else if (cur?.st !== "refused") writeStatus(id, null);
}

/** The request is no longer running but its outcome was never shown to
 *  the member (they left Chat, or it failed out of sight): the message
 *  stays out of uploads as an interrupted turn, to be sent again. */
export function releaseMessage(id: string): void {
  if (inFlightIds.delete(id)) announceStatus();
}

/** The member sent an interrupted message again (a new message replaces
 *  it) or the server already holds it: it no longer needs a status. */
export function forgetMessage(id: string): void {
  inFlightIds.delete(id);
  const cur = readStatuses()[id];
  if (cur?.st === "pending") writeStatus(id, null);
}

/**
 * The life of one message sent to /chat, the same for every path that sends
 * one (an ordinary send, the "Go deeper" question, a Dynamics opening), so
 * they cannot drift apart (Codex out12-5 #1):
 *  - begun before the message is shown or saved: pending, never uploaded;
 *  - `answered()` when /chat answers: part of the transcript from then on;
 *  - `refused()` on a length refusal: never uploaded, whatever happens next;
 *  - `finish(visible)` in a finally block: a message neither answered nor
 *    refused failed. Shown failing in its open conversation it joins the
 *    transcript (the error note follows it); out of sight it stays out of
 *    uploads as an interrupted message, kept, with Send again.
 */
export interface SendLifecycle {
  readonly id: string;
  readonly settled: boolean;
  answered(): void;
  refused(): void;
  finish(visible: boolean): void;
}

export function beginSend(id: string): SendLifecycle {
  markMessagePending(id);
  let settled = false;
  return {
    id,
    get settled() { return settled; },
    answered() { if (settled) return; settled = true; settleMessage(id); },
    refused() { settled = true; settleMessage(id, true); },
    finish(visible: boolean) {
      if (settled) return;
      settled = true;
      if (visible) settleMessage(id); else releaseMessage(id);
    },
  };
}

export type MessageStatus = "sending" | "interrupted" | "refused";

/** The status of every marked message, for drawing the transcript. */
export function messageStatuses(): Record<string, MessageStatus> {
  const out: Record<string, MessageStatus> = {};
  for (const [id, s] of Object.entries(readStatuses())) {
    out[id] = s.st === "refused" ? "refused" : inFlightIds.has(id) ? "sending" : "interrupted";
  }
  return out;
}

/** The messages of a transcript that may go to the server. */
export function uploadableMessages<T extends { id: string }>(messages: T[]): T[] {
  const statuses = readStatuses();
  if (Object.keys(statuses).length === 0) return messages;
  return messages.filter((m) => !(m.id in statuses));
}

/** The messages this device still owes the server: everything except
 *  refused and interrupted ones (a message still on its way is owed: it
 *  goes up once answered, so its conversation stays marked unsent). */
function owedMessages<T extends { id: string }>(messages: T[]): T[] {
  const statuses = readStatuses();
  if (Object.keys(statuses).length === 0) return messages;
  return messages.filter((m) => {
    const s = statuses[m.id];
    return !s || (s.st === "pending" && inFlightIds.has(m.id));
  });
}

/** The server's transcript holds these messages: an interrupted one among
 *  them was uploaded before (an older build, another device), so it is
 *  part of the transcript and no longer waits on this device. */
function resolveFromServer(serverMessages: Array<{ id?: unknown }>): void {
  const statuses = readStatuses();
  if (Object.keys(statuses).length === 0) return;
  for (const m of serverMessages) {
    const id = typeof m?.id === "string" ? m.id : null;
    if (id && statuses[id]?.st === "pending" && !inFlightIds.has(id)) writeStatus(id, null);
  }
}

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
