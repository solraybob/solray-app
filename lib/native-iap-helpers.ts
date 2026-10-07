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
 * The offer to order. One free trial per person across web, App Store and
 * Google Play: when the server says this member's email already had its
 * trial (trialEligible === false), pick an offer that starts paid if the
 * store lists one (Google Play lists the base plan next to the free-trial
 * offer). Apple decides introductory eligibility itself and lists no paid
 * alternative, so there the default offer stays, and the paywall shows what
 * the sheet will show. Unknown eligibility keeps the default offer.
 */
export function chooseOffer<T extends StoreOfferLike>(
  offers: T[] | undefined,
  defaultOffer: T | null | undefined,
  trialEligible: boolean | undefined,
): T | undefined {
  const list = offers || [];
  const fallback = defaultOffer || list[0];
  if (trialEligible !== false) return fallback || undefined;
  if (fallback && !offerStartsFree(fallback)) return fallback;
  return list.find((o) => !offerStartsFree(o)) || fallback || undefined;
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
