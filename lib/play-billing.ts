"use client";

/**
 * Native In-App Purchase (Google Play + Apple App Store) via
 * cordova-plugin-purchase v13.
 *
 * Why this file exists:
 *   Google Play and the Apple App Store require that every digital
 *   subscription sold inside the native apps go through their billing
 *   system (Apple Guideline 3.1.1, Play policy). Our Teya card flow is
 *   web-only. This module wraps cordova-plugin-purchase (CdvPurchase) so
 *   the native Subscribe CTA can launch the real store sheet, then forwards
 *   the purchase to our backend for server-side verification. The backend
 *   is the authority on entitlement; this module only launches the sheet
 *   and hands the receipt over.
 *
 * Platform scope:
 *   Runs only inside the Capacitor native shell. On Android it registers the
 *   product on GOOGLE_PLAY and posts the purchase token to
 *   /subscribe/google-play-verify. On iOS it registers on APPLE_APPSTORE and
 *   posts the transaction id to /subscribe/apple-verify. Web never imports it.
 *
 * Product:
 *   solray_monthly, Solray membership, 23 USD per month, 5-day free trial.
 *   Configured in Play Console and App Store Connect under that product id.
 *
 * The "smart" logic (state machine, idempotency, replay protection) lives on
 * the backend so it survives app reload. This module stays thin.
 */

import { apiFetch } from "./api";
import { getNativePlatform } from "./native-push";
import { chooseOffer, offerStartsFree, verifyErrorCode, type StoreOfferLike } from "./native-iap-helpers";

// Two subscription products, matching the backend IAP_PRODUCT_IDS allowlist
// and the Play Console / App Store Connect product ids.
export const MONTHLY_PRODUCT_ID = "solray_monthly";
export const YEARLY_PRODUCT_ID = "solray_yearly";
const ALL_PRODUCT_IDS = [MONTHLY_PRODUCT_ID, YEARLY_PRODUCT_ID];
// Back-compat default for callers that don't specify a plan.
const PRODUCT_ID = MONTHLY_PRODUCT_ID;
const GOOGLE_VERIFY_PATH = "/subscribe/google-play-verify";
const APPLE_VERIFY_PATH = "/subscribe/apple-verify";
const TOKEN_KEY = "solray_token";

interface StoreErrorLike {
  isError?: boolean;
  code?: number;
  message?: string;
}

interface OrderData {
  // Apple: copied into the signed transaction's appAccountToken (must be a
  // UUID). Google: md5'd into obfuscatedAccountId unless googlePlay.accountId
  // is given, which we set to the same value so the server can compare.
  applicationUsername?: string;
  googlePlay?: { accountId?: string };
}

interface CdvPurchaseWindow {
  CdvPurchase?: {
    store: {
      register: (products: ProductRegistration[]) => void;
      initialize: (platforms?: string[]) => Promise<StoreErrorLike[] | unknown>;
      update?: () => Promise<void>;
      ready: (cb: () => void) => void;
      get: (id: string, platform?: string) => ProductLike | undefined;
      when: () => WhenEventChain;
      order: (offer: OfferLike, data?: OrderData) => Promise<StoreErrorLike | void>;
      restorePurchases?: () => Promise<StoreErrorLike | void>;
      localTransactions?: TransactionLike[];
      applicationUsername?: string | (() => string | undefined);
    };
    Platform: { GOOGLE_PLAY: string; APPLE_APPSTORE: string };
    ProductType: { PAID_SUBSCRIPTION: string };
    ErrorCode?: { PAYMENT_CANCELLED?: number };
  };
}

// CdvPurchase.ErrorCode.PAYMENT_CANCELLED (ERROR_CODES_BASE 6777000 + 6), used
// when the runtime enum is not reachable.
const PAYMENT_CANCELLED_FALLBACK = 6777006;
// Deadlines so no billing step can leave a spinner running forever.
const INIT_TIMEOUT_MS = 20_000;
const VERIFY_TIMEOUT_MS = 30_000;
const RESTORE_TIMEOUT_MS = 45_000;

interface ProductRegistration {
  id: string;
  type: string;
  platform: string;
}

interface OfferLike {
  id?: string;
  getOffer?: () => OfferLike | null;
}

