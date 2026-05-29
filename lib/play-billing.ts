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

const PRODUCT_ID = "solray_monthly";
const GOOGLE_VERIFY_PATH = "/subscribe/google-play-verify";
const APPLE_VERIFY_PATH = "/subscribe/apple-verify";
const TOKEN_KEY = "solray_token";

interface CdvPurchaseWindow {
  CdvPurchase?: {
    store: {
      register: (products: ProductRegistration[]) => void;
      initialize: (platforms?: string[]) => Promise<unknown>;
      ready: (cb: () => void) => void;
      get: (id: string, platform?: string) => ProductLike | undefined;
      when: () => WhenEventChain;
      order: (offer: OfferLike) => Promise<{ isError?: boolean; message?: string } | void>;
    };
    Platform: { GOOGLE_PLAY: string; APPLE_APPSTORE: string };
    ProductType: { PAID_SUBSCRIPTION: string };
  };
}

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
  purchaseToken?: string;
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
type PurchaseOutcome = { ok: true } | { ok: false; error: string };
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

export function initNativeIAP(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (initialized) return Promise.resolve();
  if (initializing) return initializing;

  initializing = new Promise((resolve, reject) => {
    const w = window as unknown as CdvPurchaseWindow;
    const cdv = w.CdvPurchase;
    const platform = storePlatform();
    if (!cdv || !cdv.store || !platform) {
      reject(new Error("In-app purchases are not available on this device"));
      return;
    }
    try {
      cdv.store.register([
        {
          id: PRODUCT_ID,
          type: cdv.ProductType.PAID_SUBSCRIPTION,
          platform,
        },
      ]);

      cdv.store.when().approved((tx) => {
        void onApproved(tx);
      });

      cdv.store.ready(() => {
        initialized = true;
        resolve();
      });

      void cdv.store.initialize([platform]);
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });

  return initializing;
}

async function onApproved(tx: TransactionLike): Promise<void> {
  const platform = getNativePlatform();
  const productId = tx.products?.[0]?.id || PRODUCT_ID;
  const token = authToken();
  try {
    if (platform === "android") {
      const purchaseToken = tx.purchaseToken || tx.nativePurchase?.purchaseToken;
      if (!purchaseToken) throw new Error("No purchase token from Google Play");
      await apiFetch(
        GOOGLE_VERIFY_PATH,
        { method: "POST", body: JSON.stringify({ product_id: productId, purchase_token: purchaseToken }) },
        token,
      );
    } else if (platform === "ios") {
      const transactionId = tx.transactionId || tx.nativePurchase?.transactionId;
      if (!transactionId) throw new Error("No transaction id from App Store");
      await apiFetch(
        APPLE_VERIFY_PATH,
        { method: "POST", body: JSON.stringify({ transaction_id: transactionId, product_id: productId }) },
        token,
      );
    } else {
      throw new Error("Unsupported platform for IAP");
    }

    // Backend confirmed entitlement: tell the store so it doesn't refund.
    if (tx.finish) await tx.finish();
    outcomeListener?.({ ok: true });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    // eslint-disable-next-line no-console
    console.error("[native-iap] verify failed", e);
    outcomeListener?.({ ok: false, error });
  }
}

export async function launchNativePurchase(): Promise<void> {
  await initNativeIAP();
  const store = getStore();
  const platform = storePlatform();
  if (!store || !platform) throw new Error("In-app purchases are not available");
  const product = store.get(PRODUCT_ID, platform) || store.get(PRODUCT_ID);
  if (!product) throw new Error("Subscription is still loading. Try again in a moment.");

  const offer =
    (typeof product.getOffer === "function" && product.getOffer()) ||
    product.offers?.[0] ||
    product;

  const result = await store.order(offer as OfferLike);
  if (result && (result as { isError?: boolean }).isError) {
    throw new Error((result as { message?: string }).message || "Purchase failed");
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
