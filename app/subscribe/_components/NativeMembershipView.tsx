"use client";

import { beginUnfinishedWork, registerUnfinishedWork } from "@/lib/draft-guard";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useSubscription } from "@/lib/subscription-context";
import { announceStorePurchase, releaseStorePurchase } from "@/lib/subscription";
import { storeGateErrorCode } from "@/lib/native-iap-helpers";
import { ApiError } from "@/lib/api";
import { launchNativePurchase, restoreNativePurchases, setPurchaseListener, initNativeIAP, getLocalizedMonthlyPrice, getLocalizedYearlyPrice, nativePlanState, onNativeProductsUpdated, MONTHLY_PRODUCT_ID, YEARLY_PRODUCT_ID, NativeIAPError, type NativePlanState } from "@/lib/play-billing";
import { useT } from "@/lib/i18n";
import { termsOfUseUrl } from "@/lib/legal-links";
import { PageHead, PageTitle, HairlineButton } from "@/components/PageHead";

/**
 * NativeMembershipView
 *
 * Rendered when /subscribe loads inside the Capacitor native shell and the
 * signed-in user has no active subscription. Apple App Store Guideline
 * 3.1.1 prohibits any digital-subscription payment outside of IAP, and
 * 3.1.3 prohibits buttons, external links, and calls to action that
 * direct customers to non-IAP purchasing. The native app subscribes
 * exclusively through StoreKit in-app purchase: the button below opens
 * Apple's purchase sheet via launchNativePurchase (cordova-plugin-purchase),
 * the backend verifies the receipt, and entitlement refreshes in place.
 * No web payment path is ever shown on native.
 */
// If the store never calls back after the sheet opened (Ask to Buy waiting
// on a parent, a pending bank approval, a sheet dismissed without an event),
// stop the spinner instead of leaving the member on "Opening..." forever.
const NATIVE_PURCHASE_TIMEOUT_MS = 60_000;

