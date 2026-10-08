// The words a member sees when something fails.
//
// A server's `detail` is written for developers, in English, and may name
// configuration ("Set GROQ_API_KEY") or arrive as an object. It is never
// shown to a member (Codex out18-5). Every failure a member reads goes
// through memberErrorText: a coded refusal has its own translated words, a
// status the screen knows (a wrong password, a taken username) has its own,
// and anything else is the screen's translated fallback. Words the app wrote
// itself in the member's language travel as a MemberError and are shown as
// they are.

import { ApiError } from "./api";
import { ORACLE_ERROR_KEYS } from "./oracle-errors";

/** A failure message already written for the member, in their language. */
export class MemberError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MemberError";
  }
}

/** Codes any screen may meet, with their translation keys. */
export const MEMBER_CODE_KEYS: Record<string, string> = {
  // /chat/transcribe
  audio_empty: "chat.voice_empty",
  audio_too_large: "chat.voice_too_long",
  transcription_unavailable: "chat.voice_warming_up",
  transcription_failed: "chat.voice_transcription_failed",
};

type Translate = (key: string) => string;

export interface MemberErrorOptions {
  /** Translation keys for statuses this screen can name (e.g. 409). */
  byStatus?: Record<number, string>;
  /** Translation keys for codes only this screen meets. */
  byCode?: Record<string, string>;
  /** The key when the server could not be reached at all. */
  network?: string;
}

/** The translated sentence for a failure; never the server's own text. */
export function memberErrorText(err: unknown, t: Translate, fallbackKey: string, o: MemberErrorOptions = {}): string {
  if (err instanceof MemberError && err.message) return err.message;
  const api = err instanceof ApiError ? err : null;
  const code = api?.code;
  if (code) {
    const key = o.byCode?.[code] ?? ORACLE_ERROR_KEYS[code] ?? MEMBER_CODE_KEYS[code];
    if (key) return t(key);
  }
  if (api) {
    const key = o.byStatus?.[api.status];
    if (key) return t(key);
    if (api.status === 429) return t("common.error_too_many");
    return t(fallbackKey);
  }
  // fetch itself failed (offline, blocked): a TypeError in every browser.
  if (o.network && err instanceof TypeError) return t(o.network);
  return t(fallbackKey);
}
