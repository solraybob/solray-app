/**
 * lib/subscription.ts, Subscription API helpers + status hook
 *
 * Wraps all /subscribe/* endpoints and provides a React hook
 * for checking access throughout the app.
 */

import { apiFetch } from "./api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SubscriptionStatus {
  subscribed: boolean;
  status: string | null; // trial | active | past_due | cancelled | expired
  has_access: boolean;
  trial_end: string | null;
  current_period_end: string | null;
  card_brand: string | null;
  card_last_four: string | null;
  price: string | null;
  plan?: "monthly" | "yearly";
  period_days?: number;
  cancelled_at: string | null;
  platform?: "web" | "ios" | "android" | string;
  /** Sent with every store purchase (Apple appAccountToken, Google
   * obfuscatedAccountId) so the server can tie it to this member. */
  store_account_token?: string;
  /** Web signup waiting for email verification before the trial starts. */
  trial_pending_verification?: boolean;
  /** A card charge is awaiting confirmation; nothing more is charged. */
  charge_pending?: boolean;
  /** Inside the App Store / Google Play free trial. */
  store_trial?: boolean;
}

/** A billing request ran past its deadline. The outcome is unknown, so the
 * UI must refresh status instead of offering the action again blindly. */
export class DeadlineError extends Error {
  constructor() {
    super("deadline");
    this.name = "DeadlineError";
  }
}

const BILLING_DEADLINE_MS = 30_000;

/** apiFetch with an abort deadline, for billing calls only (the Oracle and
 * other long requests keep their own behaviour). */
export async function billingFetch(
  path: string,
  options: RequestInit,
  token: string | null | undefined,
  ms: number = BILLING_DEADLINE_MS,
) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await apiFetch(path, { ...options, signal: ctrl.signal }, token);
  } catch (e) {
    if (ctrl.signal.aborted) throw new DeadlineError();
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

export async function getSubscriptionStatus(
  token: string
): Promise<SubscriptionStatus> {
  return apiFetch("/subscribe/status", {}, token);
}

export async function startTrial(token: string): Promise<{
  status: string;
  trial_end: string | null;
  trial_pending_verification?: boolean;
  trial_used?: boolean;
}> {
  return billingFetch("/subscribe", { method: "POST" }, token);
}

export async function resendVerification(token: string) {
  return billingFetch("/users/resend-verification", { method: "POST" }, token);
}

// attachCard was removed in May 2026 along with the backend POST
// /subscribe/card endpoint. That endpoint accepted a client-supplied
// Teya token and flipped the subscription to active without any Teya
// verification, which was a revenue-leak hole. The legitimate
// activation path is now exclusively server-to-server: Teya redirects
// to backend /subscribe/teya-return, backend verifies + activates +
// redirects to /subscribe/welcome. The frontend never touches a Teya
// token. See Codex P0.1 trust audit + the corresponding backend
// commit. Function kept absent (not deprecated stub) to surface any
// stale callers as TypeScript errors rather than silently 410.

export async function activateSubscription(token: string) {
  return billingFetch("/subscribe/activate", { method: "POST" }, token);
}

// Choose monthly ($23/mo) or yearly ($199/yr) before the subscription is
// charged. Allowed only while the sub has not been activated; the backend
// rejects a change on an active sub so a charged period's price never moves.
export async function setPlan(token: string, plan: "monthly" | "yearly") {
  return billingFetch(
    "/subscribe/plan",
    { method: "POST", body: JSON.stringify({ plan }) },
    token
  );
}

export async function cancelSubscription(token: string) {
  return billingFetch("/subscribe/cancel", { method: "POST" }, token);
}

export async function createSecurePaySession(token: string) {
  return billingFetch("/subscribe/securepay", { method: "POST" }, token);
}
