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
  /** False when this email already had its one free trial (web or store):
   * the native paywall then orders a paid offer. */
  trial_eligible?: boolean;
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
/** /subscribe/status is a quick read; every billing action awaits it, so a
 * stalled status call must never hold a button busy (B5). */
export const STATUS_DEADLINE_MS = 15_000;

/** apiFetch with a hard deadline, for billing calls only (the Oracle and
 * other long requests keep their own behaviour). The request is aborted at
 * the deadline AND the promise settles then, even if the transport ignores
 * the abort (a stalled body, a native bridge), so no caller can hang. */
export async function billingFetch(
  path: string,
  options: RequestInit,
  token: string | null | undefined,
  ms: number = BILLING_DEADLINE_MS,
) {
  const ctrl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      ctrl.abort();
      reject(new DeadlineError());
    }, ms);
  });
  const request = apiFetch(path, { ...options, signal: ctrl.signal }, token);
  // The request may still settle after the deadline won the race.
  request.catch(() => { /* reported through the race below */ });
  try {
    return await Promise.race([request, deadline]);
  } catch (e) {
    if (ctrl.signal.aborted) throw new DeadlineError();
    throw e;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

export async function getSubscriptionStatus(
  token: string,
  ms: number = STATUS_DEADLINE_MS,
): Promise<SubscriptionStatus> {
  return billingFetch("/subscribe/status", {}, token, ms);
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

// Review 2, finding 2: the native paywall announces a store purchase BEFORE
// it opens the App Store / Google Play sheet. The server refuses (409) while
// a card charge on the account is in flight or unresolved, and otherwise
// holds card billing back while the purchase happens. It also answers
// trial_eligible fresh, so a free trial is ordered only when confirmed.
export async function announceStorePurchase(token: string): Promise<{
  ok: boolean;
  trial_eligible: boolean;
  intent_expires_at?: string | null;
}> {
  return billingFetch("/subscribe/store-intent", { method: "POST" }, token);
}

// The sheet closed without a purchase: card billing may continue at once.
export async function releaseStorePurchase(token: string) {
  return billingFetch("/subscribe/store-intent", { method: "DELETE" }, token);
}

export async function cancelSubscription(token: string) {
  return billingFetch("/subscribe/cancel", { method: "POST" }, token);
}

export async function createSecurePaySession(token: string) {
  return billingFetch("/subscribe/securepay", { method: "POST" }, token);
}
