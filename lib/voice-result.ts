// What to do with a transcription that comes back from the server.
//
// Transcription takes a moment. By the time it lands the member may have
// signed out, left the chat, or opened another conversation. A transcript
// for a previous account or a closed screen is dropped. One that lands in a
// different conversation from the one it was spoken in is never sent on its
// own: it is placed in the message box for the member to send or clear.
// Only in the same conversation does the crisis path send it straight away.

export type VoiceResultAction = "drop" | "send" | "fill";

export function voiceResultAction(o: {
  sameAccount: boolean;
  mounted: boolean;
  sameConversation: boolean;
  crisis: boolean;
}): VoiceResultAction {
  if (!o.sameAccount || !o.mounted) return "drop";
  if (o.crisis && o.sameConversation) return "send";
  return "fill";
}

/**
 * The crisis card /chat/transcribe established for a spoken message, as the
 * two messages of a crisis turn (the member's words and the card), or null
 * when the response carries no card. The app draws this at once, without
 * sending the words to /chat first, so the card can never be lost between
 * the two requests (a failed server record, a slower judge there). Both
 * messages are tagged "crisis": kept in the member's own transcript, never
 * sent back to the AI.
 */
export function voiceCrisisTurn(
  data: unknown,
  text: string,
  asCard: (v: unknown) => { variant: string; intro: string } | null,
  now: number = Date.now(),
): { user: VoiceTurnMessage; card: VoiceTurnMessage } | null {
  if (!data || typeof data !== "object") return null;
  const d = data as { crisis_card?: unknown; response?: unknown; crisis?: unknown };
  const card = asCard(d.crisis_card);
  if (!card || (card.variant !== "standard" && card.variant !== "urgent")) return null;
  const words = (text || "").trim();
  if (!words) return null;
  const at = new Date(now).toISOString();
  const reply = typeof d.response === "string" && d.response.trim() ? d.response : card.intro;
  return {
    user: { id: `${now}-voice`, role: "user", content: words, timestamp: at, safety: "crisis" },
    card: {
      id: `${now}-voice-card`, role: "assistant", content: reply,
      timestamp: new Date(now + 1).toISOString(), crisis: card, safety: "crisis",
    },
  };
}

export interface VoiceTurnMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  crisis?: unknown;
  safety: "crisis";
}
