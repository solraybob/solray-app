// Request shapes for the Oracle chat routes (/chat, /chat/synthesize).
//
// The backend resolves the other person's chart itself (A14): the app names
// WHO the reading is with (an accepted soul connection or a saved person)
// and never hands over a chart as data. A client chart is only sent for a
// saved person the server has never confirmed (created offline, not synced
// yet), where the server recomputes the chart from its birth details.

export type SoulRef = {
  connectionId?: string | null;
  savedPersonId?: string | null;
  // Legacy fallback only (see above). Never sent when an id is known.
  blueprint?: Record<string, unknown> | null;
};

export function soulRequestFields(ref: SoulRef | null | undefined): Record<string, unknown> {
  if (!ref) return {};
  if (ref.connectionId) return { soul_connection_id: ref.connectionId };
  if (ref.savedPersonId) return { saved_person_id: ref.savedPersonId };
  if (ref.blueprint) return { soul_blueprint: ref.blueprint };
  return {};
}

export type HistoryMessage = {
  id?: string;
  role: "user" | "assistant";
  content: string;
  isError?: boolean;
};

/**
 * Conversation history as the server wants it: the opening greeting left
 * out, and app-side error bubbles marked isError so the Oracle never reads
 * them back as something she said.
 */
export function historyForServer(messages: HistoryMessage[]): Array<{ role: string; content: string; isError?: boolean }> {
  return messages
    .filter((m) => m.id !== "greeting")
    .map((m) => (m.isError ? { role: m.role, content: m.content, isError: true } : { role: m.role, content: m.content }));
}

/** Who a Dynamics conversation is with, as stored on its opening message. */
export type TranscriptSoul = { name?: string | null; connection_id?: string | null; saved_person_id?: string | null };

/**
 * The Dynamics partner recorded in a transcript (the newest message that
 * carries one), as the chat keeps it in memory. This is what lets a
 * conversation synced from another device, or kept through a reinstall,
 * go on naming its partner: the server then loads that chart and checks
 * the partner's current sharing and consent itself. No chart is stored.
 */
export function soulFromTranscript(
  messages: Array<{ soul?: TranscriptSoul | null }> | null | undefined,
): { name: string | null; connectionId: string | null; savedPersonId: string | null } | null {
  if (!Array.isArray(messages)) return null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const s = messages[i]?.soul;
    if (!s || typeof s !== "object") continue;
    const connectionId = typeof s.connection_id === "string" && s.connection_id ? s.connection_id : null;
    const savedPersonId = typeof s.saved_person_id === "string" && s.saved_person_id ? s.saved_person_id : null;
    if (!connectionId && !savedPersonId) continue;
    return { name: typeof s.name === "string" ? s.name : null, connectionId, savedPersonId };
  }
  return null;
}
