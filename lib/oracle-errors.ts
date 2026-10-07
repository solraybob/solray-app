// Friendly copy for the Oracle backend's machine-readable refusals.
//
// The AI routes answer with HTTP status + detail {code, message}. Each code
// below maps to one i18n key (EN + ES in messages/*.json), so every screen
// that talks to an AI route says the same plain thing in the member's
// language instead of a raw server sentence or a paywall redirect.
//
//   403 ai_consent_required          the member has not agreed to AI processing
//   403 chart_private                the other person keeps their chart private
//   403 partner_ai_consent_required  the other person has not agreed to AI processing
//   429 ai_daily_limit               today's generous cap for this feature is reached
//   413 message_too_long             the message is over the length limit
//   403 soul_connection_gone         the Dynamics connection no longer exists
//   403 under_minimum_age            the account is under 16: the Oracle stays closed
//                                    (400 with the same code at signup and on a
//                                    birth-date update, where the change is refused)
import { ApiError } from "./api";

export const ORACLE_ERROR_KEYS: Record<string, string> = {
  ai_consent_required: "chat.consent_needed",
  chart_private: "oracle_errors.chart_private",
  partner_ai_consent_required: "oracle_errors.partner_ai_consent_required",
  ai_daily_limit: "oracle_errors.ai_daily_limit",
  message_too_long: "oracle_errors.message_too_long",
  soul_connection_gone: "oracle_errors.soul_connection_gone",
  under_minimum_age: "oracle_errors.under_minimum_age",
};

/** The i18n key for a known Oracle refusal, or null for anything else. */
export function oracleErrorKey(e: unknown): string | null {
  if (!(e instanceof ApiError) || !e.code) return null;
  return ORACLE_ERROR_KEYS[e.code] ?? null;
}
