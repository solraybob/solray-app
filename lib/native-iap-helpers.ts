/**
 * Pure helpers for the native store paywall (no plugin, no Capacitor), so
 * they can be unit tested and shared by lib/play-billing.ts.
 */

export interface PricingPhaseLike {
  paymentMode?: string;
  priceMicros?: number;
  price?: string;
}

export interface StoreOfferLike {
  id?: string;
  pricingPhases?: PricingPhaseLike[];
}

/** True when the offer's first phase is free (an introductory free trial). */
export function offerStartsFree(offer: StoreOfferLike | null | undefined): boolean {
  const first = offer?.pricingPhases?.[0];
  return Boolean(first && (first.paymentMode === "FreeTrial" || first.priceMicros === 0));
}

/**
 * What the native paywall can do for one plan (review 2, finding 7). One
 * free trial per person across web, App Store and Google Play, and a free
 * trial is offered ONLY when the server has confirmed this member is still
 * eligible (trialEligible === true):
 *
 *   checking     eligibility not known yet: order nothing
 *   trial        eligible, and the store's offer starts with the free trial
 *   paid         an offer that starts paid (Google lists the base plan next
 *                to the free-trial offer; Apple lists only paid phases for a
 *                customer it already considers ineligible)
 *   unavailable  the trial was used and this product only exposes a free
 *                introductory offer: never order it, say so instead
 */
export type PlanOffer<T> =
  | { state: "trial" | "paid"; offer: T }
  | { state: "checking" | "unavailable"; offer?: undefined };

export function planOffer<T extends StoreOfferLike>(
  offers: T[] | undefined,
  defaultOffer: T | null | undefined,
  trialEligible: boolean | undefined,
): PlanOffer<T> {
  if (trialEligible === undefined) return { state: "checking" };
  const list = offers || [];
  const fallback = defaultOffer || list[0];
  if (trialEligible === true) {
    if (!fallback) return { state: "unavailable" };
    return { state: offerStartsFree(fallback) ? "trial" : "paid", offer: fallback };
  }
  if (fallback && !offerStartsFree(fallback)) return { state: "paid", offer: fallback };
  const paid = list.find((o) => !offerStartsFree(o));
  return paid ? { state: "paid", offer: paid } : { state: "unavailable" };
}

/** The offer to order, or undefined when nothing may be ordered for this
 * member yet (eligibility unknown) or at all (trial used, no paid offer). */
export function chooseOffer<T extends StoreOfferLike>(
  offers: T[] | undefined,
  defaultOffer: T | null | undefined,
  trialEligible: boolean | undefined,
): T | undefined {
  return planOffer(offers, defaultOffer, trialEligible).offer;
}

export type StoreGateErrorCode = "card_pending" | "web_billing_active" | "check_failed";

/** Maps a refused POST /subscribe/store-intent to what the paywall shows.
 * Anything but an explicit refusal (offline, timeout, 5xx) is check_failed:
 * the sheet stays closed, because the check is what keeps a store purchase
 * and a card charge from both happening (review 2, finding 2). */
export function storeGateErrorCode(status: number | undefined, code: string | undefined): StoreGateErrorCode {
  if (code === "card_charge_pending") return "card_pending";
  if (code === "web_billing_active") return "web_billing_active";
  return "check_failed";
}

export type VerifyErrorCode = "other_account" | "charge_pending" | "state_changed" | "verify_failed";

/** Maps a failed server verification to the code the paywall shows. */
export function verifyErrorCode(status: number | undefined, code: string | undefined): VerifyErrorCode {
  // A card payment on the account is still being confirmed: the purchase
  // stays unfinished on the device and is verified again later.
  if (code === "card_charge_pending") return "charge_pending";
  // The membership changed while the store was being asked: try again.
  if (code === "store_state_changed") return "state_changed";
  // 409 otherwise: the purchase belongs to (or was bought from) another account.
  if (status === 409 || code === "purchase_other_account") return "other_account";
  return "verify_failed";
}
