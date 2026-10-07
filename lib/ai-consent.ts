// Third-party AI consent (App Store Guideline 5.1.2(i)).
//
// The backend owns the current version (AI_CONSENT_VERSION in the API). The
// app sends this value when the member agrees; if the server's version moves
// on, /users/me reports ai_consent_required and the sheet asks again.
export const AI_CONSENT_VERSION = "2026-10-06";

/** Error code the API returns (403) when a route needs AI consent. */
export const AI_CONSENT_REQUIRED_CODE = "ai_consent_required";

/**
 * Error code the API returns when the account is under the minimum age
 * (16): 400 at signup and on a birth-date update (the change is refused),
 * 403 on AI routes and on the consent POST. The non-AI parts of the app keep
 * working; AI surfaces show a gentle note instead.
 */
export const UNDER_MINIMUM_AGE_CODE = "under_minimum_age";

/** Window event that opens the consent sheet from anywhere in the app. */
export const AI_CONSENT_EVENT = "solray:ai-consent-required";

/** Fired after consent is recorded or withdrawn, so screens can refresh. */
export const AI_CONSENT_CHANGED_EVENT = "solray:ai-consent-changed";

export function openAiConsentSheet(): void {
  try {
    window.dispatchEvent(new CustomEvent(AI_CONSENT_EVENT));
  } catch { /* SSR */ }
}

/** Reads the consent flags from a /users/me payload (top level or profile). */
export function consentFromMe(me: unknown): { required: boolean; version: string | null; at: string | null } {
  const o = (me && typeof me === "object" ? me : {}) as Record<string, any>;
  const p = (o.profile && typeof o.profile === "object" ? o.profile : {}) as Record<string, any>;
  const required = o.ai_consent_required ?? p.ai_consent_required;
  const version = o.ai_consent_version ?? p.ai_consent_version ?? null;
  const at = o.ai_consent_at ?? p.ai_consent_at ?? null;
  return {
    required: required === true,
    version: typeof version === "string" ? version : null,
    at: typeof at === "string" ? at : null,
  };
}

/**
 * True when /users/me says this account is under the minimum age
 * (age_restricted). Such an account is never shown the consent sheet:
 * consenting cannot open the AI for it.
 */
export function ageRestrictedFromMe(me: unknown): boolean {
  const o = (me && typeof me === "object" ? me : {}) as Record<string, any>;
  const p = (o.profile && typeof o.profile === "object" ? o.profile : {}) as Record<string, any>;
  return (o.age_restricted ?? p.age_restricted) === true;
}
