import { noteNewSession, type ChatMessage, type StoredSession as ChatStoredSession } from "@/lib/chat-sync";
import { readSoulCtx, resolveSoulCtx, writeSoulCtx, type SoulCtx } from "@/lib/chat-soul";
import { soulFromTranscript, type SoulRef } from "@/lib/oracle-request";

// isError marks a transport-level error rather than an Oracle reply. It
// renders with distinct styling so the member is never misled into thinking
// error copy came from the Oracle.
export type Message = ChatMessage;
export type StoredSession = ChatStoredSession;

// ─── Helpers ────────────────────────────────────────────────────────────────

export function generateSessionId() {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  // Not on the server yet: its first upload is a plain write, no read first.
  noteNewSession(id);
  return id;
}

export function todayLabel() {
  // The label names the conversation in history, so it follows the app
  // language (the same saved choice the language provider reads).
  let locale = "en-GB";
  try { if ((localStorage.getItem("solray_language") || "").startsWith("es")) locale = "es"; } catch { /* default */ }
  return new Date().toLocaleDateString(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// Device cache and server sync for chat history: lib/chat-sync.ts.

// Dynamics context (the other person's chart) belongs to the conversation it
// was opened for. Kept per session on this device (lib/chat-soul) so
// reopening that conversation restores it, and opening any other
// conversation clears it.
export function soulRefOf(sc: SoulCtx | null): SoulRef | null {
  if (!sc) return null;
  return {
    connectionId: sc.connectionId ?? null, savedPersonId: sc.savedPersonId ?? null, blueprint: sc.blueprint ?? null,
    family: sc.family ?? null,
  };
}
export function getSoulCtx(sessionId: string, messages?: Message[]): SoulCtx | null {
  // A saved person who was not confirmed yet when the reading began is
  // named by their confirmed id once the server has them.
  const local = resolveSoulCtx(readSoulCtx(sessionId));
  if (local) return local;
  // Not opened on this device (synced from another one, or after a
  // reinstall): the transcript's opening message names the partner.
  const fromTranscript = soulFromTranscript(messages);
  return fromTranscript ? { ...fromTranscript, blueprint: null } : null;
}
export function setSoulCtx(sessionId: string, ctx: SoulCtx | null) {
  writeSoulCtx(sessionId, ctx);
}
