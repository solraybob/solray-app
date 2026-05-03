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
  cancelled_at: string | null;
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

export async function getSubscriptionStatus(
  token: string
): Promise<SubscriptionStatus> {
  return apiFetch("/subscribe/status", {}, token);
}

export async function startTrial(token: string) {
  return apiFetch("/subscribe", { method: "POST" }, token);
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
  return apiFetch("/subscribe/activate", { method: "POST" }, token);
}

export async function cancelSubscription(token: string) {
  return apiFetch("/subscribe/cancel", { method: "POST" }, token);
}

export async function createSecurePaySession(token: string) {
  return apiFetch("/subscribe/securepay", { method: "POST" }, token);
}
