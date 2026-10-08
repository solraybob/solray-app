// What a /chat send leaves in the transcript, as plain data, for the cases
// the chat page cannot draw live: the support card a coded refusal carries
// (a care turn's 413 message_too_long, say), and an answer that arrives
// after the member left Chat or opened another conversation (written into
// that conversation's saved copy instead of being dropped).

import { asCrisisCard } from "./crisis-card";
import type { ChatMessage } from "./chat-sync";

/** The soft support card a refusal carries on a care turn (detail.support,
 *  detail.support_text), as the assistant message drawn before the
 *  refusal's own note. Null when the refusal carries none. */
export function supportFromRefusal(detail: unknown, now: number = Date.now()): ChatMessage | null {
  if (!detail || typeof detail !== "object") return null;
  const d = detail as { support?: unknown; support_text?: unknown };
  const card = asCrisisCard(d.support);
  if (!card) return null;
  return {
    id: (now + 1).toString(),
    role: "assistant",
    content: typeof d.support_text === "string" && d.support_text ? d.support_text : card.intro,
    timestamp: new Date(now).toISOString(),
    crisis: card,
  };
}

/** The reply a 200 from /chat stands for, as the chat page builds it: the
 *  crisis or support card (a crisis turn tags the member's message too),
 *  the Oracle's words, or, with no words at all, the honest error line. */
export function answerFromChat(
  data: unknown, noResponseText: string, now: number = Date.now(),
): { reply: ChatMessage; crisisTurn: boolean } {
  const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const timestamp = new Date(now).toISOString();
  const id = (now + 1).toString();
  const content = (typeof d.response === "string" && d.response) || (typeof d.message === "string" && d.message) || "";
  if (!content) {
    return { reply: { id, role: "assistant", content: noResponseText, timestamp, isError: true }, crisisTurn: false };
  }
  const card = asCrisisCard(d.crisis_card) || asCrisisCard(d.support_card);
  if (card) {
    const crisisTurn = d.crisis_turn === true || card.variant === "standard" || card.variant === "urgent";
    return {
      reply: { id, role: "assistant", content, timestamp, crisis: card, ...(crisisTurn ? { safety: "crisis" as const } : {}) },
      crisisTurn,
    };
  }
  return { reply: { id, role: "assistant", content, timestamp }, crisisTurn: false };
}

/** A saved transcript with that answer written in after the member's
 *  message (tagged when it was a crisis turn). Idempotent. */
export function withAnswer(
  messages: ChatMessage[], userMsgId: string, answer: { reply: ChatMessage; crisisTurn: boolean },
): ChatMessage[] {
  const tagged = answer.crisisTurn
    ? messages.map((m) => (m.id === userMsgId ? { ...m, safety: "crisis" as const } : m))
    : messages;
  if (tagged.some((m) => m.id === answer.reply.id)) return tagged;
  return [...tagged, answer.reply];
}