export function NativeMembershipView({ onSignOut, onAccountSettings, onContinue }: { onSignOut: () => void; onAccountSettings: () => void; onContinue?: () => void }) {
  const { t } = useT();
  const { token } = useAuth();
  const { refresh, sub } = useSubscription();
  const accountToken = sub?.store_account_token || null;
  // One free trial per person: true only when the server confirmed this
  // email has not had it. Unknown or false: no free trial is promised or
  // ordered (review 2, finding 7). The store gate answers it fresh again
  // right before the sheet opens.
  const trialEligible = sub?.trial_eligible;
  const trialEligibleRef = useRef<boolean | undefined>(trialEligible);
  trialEligibleRef.current = trialEligible;
  // Server switch (default off): only when on is a plan refused whose sole
  // store offer is the free intro of a used trial. Off, that plan is sold
  // on the store's own terms with no trial promised here.
  const strictTrial = sub?.strict_cross_channel_trial === true;
  const strictTrialRef = useRef<boolean>(strictTrial);
  strictTrialRef.current = strictTrial;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pendingNote, setPendingNote] = useState("");
  const purchaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearPurchaseTimer = () => {
    if (purchaseTimer.current) {
      clearTimeout(purchaseTimer.current);
      purchaseTimer.current = null;
    }
  };
  useEffect(() => () => clearPurchaseTimer(), []);
  // A store purchase not resolved yet: held from the tap until the store
  // cancels or fails it or the server has verified it, whatever the
  // timeout below does to the spinner (it only shows the pending note).
  // The update reload waits for it (lib/draft-guard), so the purchase
  // listener is never torn down while the purchase can still land.
  const purchaseHoldRef = useRef<(() => void) | null>(null);
  const holdPurchase = () => {
    if (!purchaseHoldRef.current) purchaseHoldRef.current = beginUnfinishedWork();
  };
  const endPurchaseHold = () => {
    const release = purchaseHoldRef.current;
    purchaseHoldRef.current = null;
    release?.();
  };
  // Leaving this screen removes its listener: nothing left to protect here.
  useEffect(() => () => endPurchaseHold(), []);
  // Store-localized recurring prices per plan (null until the store is ready).
  const [prices, setPrices] = useState<{ monthly: string | null; yearly: string | null }>({ monthly: null, yearly: null });
  const [plan, setPlanChoice] = useState<"monthly" | "yearly">("monthly");
  // What each plan can do for this member (trial, paid, store_intro,
  // unavailable, checking). Only "trial" gets the free-trial wording and
  // button; "store_intro" (trial used, the store lists only its free intro)
  // is sold with neutral wording ("Start membership") and never promises a
  // trial; an "unavailable" plan (no offer, or the server's strict mode)
  // cannot be bought here and says so.
  const [planStates, setPlanStates] = useState<{ monthly: NativePlanState; yearly: NativePlanState }>({ monthly: "loading", yearly: "loading" });
  const selectedState = plan === "yearly" ? planStates.yearly : planStates.monthly;
  const planHasTrial = selectedState === "trial";
  const planStoreIntro = selectedState === "store_intro";

  // Load the store on mount so (a) tapping Subscribe opens the sheet
  // instantly and (b) the paywall shows the localized recurring price, which
  // App Store Guideline 3.1.2 requires before anyone is asked to subscribe.
  // Subscribe stays disabled until the chosen plan has a real price; a load
  // failure is shown with Try again instead of being swallowed (B5).
  const [storeState, setStoreState] = useState<"loading" | "ready" | "failed">("loading");
  const readPrices = () => {
    setPrices({ monthly: getLocalizedMonthlyPrice(), yearly: getLocalizedYearlyPrice() });
    setPlanStates({
      monthly: nativePlanState(MONTHLY_PRODUCT_ID, trialEligibleRef.current, strictTrialRef.current),
      yearly: nativePlanState(YEARLY_PRODUCT_ID, trialEligibleRef.current, strictTrialRef.current),
    });
  };
  // Eligibility can arrive after the store loaded: re-read the offers.
  useEffect(() => {
    if (storeState === "ready") readPrices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trialEligible, strictTrial]);
  const loadStore = () => {
    let cancelled = false;
    setStoreState("loading");
    initNativeIAP()
      .then(() => {
        if (cancelled) return;
        readPrices();
        setStoreState("ready");
      })
      .catch(() => {
        if (cancelled) return;
        readPrices();
        setStoreState("failed");
      });
    return () => { cancelled = true; };
  };
  useEffect(() => {
    const stop = loadStore();
    // Products can arrive after initialisation: re-read on every update.
    const off = onNativeProductsUpdated(() => {
      readPrices();
      if (getLocalizedMonthlyPrice() || getLocalizedYearlyPrice()) setStoreState("ready");
    });
    return () => { stop(); off(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const selectedPrice = plan === "yearly" ? prices.yearly : prices.monthly;
  // Default to a plan the store actually priced (e.g. yearly still in review).
  useEffect(() => {
    if (!prices.monthly && prices.yearly && plan === "monthly") setPlanChoice("yearly");
    if (!prices.yearly && prices.monthly && plan === "yearly") setPlanChoice("monthly");
  }, [prices, plan]);
  const canPurchase = storeState === "ready" && Boolean(selectedPrice) && selectedState !== "unavailable";

  // Wire the store callback once: when the backend confirms a verified
  // purchase, refresh entitlement so the page re-renders into the
  // membership view. A failure surfaces inline.
  useEffect(() => {
    setPurchaseListener((outcome) => {
      clearPurchaseTimer();
      // Verified or failed: the purchase is resolved.
      endPurchaseHold();
      setPendingNote("");
      if (outcome.ok) {
        void refresh();
        setLoading(false);
        setError("");
      } else {
        setLoading(false);
        setError(outcome.code ? t(`subscribe.iap_${outcome.code}`) : t("subscribe.purchase_failed"));
      }
    });
    return () => setPurchaseListener(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh]);

  // Restore Purchases: replays this Apple ID's (or Google account's)
  // existing subscription through the same verify path as a new purchase.
  // Success is only reported once the server has confirmed access (B5).
  const [restoring, setRestoring] = useState(false);
  // A store purchase sheet or a restore under way: the update reload waits
  // (lib/draft-guard), so the purchase listener and its verification are
  // never torn down mid-purchase.
  const storeBusyRef = useRef(false);
  storeBusyRef.current = loading || restoring;
  useEffect(() => registerUnfinishedWork(() => storeBusyRef.current), []);
  const handleRestore = async () => {
    if (restoring || loading) return;
    setError("");
    setPendingNote("");
    setRestoring(true);
    try {
      const outcome = await restoreNativePurchases(accountToken);
      // Bounded (the status call has a deadline), so Restore never stays busy.
      const fresh = await refresh();
      setPendingNote(
        !fresh ? t("subscribe.status_unconfirmed")
          : outcome === "restored" ? t("subscribe.restore_done") : t("subscribe.restore_none"),
      );
    } catch (e) {
      setError(e instanceof NativeIAPError ? t(`subscribe.iap_${e.code}`) : t("subscribe.restore_failed"));
      void refresh();
    } finally {
      setRestoring(false);
    }
  };

  const handleSubscribe = async () => {
    if (!canPurchase || !token) return;
    setError("");
    setPendingNote("");
    setLoading(true);
    holdPurchase();
    const productId = plan === "yearly" ? YEARLY_PRODUCT_ID : MONTHLY_PRODUCT_ID;
    const release = () => { void releaseStorePurchase(token).catch(() => { /* lapses on its own */ }); };

    // Review 2, finding 2: ask the server BEFORE the store sheet opens. It
    // refuses while a card payment on this account is in flight or still
    // being confirmed, holds card billing back while this purchase happens,
    // and answers trial eligibility fresh. No answer, no sheet: this check
    // is what keeps the store and the card from both charging.
    let eligible: boolean;
    let strict: boolean;
    try {
      const gate = await announceStorePurchase(token);
      eligible = gate.trial_eligible === true;
      strict = gate.strict_cross_channel_trial === true;
    } catch (e) {
      setLoading(false);
      endPurchaseHold();
      const code = e instanceof ApiError ? storeGateErrorCode(e.status, e.code) : "check_failed";
      setError(t(`subscribe.iap_${code}`));
      void refresh();
      return;
    }
    // Finding 7: a free trial is promised only with confirmed eligibility.
    // When the trial was used and this product only has a free
    // introductory offer, the purchase still goes ahead on the store's own
    // terms (the server records it for reconciliation), unless the server's
    // strict mode is on: then nothing is ordered and the paywall says so.
    const state = nativePlanState(productId, eligible, strict);
    trialEligibleRef.current = eligible;
    strictTrialRef.current = strict;
    if (state !== "trial" && state !== "paid" && state !== "store_intro") {
      release();
      setLoading(false);
      endPurchaseHold();
      setError(state === "unavailable" ? t("subscribe.iap_trial_used") : t("subscribe.iap_loading"));
      readPrices();
      return;
    }
    if (state !== selectedState) readPrices(); // the wording follows the fresh answer

    clearPurchaseTimer();
    purchaseTimer.current = setTimeout(() => {
      purchaseTimer.current = null;
      // The spinner stops and the pending note shows; the purchase hold
      // stays until the purchase is resolved.
      setLoading(false);
      setPendingNote(t("subscribe.purchase_pending"));
      // The purchase may still land; pick up whatever the backend knows.
      void refresh();
    }, NATIVE_PURCHASE_TIMEOUT_MS);
    try {
      // Opens the native store sheet for the chosen plan. The approved ->
      // verify -> finish flow runs in play-billing.ts; the listener above
      // flips state on success.
      const started = await launchNativePurchase(productId, accountToken, eligible, strict);
      if (started === "cancelled") {
        // Closing the store sheet is a choice, not an error.
        clearPurchaseTimer();
        setLoading(false);
        endPurchaseHold();
        release();
      }
    } catch (e) {
      clearPurchaseTimer();
      setLoading(false);
      endPurchaseHold();
      release();
      setError(e instanceof NativeIAPError ? t(`subscribe.iap_${e.code}`) : t("subscribe.purchase_not_started"));
    }
  };

  return (
    <div className="min-h-[100dvh] bg-forest-deep" style={{ paddingBottom: "calc(96px + var(--sab, 0px))" }}>
      <PageHead label={t("subscribe.eyebrow_lbd")} />
      <div className="max-w-lg mx-auto px-5">
        <PageTitle title={t("subscribe.chart_spoken_to")} sub={planHasTrial ? t("subscribe.native_blurb") : t("subscribe.native_blurb_paid")} />

        {/* Plan choice: monthly or annual. Free-trial wording follows what
            the store reports for each plan; the chosen product id is what gets ordered. */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          {([
            { key: "monthly" as const, price: prices.monthly || "…", per: t("subscribe.per_month"), label: t("subscribe.plan_monthly"), priced: Boolean(prices.monthly) },
            { key: "yearly" as const, price: prices.yearly || "…", per: t("subscribe.per_year"), label: t("subscribe.plan_yearly"), priced: Boolean(prices.yearly) },
          ]).map((o) => {
            const selected = plan === o.key;
            return (
              <button
                key={o.key}
                onClick={() => setPlanChoice(o.key)}
                disabled={loading || !o.priced}
                className="py-4 px-4 rounded-sm text-left transition-colors disabled:opacity-50"
                style={{
                  border: selected ? "1px solid rgb(var(--rgb-text-primary))" : "1px solid rgb(var(--rgb-border))",
                  background: selected ? "rgb(var(--rgb-card))" : "transparent",
                }}
              >
                <span className="block text-[13px] tracking-[0.25em] uppercase font-bold" style={{ color: "rgb(var(--rgb-text-secondary))" }}>{o.label}</span>
                <span className="block text-xl mt-1" style={{ color: "rgb(var(--rgb-text-primary))" }}>{o.price}</span>
                <span className="block text-[13px]" style={{ color: "rgb(var(--rgb-text-secondary))" }}>{o.per}</span>
              </button>
            );
          })}
        </div>

        <div className="space-y-3">
          {storeState !== "ready" && (
            <p className="font-body" role="status" style={{ fontSize: 15, color: storeState === "failed" ? "rgb(var(--rgb-ember))" : "rgb(var(--rgb-text-secondary))" }}>
              {storeState === "failed" ? t("subscribe.prices_failed") : t("subscribe.prices_loading")}
            </p>
          )}
          {storeState === "failed" && (
            <HairlineButton onClick={() => { loadStore(); }}>{t("common.retry")}</HairlineButton>
          )}
          <button
            onClick={handleSubscribe}
            disabled={loading || !canPurchase}
            className="w-full py-4 rounded-full text-[14px] tracking-[0.3em] uppercase transition-colors disabled:opacity-50 font-bold"
            style={{
              color: "rgb(var(--rgb-bg-deep))",
              background: "rgb(var(--rgb-text-primary))",
              border: "1.5px solid rgb(var(--rgb-text-primary))",
            }}
          >
            {loading ? t("subscribe.opening") : planHasTrial ? t("subscribe.start_free_trial") : planStoreIntro ? t("subscribe.start_membership") : t("subscribe.subscribe_now")}
          </button>

          {onContinue && (
            <HairlineButton onClick={onContinue} disabled={loading}>{t("subscribe.continue_to_app")}</HairlineButton>
          )}
          <HairlineButton onClick={handleRestore} loading={restoring} disabled={loading || storeState === "loading"}>
            {t("subscribe.restore_purchases")}
          </HairlineButton>
          <HairlineButton onClick={onSignOut}>{t("common.sign_out")}</HairlineButton>
          <HairlineButton onClick={onAccountSettings}>{t("subscribe.account_settings")}</HairlineButton>

          {storeState === "ready" && selectedState === "unavailable" && !error && (
            <p className="font-body pt-2" role="status" style={{ fontSize: 15, lineHeight: 1.5, color: "rgb(var(--rgb-text-secondary))" }}>
              {t("subscribe.iap_trial_used")}
            </p>
          )}

          {pendingNote && (
            <p className="font-body pt-2" style={{ fontSize: 15, lineHeight: 1.5, color: "rgb(var(--rgb-text-secondary))" }}>
              {pendingNote}
            </p>
          )}

          {error && (
            <p className="text-sm pt-2" style={{ color: "rgb(var(--rgb-ember))" }}>
              {error}
            </p>
          )}
        </div>

        {/* App Store Guideline 3.1.2: the paywall itself must show the price,
            duration, auto-renew terms, and functional Terms of Use + Privacy
            Policy links. Apple's purchase sheet shows the price too, but
            reviewers expect it on our screen. Links open in the system
            browser (they are not in the WebView allow-list). */}
        <div className="mt-9 space-y-3">
          {(plan === "yearly" ? prices.yearly : prices.monthly) && (
            <p className="text-[15px]" style={{ color: "rgb(var(--rgb-text-primary))" }}>
              {planHasTrial ? `${t("subscribe.free_week_then")} ` : ""}{plan === "yearly" ? prices.yearly : prices.monthly}{" "}
              {plan === "yearly" ? t("subscribe.per_year") : t("subscribe.per_month")}
              {planHasTrial ? "" : `, ${t("subscribe.renews_automatically")}`}
            </p>
          )}
          <p
            className="text-[14px] leading-relaxed"
            style={{ color: "rgb(var(--rgb-text-secondary))" }}
          >
            {planHasTrial ? t("subscribe.auto_renew_terms") : planStoreIntro ? t("subscribe.auto_renew_terms_store") : t("subscribe.auto_renew_terms_paid")}
          </p>
          <p className="text-[14px]">
            <a
              href={termsOfUseUrl()}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "rgb(var(--rgb-text-primary))", textDecoration: "underline", textUnderlineOffset: 3 }}
            >
              {t("subscribe.terms_of_use")}
            </a>
            <span style={{ color: "rgb(var(--rgb-text-muted))" }}>{"   ·   "}</span>
            <a
              href="https://solray.ai/legal"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "rgb(var(--rgb-text-primary))", textDecoration: "underline", textUnderlineOffset: 3 }}
            >
              {t("subscribe.privacy_policy")}
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