interface ProductLike {
  id: string;
  offers?: OfferLike[];
  getOffer?: () => OfferLike | null;
}

interface TransactionLike {
  products?: Array<{ id: string }>;
  transactionId?: string;
  purchaseId?: string;
  purchaseToken?: string;
  purchaseDate?: Date | string;
  nativePurchase?: { purchaseToken?: string; transactionId?: string };
  finish?: () => Promise<unknown>;
}

interface WhenEventChain {
  approved: (cb: (tx: TransactionLike) => void) => WhenEventChain;
  finished: (cb: (tx: TransactionLike) => void) => WhenEventChain;
  productUpdated?: (cb: (p: ProductLike) => void) => WhenEventChain;
}

let initialized = false;
let initializing: Promise<void> | null = null;

// The subscribe page registers a callback so it can refresh entitlement state
// once the backend confirms a verified purchase (or surface a failure).
/**
 * Errors thrown to the UI carry a stable `code`; the UI maps it to a
 * localized t("subscribe.iap_<code>") string. The English message stays for
 * logs only, so a Spanish member never sees plugin or English copy.
 */
export type NativeIAPErrorCode =
  | "unavailable"
  | "loading"
  | "failed"
  | "verify_failed"
  | "other_account"
  | "charge_pending"
  | "state_changed"
  | "timeout";
export class NativeIAPError extends Error {
  code: NativeIAPErrorCode;
  constructor(code: NativeIAPErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "NativeIAPError";
  }
}

type PurchaseOutcome = { ok: true } | { ok: false; error: string; code?: NativeIAPErrorCode };
let outcomeListener: ((o: PurchaseOutcome) => void) | null = null;
export function setPurchaseListener(cb: ((o: PurchaseOutcome) => void) | null) {
  outcomeListener = cb;
}

function getStore() {
  const w = window as unknown as CdvPurchaseWindow;
  return w.CdvPurchase?.store;
}

function storePlatform(): string | null {
  const w = window as unknown as CdvPurchaseWindow;
  const cdv = w.CdvPurchase;
  if (!cdv) return null;
  const p = getNativePlatform();
  if (p === "ios") return cdv.Platform.APPLE_APPSTORE;
  if (p === "android") return cdv.Platform.GOOGLE_PLAY;
  return null;
}

function authToken(): string | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
  } catch {
    return null;
  }
}

// Best-effort read of the StoreKit/Play localized recurring price for the
// subscribe screen (App Store Guideline 3.1.2 wants the price shown on the
// paywall itself, in the user's currency). Returns a formatted string like
// "$24.99" / "29,99 EUR" or null if the store isn't ready. Never throws.
export function getLocalizedMonthlyPrice(): string | null {
  return getLocalizedPrice(MONTHLY_PRODUCT_ID);
}

export function getLocalizedYearlyPrice(): string | null {
  return getLocalizedPrice(YEARLY_PRODUCT_ID);
}

