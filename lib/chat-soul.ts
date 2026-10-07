// Who a Dynamics conversation is with, per conversation, on this device, and
// how that reference reaches the transcript (so other devices have it too).
//
// The chat page keeps each conversation's partner here when it opens a
// Dynamics reading: a soul connection id, a saved person's id once the
// server has confirmed that person, or (for a reading started before the
// confirmation) the person's local id, resolved later. Transcripts whose
// opening message does not name the partner yet (conversations from before
// the transcript carried it, or started before the person was confirmed)
// get it written in before they are uploaded (withSoulBackfill), and the
// server keeps it (it adds fields its copy lacks).

import { soulFromTranscript } from "./oracle-request";

export const SOUL_CTX_KEY = "solray_chat_soul_ctx";
const SAVED_PEOPLE_KEY = "solray_saved_people";

export type SoulCtx = {
  name: string | null;
  blueprint: Record<string, unknown> | null;
  // Who the Dynamics reading is with; the server loads the chart (A14).
  connectionId?: string | null;
  savedPersonId?: string | null;
  // A saved person not yet confirmed by the server when the reading began.
  localPersonId?: string | null;
};

export type TranscriptSoul = { name: string | null; connection_id: string | null; saved_person_id: string | null };

function readAll(): Record<string, SoulCtx> {
  try {
    const v = JSON.parse(localStorage.getItem(SOUL_CTX_KEY) || "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, SoulCtx> : {};
  } catch {
    return {};
  }
}

export function readSoulCtx(sessionId: string): SoulCtx | null {
  return readAll()[sessionId] || null;
}

export function writeSoulCtx(sessionId: string, ctx: SoulCtx | null): void {
  try {
    const all = readAll();
    if (ctx) all[sessionId] = ctx; else delete all[sessionId];
    localStorage.setItem(SOUL_CTX_KEY, JSON.stringify(all));
  } catch { /* best-effort */ }
}

/** The server-confirmed id of a saved person kept on this device, if any. */
export function confirmedSavedPersonId(localId: string | null | undefined): string | null {
  if (!localId) return null;
  try {
    const people = JSON.parse(localStorage.getItem(SAVED_PEOPLE_KEY) || "[]");
    if (!Array.isArray(people)) return null;
    const p = people.find((x) => x && x.id === localId);
    return p && p._synced === true && typeof p.id === "string" ? p.id : null;
  } catch {
    return null;
  }
}

/** The context with a saved person's confirmed id filled in when known by now. */
export function resolveSoulCtx(sc: SoulCtx | null): SoulCtx | null {
  if (!sc || sc.connectionId || sc.savedPersonId || !sc.localPersonId) return sc;
  const id = confirmedSavedPersonId(sc.localPersonId);
  return id ? { ...sc, savedPersonId: id } : sc;
}

export function transcriptSoulOf(sc: SoulCtx | null): TranscriptSoul | null {
  if (!sc || (!sc.connectionId && !sc.savedPersonId)) return null;
  return { name: sc.name ?? null, connection_id: sc.connectionId ?? null, saved_person_id: sc.savedPersonId ?? null };
}

/**
 * The transcript with this device's partner reference written onto its
 * opening message, when the transcript does not name one yet. Returns the
 * same array when nothing changes.
 */
export function withSoulBackfill<M extends { soul?: unknown }>(sessionId: string, messages: M[]): M[] {
  if (!Array.isArray(messages) || messages.length === 0) return messages;
  if (soulFromTranscript(messages as Array<{ soul?: never }>)) return messages;
  const soul = transcriptSoulOf(resolveSoulCtx(readSoulCtx(sessionId)));
  if (!soul) return messages;
  const out = messages.slice();
  out[0] = { ...out[0], soul };
  return out;
}
