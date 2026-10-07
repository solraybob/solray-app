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