// Generic form: the store's localized recurring price for any registered
// subscription product id, or null when unavailable. Never throws.
export function getLocalizedPrice(productId: string): string | null {
  try {
    if (typeof window === "undefined") return null;
    const store = getStore();
    if (!store) return null;
    const platform = storePlatform();
    const product =
      (platform ? store.get(productId, platform) : undefined) || store.get(productId);
    if (!product) return null;
    const anyP = product as unknown as {
      pricing?: { price?: string; paymentMode?: string; priceMicros?: number };
      offers?: Array<{ pricingPhases?: Array<{ price?: string }> }>;
    };
    // The recurring price is the LAST pricing phase. product.pricing is the
    // FIRST phase, which for a plan with an introductory free trial is
    // "$0.00": the paywall then read "$0.00 / month" (found in the iOS
    // simulator against the real sandbox products, 2026-10-05).
    const phrases = anyP.offers?.[0]?.pricingPhases;
    if (phrases && phrases.length) {
      const last = phrases[phrases.length - 1];
      if (last?.price) return last.price;
    }
    if (anyP.pricing?.price && anyP.pricing.paymentMode !== "FreeTrial" && anyP.pricing.priceMicros !== 0) {
      return anyP.pricing.price;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * True when the store says this product starts with a free introductory
 * phase for this customer. The paywall only promises a free trial when the
 * store will actually give one (Guideline 3.1.2: the screen must match the
 * sheet). False when unknown.
 */
export function hasIntroFreeTrial(productId: string, trialEligible?: boolean): boolean {
  try {
    if (typeof window === "undefined") return false;
    const store = getStore();
    if (!store) return false;
    const platform = storePlatform();
    const product =
      (platform ? store.get(productId, platform) : undefined) || store.get(productId);
    if (!product) return false;
    // The offer launchNativePurchase will order for this member, so the
    // paywall promises a free trial only when the sheet will give one.
    return offerStartsFree(offerFor(product, trialEligible));
  } catch {
    return false;
  }
}

function offerFor(product: ProductLike, trialEligible?: boolean): (OfferLike & StoreOfferLike) | undefined {
  const offers = (product.offers || []) as Array<OfferLike & StoreOfferLike>;
  const def = (typeof product.getOffer === "function" && product.getOffer()) || undefined;
  return chooseOffer(offers, def as (OfferLike & StoreOfferLike) | undefined, trialEligible);
}

// Product-load listeners: the paywall re-reads prices whenever the store
// reports a product update (products can arrive after initialisation).
const productListeners = new Set<() => void>();
export function onNativeProductsUpdated(cb: () => void): () => void {
  productListeners.add(cb);
  return () => productListeners.delete(cb);
}
function notifyProducts() {
  productListeners.forEach((cb) => {
    try { cb(); } catch { /* ignore */ }
  });
}

/** True when at least one subscription product has a real recurring price.
 * Each plan is only offered once its own price is loaded. */
export function nativeProductsReady(): boolean {
  return ALL_PRODUCT_IDS.some((id) => Boolean(getLocalizedPrice(id)));
}

function withTimeout<T>(p: Promise<T>, ms: number, onTimeout: () => Error): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(onTimeout()), ms);
    p.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

// The plugin keeps its own "initialised" latch: calling initialize() a second
// time does not retry anything. After the first call, recovery goes through
// store.update(), which reloads products and purchases.
let pluginInitCalled = false;

export function initNativeIAP(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (initialized) return Promise.resolve();
  if (initializing) return initializing;

  const run = async (): Promise<void> => {
    const w = window as unknown as CdvPurchaseWindow;
    const cdv = w.CdvPurchase;
    const platform = storePlatform();
    if (!cdv || !cdv.store || !platform) {
      throw new NativeIAPError("unavailable", "In-app purchases are not available on this device");
    }
    const store = cdv.store;

    if (!pluginInitCalled) {
      pluginInitCalled = true;
      store.register(
        ALL_PRODUCT_IDS.map((id) => ({
          id,
          type: cdv.ProductType.PAID_SUBSCRIPTION,
          platform,
        })),
      );
      const chain = store.when().approved((tx) => {
        void onApproved(tx);
      });
      chain.productUpdated?.(() => notifyProducts());

      const ready = new Promise<void>((resolve) => store.ready(() => resolve()));
      // initialize() RESOLVES with an array of errors (it rarely rejects),
      // and ready() fires even when products failed to load. Both are
      // inspected; a connection failure is surfaced instead of being taken
      // for success.
      const errors = await withTimeout(
        Promise.resolve(store.initialize([platform])),
        INIT_TIMEOUT_MS,
        () => new NativeIAPError("timeout", "Store initialisation timed out"),
      );
      await withTimeout(ready, INIT_TIMEOUT_MS,
        () => new NativeIAPError("timeout", "Store never became ready"));
      const errs = Array.isArray(errors) ? (errors as StoreErrorLike[]).filter((e) => e && e.isError) : [];
      if (errs.length) {
        // eslint-disable-next-line no-console
        console.warn("[native-iap] initialize reported errors", errs.map((e) => `${e.code}: ${e.message}`));
      }
    } else if (store.update) {
      await withTimeout(store.update(), INIT_TIMEOUT_MS,
        () => new NativeIAPError("timeout", "Store refresh timed out"));
    }
    notifyProducts();
    if (!nativeProductsReady()) {
      throw new NativeIAPError("loading", "Subscription products are not available yet");
    }
    initialized = true;
  };

  const p = run();
  // Clear the in-flight latch on ANY rejection so a later call can retry
  // (through store.update(), see above). The original promise still rejects
  // for its real callers; this handler only resets the latch.
  p.catch(() => { if (initializing === p) initializing = null; });
  initializing = p;
  return p;
}

// Verification promises started by store approvals, so a restore can report
// success only after the server has confirmed (B5).
type VerifyResult = { ok: true } | { ok: false; code: NativeIAPErrorCode };
const inflightVerifications = new Set<Promise<VerifyResult>>();
let restoreResults: VerifyResult[] | null = null;

function purchaseTokenOf(tx: TransactionLike): string | undefined {
  return tx.purchaseToken || tx.nativePurchase?.purchaseToken || tx.purchaseId || undefined;
}

async function verifyWithServer(tx: TransactionLike, restore: boolean): Promise<{ has_access?: boolean }> {
  const platform = getNativePlatform();
  const productId = tx.products?.[0]?.id || PRODUCT_ID;
  const token = authToken();
  if (!token) throw new NativeIAPError("verify_failed", "Not signed in");
  const call = (path: string, body: Record<string, unknown>) =>
    withTimeout(
      apiFetch(path, { method: "POST", body: JSON.stringify({ ...body, restore }) }, token),
      VERIFY_TIMEOUT_MS,
      () => new NativeIAPError("timeout", "Verification timed out"),
    );
  if (platform === "android") {
    const purchaseToken = purchaseTokenOf(tx);
    if (!purchaseToken) throw new Error("No purchase token from Google Play");
    return call(GOOGLE_VERIFY_PATH, { product_id: productId, purchase_token: purchaseToken });
  }
  if (platform === "ios") {
    const transactionId = tx.transactionId || tx.nativePurchase?.transactionId;
    if (!transactionId) throw new Error("No transaction id from App Store");
    return call(APPLE_VERIFY_PATH, { transaction_id: transactionId, product_id: productId });
  }
  throw new Error("Unsupported platform for IAP");
}

function codeForVerifyError(e: unknown): NativeIAPErrorCode {
  if (e instanceof NativeIAPError) return e.code;
  const status = (e as { status?: number })?.status;
  const code = (e as { code?: string })?.code;
  return verifyErrorCode(status, code);
}

function onApproved(tx: TransactionLike): Promise<VerifyResult> {
  const job = (async (): Promise<VerifyResult> => {
    if (!authToken()) {
      // Signed out (or switching accounts): leave the transaction unfinished
      // so it is verified for whoever signs in next, never for nobody.
      return { ok: false, code: "verify_failed" };
    }
    try {
      await verifyWithServer(tx, restoreResults !== null);
      // Backend confirmed entitlement: tell the store so it doesn't refund.
      if (tx.finish) await tx.finish();
      outcomeListener?.({ ok: true });
      return { ok: true };
    } catch (e) {
      const code = codeForVerifyError(e);
      // eslint-disable-next-line no-console
      console.error("[native-iap] verify failed", e);
      outcomeListener?.({ ok: false, error: e instanceof Error ? e.message : String(e), code });
      return { ok: false, code };
    }
  })();
  inflightVerifications.add(job);
  void job.then((r) => {
    inflightVerifications.delete(job);
    if (restoreResults) restoreResults.push(r);
  });
  return job;
}

function setAccountToken(accountToken?: string | null) {
  const store = getStore();
  if (store && accountToken) {
    try { store.applicationUsername = accountToken; } catch { /* ignore */ }
  }
}

/**
 * Open the store sheet. Resolves "cancelled" when the member closed the
 * sheet (not an error), "started" otherwise; the approved -> verify ->
 * finish flow then reports through the purchase listener.
 *
 * accountToken is the member's store_account_token from /subscribe/status,
 * trialEligible its trial_eligible flag (false: order a paid offer).
 * It travels with the purchase (Apple appAccountToken, Google
 * obfuscatedAccountId) so the server can check the purchase belongs to the
 * account that verifies it (D5).
 */
export async function launchNativePurchase(
  productId: string = PRODUCT_ID,
  accountToken?: string | null,
  trialEligible?: boolean,
): Promise<"started" | "cancelled"> {
  await initNativeIAP();
  const store = getStore();
  const platform = storePlatform();
  if (!store || !platform) throw new NativeIAPError("unavailable", "In-app purchases are not available");
  const product = store.get(productId, platform) || store.get(productId);
  if (!product || !getLocalizedPrice(productId)) {
    // Never open a sheet the paywall could not price (Guideline 3.1.2).
    throw new NativeIAPError("loading", "Subscription is still loading. Try again in a moment.");
  }

  // One free trial per person (D6): a member whose email already had its
  // trial is sold the paid offer where the store lists one.
  const offer = offerFor(product, trialEligible) || product;

  setAccountToken(accountToken);
  const data: OrderData | undefined = accountToken
    ? { applicationUsername: accountToken, googlePlay: { accountId: accountToken } }
    : undefined;
  const result = await store.order(offer as OfferLike, data);
  if (result && (result as StoreErrorLike).isError) {
    const w = window as unknown as CdvPurchaseWindow;
    const cancelled = w.CdvPurchase?.ErrorCode?.PAYMENT_CANCELLED ?? PAYMENT_CANCELLED_FALLBACK;
    if ((result as StoreErrorLike).code === cancelled) return "cancelled";
    throw new NativeIAPError("failed", (result as StoreErrorLike).message || "Purchase failed");
  }
  return "started";
}

export type RestoreOutcome = "restored" | "none";

/**
 * Restore Purchases (App Store Guideline 3.1.1). Asks the store to replay the
 * member's purchases, waits for every resulting server verification, and
 * when nothing was replayed as new, verifies the newest purchase the device
 * knows about. Resolves "restored" only when the SERVER confirmed an active
 * membership, "none" when there is nothing active to restore; throws a
 * NativeIAPError otherwise (timeout, other account, verification failure).
 */
export async function restoreNativePurchases(accountToken?: string | null): Promise<RestoreOutcome> {
  await initNativeIAP();
  const store = getStore();
  if (!store || !store.restorePurchases) {
    throw new NativeIAPError("unavailable", "Restore is not available on this device");
  }
  setAccountToken(accountToken);
  restoreResults = [];
  try {
    const result = await withTimeout(store.restorePurchases(), RESTORE_TIMEOUT_MS,
      () => new NativeIAPError("timeout", "Restore timed out"));
    if (result && (result as StoreErrorLike).isError) {
      throw new NativeIAPError("failed", (result as StoreErrorLike).message || "Restore failed");
    }
    // Approvals fired by the restore verify asynchronously: wait for them.
    if (inflightVerifications.size) {
      await withTimeout(Promise.allSettled(Array.from(inflightVerifications)), VERIFY_TIMEOUT_MS,
        () => new NativeIAPError("timeout", "Verification timed out"));
    }
    const results = restoreResults.slice();
    if (results.some((r) => r.ok)) return "restored";
    const failed = results.find((r) => !r.ok);

    // Nothing new was approved: verify the newest purchase on this device.
    const ours = (store.localTransactions || []).filter((t) =>
      (t.products || []).some((p) => ALL_PRODUCT_IDS.includes(p.id)),
    );
    if (!ours.length) {
      if (failed) throw new NativeIAPError(failed.code, "Restore verification failed");
      return "none";
    }
    const newest = ours.slice().sort((a, b) =>
      new Date(b.purchaseDate || 0).getTime() - new Date(a.purchaseDate || 0).getTime(),
    )[0];
    try {
      const res = await verifyWithServer(newest, true);
      return res && res.has_access === false ? "none" : "restored";
    } catch (e) {
      const status = (e as { status?: number })?.status;
      if (status === 402 || status === 400) return "none"; // expired or not ours to restore
      throw new NativeIAPError(codeForVerifyError(e), "Restore verification failed");
    }
  } finally {
    restoreResults = null;
  }
}

export function isNativeIAPAvailable(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as CdvPurchaseWindow;
  return Boolean(w.CdvPurchase?.store) && storePlatform() !== null;
}

// Backwards-compatible aliases (earlier Android-only names).
export const initPlayBilling = initNativeIAP;
export const launchPlayBillingPurchase = launchNativePurchase;
export const isPlayBillingAvailable = isNativeIAPAvailable;
