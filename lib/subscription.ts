/**
 * lib/subscription.ts — Subscription API helpers + status hook
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

export async function attachCard(
  token: string,
  data: { teya_token: string; card_last_four: string; card_brand: string }
) {
  return apiFetch(
    "/subscribe/card",
    { method: "POST", body: JSON.stringify(data) },
    token
  );
}

export async function activateSubscription(token: string) {
  return apiFetch("/subscribe/activate", { method: "POST" }, token);
}

export async function cancelSubscription(token: string) {
  return apiFetch("/subscribe/cancel", { method: "POST" }, token);
}

export async function createSecurePaySession(token: string) {
  return apiFetch("/subscribe/securepay", { method: "POST" }, token);
}
