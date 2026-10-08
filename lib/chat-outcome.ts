// What a /chat send leaves in the transcript, as plain data, for the cases
// the chat page cannot draw live: how a refusal reads, and an answer that
// arrives after the member left Chat or opened another conversation
// (written into that conversation's saved copy instead of being dropped).

import { ApiError } from "./api";
import { oracleErrorKey } from "./oracle-errors";
import type { ChatMessage } from "./chat-sync";

/** The reply a 200 from /chat stands for, as the chat page builds it: the
 *  Oracle's words or, with no words at all, the honest error line. Any
 *  other field the server sends along is ignored. */
export function answerFromChat(
  data: unknown, noResponseText: string, now: number = Date.now(),
): { reply: ChatMessage } {
  const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const timestamp = new Date(now).toISOString();
  const id = (now + 1).toString();
  const content = (typeof d.response === "string" && d.response) || (typeof d.message === "string" && d.message) || "";
  if (!content) {
    return { reply: { id, role: "assistant", content: noResponseText, timestamp, isError: true } };
  }
  return { reply: { id, role: "assistant", content, timestamp } };
}

/** A saved transcript with that answer written in after the member's
 *  message (the last one in it). Idempotent. */
export function withAnswer(
  messages: ChatMessage[], answer: { reply: ChatMessage },
): ChatMessage[] {
  if (messages.some((m) => m.id === answer.reply.id)) return messages;
  return [...messages, answer.reply];
}

/**
 * How one failed /chat request reads, for every path that sends one (an
 * ordinary send, voice, the "Go deeper" question, a Dynamics opening):
 *  - `noteKey`: the translation key of the note it leaves. A known coded
 *    refusal has its own words; any other refusal from the server (a 4xx,
 *    whatever shape its detail has: a sentence or an object) says the
 *    Oracle could not answer this; anything else (offline, a 5xx) says it
 *    could not be reached. The server's raw detail text is never shown.
 *  - `paywall`: only a bare 403 (no code, a plain sentence or no detail)
 *    is the old subscription refusal; a 403 whose detail is an object (a
 *    connection not accepted, say) is a refusal of this reading.
 */
export function readChatRefusal(err: unknown): { noteKey: string; paywall: boolean } {
  const api = err instanceof ApiError ? err : null;
  const known = oracleErrorKey(err);
  const refused = !!api && api.status >= 400 && api.status < 500 && api.status !== 401;
  return {
    noteKey: known ?? (refused ? "chat.error_refused" : "chat.error_unreachable"),
    paywall: !!api && api.status === 403 && !known && !api.code
      && !(api.detail && typeof api.detail === "object"),
  };
}
