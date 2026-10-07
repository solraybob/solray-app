// Third-party AI consent (App Store Guideline 5.1.2(i)).
//
// The backend owns the current version (AI_CONSENT_VERSION in the API). The
// app sends this value when the member agrees; if the server's version moves
// on, /users/me reports ai_consent_required and the sheet asks again.
export const AI_CONSENT_VERSION = "2026-10-06";

/** Error code the API returns (403) when a route needs AI consent. */
export const AI_CONSENT_REQUIRED_CODE = "ai_consent_required";

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
