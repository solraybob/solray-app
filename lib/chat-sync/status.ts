import { accountKey, getAuthGeneration, isCurrentGeneration } from "../account-session";

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

export function readStatuses(): StatusMap {
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
export function owedMessages<T extends { id: string }>(messages: T[]): T[] {
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
export function resolveFromServer(serverMessages: Array<{ id?: unknown }>): void {
  const statuses = readStatuses();
  if (Object.keys(statuses).length === 0) return;
  for (const m of serverMessages) {
    const id = typeof m?.id === "string" ? m.id : null;
    if (id && statuses[id]?.st === "pending" && !inFlightIds.has(id)) writeStatus(id, null);
  }
}
