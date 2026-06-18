"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/lib/auth-context";
import { useSubscription } from "@/lib/subscription-context";
import { isRunningInCapacitor } from "@/lib/native-push";
import {
  startTrial,
  createSecurePaySession,
  activateSubscription,
  cancelSubscription,
  setPlan,
} from "@/lib/subscription";
import {
  launchNativePurchase,
  setPurchaseListener,
  initNativeIAP,
  getLocalizedMonthlyPrice,
} from "@/lib/play-billing";
import { useT } from "@/lib/i18n";
import CardForm, { type CardSaveResult } from "@/components/CardForm";

// ---------------------------------------------------------------------------
// Subscribe / Manage Subscription Page
// ---------------------------------------------------------------------------

export default function SubscribePage() {
  return (
    <ProtectedRoute>
      <SubscribeContent />
    </ProtectedRoute>
  );
}

function SubscribeContent() {
  const { t, lang } = useT();
  const { token } = useAuth();
  const { sub, loading: subLoading, refresh } = useSubscription();
  const router = useRouter();
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [showCardForm, setShowCardForm] = useState(false);
  const [cardSavedNote, setCardSavedNote] = useState("");
  const [planBusy, setPlanBusy] = useState(false);
  // Show the spinner only on a true cold load (no cached sub yet);
  // every subsequent visit renders instantly because the provider
  // already has state. This is the user-visible part of the speed
  // win from the SubscriptionProvider refactor.
  const loading = subLoading && !sub;

  // App Store Guideline 3.1.1 / 3.1.3 compliance: when running inside the
  // Capacitor native shell (iOS or Android), every payment-launching CTA
  // must be hidden. Solray takes subscriptions exclusively through
  // solray.ai on the web. The native app is sign-in-and-use only. New
  // members subscribe on the web first, then sign in here. This is the
  // same model Spotify, Netflix, Audible and Kindle use, and is the only
  // model Apple approves for non-Reader subscription apps that don't
  // implement StoreKit IAP.
  // Initialize synchronously so the very first render inside the native
  // WebView already knows it is native. A deferred (useEffect-only) flip
  // let /subscribe paint the web payment branches for one frame on a cold
  // native load, which both flashed the web price and risked an App Store
  // 3.1.1 read. The effect stays as a belt-and-suspenders re-check in case
  // Capacitor injects its bridge a tick late.
  const [isNative, setIsNative] = useState(() => typeof window !== "undefined" && isRunningInCapacitor());
  useEffect(() => {
    setIsNative(isRunningInCapacitor());
  }, []);

  // Subscription state now comes from the shared SubscriptionProvider
  // (sub + subLoading destructured above). The provider already warms
  // the cache on app mount, so /subscribe routes typically render
  // instantly with no network call. Force a refresh on mount to catch
  // post-payment state changes that may have happened on the Teya
  // hosted page (the SecurePay callback effect below does the same on
  // its own, but we cover the case where the user navigated here
  // without going through Teya).
  useEffect(() => {
    if (!token) return;
    void refresh();
    // Funnel event: every /subscribe view. The canary uses this to
    // detect users stuck on /subscribe without tapping anything (which
    // suggests the page is misbehaving).
    void (async () => {
      try {
        const { track } = await import("@/lib/analytics");
        await track("subscribe_view", undefined, token);
      } catch { /* ignore */ }
    })();
    // refresh is stable across renders (useCallback with [token]),
    // listing token alone is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // SecurePay callback flow: client-side activation REMOVED.
  //
  // The previous version of this effect read the Teya token from URL
  // params and POSTed it to /subscribe/card, which the backend used
  // to flip the subscription to active. That endpoint had no Teya
  // verification and was a revenue-leak hole (any authenticated user
  // could call it with a fake token). Codex P0.1 trust audit, May
  // 2026.
  //
  // The legitimate activation path is now exclusively server-to-
  // server: Teya redirects directly to backend /subscribe/teya-return,
  // backend verifies the checkhash + the order_id session_created
  // event, activates the subscription, then 302s to /subscribe/welcome.
  // The frontend never touches a Teya token.
  //
  // If we ever land on /subscribe with a stray ?token=... param (e.g.
  // a user shared the URL), strip it from the bar and refetch
  // subscription status to reflect whatever the backend actually did.
  useEffect(() => {
    if (isNative) return;
    const params = new URLSearchParams(window.location.search);
    const hasStaleToken = params.has("token") || params.has("Token") || params.has("TOKEN");
    if (hasStaleToken) {
      window.history.replaceState({}, "", "/subscribe");
      void refresh();
    }
  }, [isNative, refresh]);

  // ------------------------------------------------------------------
  // Actions
  // ------------------------------------------------------------------

  const handleStartTrial = async () => {
    if (!token) return;
    setActionLoading(true);
    setError("");
    try {
      await startTrial(token);
      // Provider refresh below pulls fresh authoritative state
      await refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddCard = async () => {
    if (!token) return;
    setError("");
    // Funnel event: user has explicitly tapped a payment-launch button.
    // This is the "intent to pay" line that the canary divides into to
    // produce the conversion-rate metric.
    try {
      const { track } = await import("@/lib/analytics");
      await track("subscribe_card_tap", { sub_status: sub?.status ?? null }, token);
    } catch { /* ignore */ }

    // Default path since 2026-06-11: the inline card form. It tokenizes in
    // the browser against RPG and stores a MULTI-use token, which is the
    // only thing monthly billing can charge. SecurePay (which never returns
    // reusable tokens) stays behind an env escape hatch in case the token
    // flow ever needs to be disabled in a hurry.
    if (process.env.NEXT_PUBLIC_USE_SECUREPAY !== "1") {
      setCardSavedNote("");
      setShowCardForm(true);
      return;
    }

    setActionLoading(true);
    try {
      const session = await createSecurePaySession(token);
      if (session.session_url) {
        window.location.href = session.session_url;
      } else {
        setError(t("subscribe.error_open_payment"));
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleActivate = async () => {
    if (!token) return;
    setActionLoading(true);
    setError("");
    try {
      await activateSubscription(token);
      // Provider refresh below pulls fresh authoritative state
      await refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!token) return;
    setActionLoading(true);
    setError("");
    try {
      await cancelSubscription(token);
      // Provider refresh below pulls fresh authoritative state
      await refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setActionLoading(false);
    }
  };

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-amber/30 border-t-amber rounded-full animate-spin" />
      </div>
    );
  }

  // Native (iOS/Android): ANY account without active access goes straight to
  // the in-app purchase screen. This covers never-subscribed, expired,
  // lapsed, past_due, and a trial that has ended. Previously these states
  // fell through to the web "management" view whose only control was a
  // "Continue to app" button that pushed to /today, where the entitlement
  // gate bounced the user right back to /subscribe: a soft-lock where
  // nothing visibly happened and the user could never reach the purchase
  // sheet. Gating on has_access (not the looser `subscribed`) is what makes
  // the StoreKit purchase reachable for every non-member on iOS.
  if (isNative && (!sub || !sub.has_access)) {
    return <NativeMembershipView />;
  }

  // No subscription yet (web only now; native handled above).
  if (!sub || !sub.subscribed) {
    return <TrialOffer onStart={handleStartTrial} loading={actionLoading} error={error} />;
  }

  // Has subscription: show status + management.
  // "Lapsed" = status still says active but the paid period (plus grace) has
  // ended and recurring billing had no card token to renew with. The user
  // must pass through SecurePay checkout once more; afterwards the period
  // restarts. Rendered like expired, with its own honest copy.
  const lapsed = sub.status === "active" && !sub.has_access;
  const statusSubtitle: Record<string, string> = {
    trial: t("subscribe.subtitle_trial"),
    active: t("subscribe.subtitle_active"),
    past_due: t("subscribe.subtitle_past_due"),
    cancelled: t("subscribe.subtitle_cancelled"),
    expired: t("subscribe.subtitle_expired"),
  };

  const dateFmt = (d: string) =>
    new Date(d).toLocaleDateString(lang === "en" ? "en-US" : lang, {
      month: "long",
      day: "numeric",
      year: "numeric",
    });

  return (
    <div className="min-h-screen px-6 pt-20 pb-32">
      <div className="max-w-md mx-auto">
        {/* Eyebrow */}
        <p
          className="text-[12px] tracking-[0.3em] uppercase mb-5 text-center"
          style={{ color: "var(--amber, #f39230)", opacity: 0.85 }}
        >
          {t("subscribe.eyebrow_subscription")}
        </p>

        {/* Header */}
        <h1
          className="text-5xl mb-5 text-center"
          style={{
            fontFamily: "var(--font-heading, 'Cormorant Garamond', Georgia, serif)",
            fontWeight: 300,
            letterSpacing: "-0.01em",
            color: "var(--text-primary, #f2ecd8)",
          }}
        >
          {t("subscribe.your_membership")}
        </h1>

        <p
          className="text-base mb-14 leading-relaxed text-center"
          style={{
            color: "var(--text-secondary, #8a9e8d)",
            fontFamily: "var(--font-heading, 'Cormorant Garamond', Georgia, serif)",
            fontStyle: "italic",
            fontWeight: 300,
          }}
        >
          {lapsed ? t("subscribe.subtitle_lapsed") : statusSubtitle[sub.status || ""] || ""}
        </p>

        {/* Status card */}
        <div
          className="rounded-sm p-7 mb-10"
          style={{
            background: "rgb(var(--rgb-card) / 0.6)",
            border: "1px solid rgba(243, 146, 48, 0.14)",
          }}
        >
          <div className="flex justify-between items-center mb-6">
            <span
              className="text-[12px] tracking-[0.3em] uppercase"
              style={{ color: "var(--text-secondary)" }}
            >
              {t("subscribe.status")}
            </span>
            <StatusBadge status={lapsed ? "expired" : sub.status || ""} />
          </div>

          <div className="space-y-3">
            {sub.status === "trial" && sub.trial_end && (
              <DetailRow label={t("subscribe.trial_ends")} value={dateFmt(sub.trial_end)} />
            )}

            {sub.current_period_end && sub.status !== "trial" && (
              <DetailRow
                label={sub.status === "cancelled" || lapsed ? t("subscribe.access_until") : t("subscribe.next_billing")}
                value={dateFmt(sub.current_period_end)}
              />
            )}

            {sub.card_brand && sub.card_last_four && (
              <DetailRow
                label={t("subscribe.card_on_file")}
                value={`${sub.card_brand} \u00b7 ${sub.card_last_four}`}
              />
            )}

            {!isNative && sub.price && sub.status !== "expired" && (
              <DetailRow
                label={t("subscribe.price")}
                value={`${sub.price} ${sub.plan === "yearly" ? t("subscribe.per_year") : t("subscribe.per_month")}`}
              />
            )}
          </div>
        </div>

        {/* Plan picker (web only, before the sub is charged). Monthly $23 or
            yearly $199. Switching POSTs /subscribe/plan and refreshes so the
            price row + the charge that follows reflect the chosen plan. The
            backend locks the plan once active, so this never shows post-charge. */}
        {!isNative && (sub.status === "trial" || sub.status === "expired") && (
          <PlanPicker
            current={sub.plan === "yearly" ? "yearly" : "monthly"}
            disabled={planBusy}
            onChoose={async (p) => {
              if (!token || planBusy) return;
              setPlanBusy(true);
              try {
                await setPlan(token, p);
                await refresh();
              } catch {
                /* keep current selection on failure; refresh shows truth */
              } finally {
                setPlanBusy(false);
              }
            }}
            t={t}
          />
        )}

        {/* Actions
            All four payment-launching CTAs (Add payment method, Subscribe
            now, Rejoin Solray, Update payment method) are HIDDEN inside
            the Capacitor native shell to comply with App Store Guideline
            3.1.1 / 3.1.3. On native, the only management action is Cancel
            (which is purely a backend call, no payment) and the always-on
            Continue to app button below. New cards and rejoin flows
            happen on solray.ai in a browser. */}
        <div className="space-y-4">
          {/* Trial without card: add payment */}
          {!isNative && sub.status === "trial" && !sub.card_last_four && (
            <ActionButton onClick={handleAddCard} loading={actionLoading} color="var(--amber, #f39230)">
              {t("subscribe.add_payment")}
            </ActionButton>
          )}

          {/* Trial with card: activate now */}
          {!isNative && sub.status === "trial" && sub.card_last_four && (
            <ActionButton onClick={handleActivate} loading={actionLoading} color="var(--amber, #f39230)">
              {t("subscribe.subscribe_now")}
            </ActionButton>
          )}

          {/* Lapsed active: paid period over, no token to auto-renew with.
              Same SecurePay checkout as rejoin; charges the month and
              restarts the period on return. */}
          {!isNative && lapsed && (
            <ActionButton onClick={handleAddCard} loading={actionLoading} color="var(--amber, #f39230)">
              {t("subscribe.renew")}
            </ActionButton>
          )}

          {/* Expired: restart */}
          {!isNative && sub.status === "expired" && (
            <ActionButton onClick={handleAddCard} loading={actionLoading} color="var(--amber, #f39230)">
              {t("subscribe.rejoin")}
            </ActionButton>
          )}

          {/* Past due: update card */}
          {!isNative && sub.status === "past_due" && (
            <ActionButton onClick={handleAddCard} loading={actionLoading} color="var(--amber, #f39230)">
              {t("subscribe.update_payment")}
            </ActionButton>
          )}

          {/* Inline card form: browser tokenization, multi-use token saved,
              due payments settled on the spot. */}
          {!isNative && showCardForm && token && (
            <CardForm
              token={token}
              onSuccess={async (r: CardSaveResult) => {
                setShowCardForm(false);
                setCardSavedNote(
                  r.charged
                    ? t("subscribe.card_saved_charged")
                    : t("subscribe.card_saved")
                );
                await refresh();
              }}
            />
          )}
          {!isNative && cardSavedNote && (
            <p
              className="text-center text-[13px]"
              style={{ color: "var(--moss, #9caf78)" }}
            >
              {cardSavedNote}
            </p>
          )}

          {/* Native-only: a soft, non-CTA status line for the states where
              the web user would have seen a payment button. No link, no
              button, no call to action; just status info. Apple permits
              status info; it does not permit calls to action that route
              to non-IAP purchasing. */}
          {isNative && (sub.status === "expired" || sub.status === "past_due" || sub.status === "trial" || lapsed) && (
            <p
              className="text-center text-[14px] leading-relaxed"
              style={{ color: "var(--text-secondary, #8a9e8d)", opacity: 0.85 }}
            >
              {t("subscribe.managed_on_web")}
            </p>
          )}

          {/* Active or trial: cancel. Available on every platform; cancel
              is a backend-only call and never touches a payment processor. */}
          {(sub.status === "active" || sub.status === "trial") && (
            <button
              onClick={handleCancel}
              disabled={actionLoading}
              className="w-full py-4 rounded-full text-[12px] tracking-[0.3em] uppercase transition-colors disabled:opacity-50"
              style={{
                color: "var(--text-secondary, #8a9e8d)",
                border: "1px solid rgba(138, 158, 141, 0.25)",
                background: "transparent",
              }}
            >
              {t("subscribe.cancel")}
            </button>
          )}
        </div>

        {/* Always-on escape hatch back into the app. The subscribe page is
            also the post-payment landing for some redirect paths, and a
            paying user must NEVER be able to land here without a clear
            way to get back to /today. Shown for every subscription state
            so it's impossible to design ourselves into another stranded
            paying-customer situation. */}
        <div className="mt-8">
          <button
            onClick={() => router.push("/today")}
            className="w-full py-4 rounded-full text-[12px] tracking-[0.3em] uppercase transition-colors"
            style={{
              color: "var(--bg-deep, #050f08)",
              background: "var(--amber, #f39230)",
            }}
          >
            {t("subscribe.continue_to_app")}
          </button>
        </div>

        {error && (
          <p
            className="text-sm mt-6 text-center"
            style={{ color: "var(--ember, #d47a52)" }}
          >
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function PlanPicker({
  current,
  disabled,
  onChoose,
  t,
}: {
  current: "monthly" | "yearly";
  disabled: boolean;
  onChoose: (plan: "monthly" | "yearly") => void;
  t: (k: string) => string;
}) {
  const options: { key: "monthly" | "yearly"; price: string; per: string; note?: string }[] = [
    { key: "monthly", price: "$23", per: t("subscribe.per_month") },
    { key: "yearly", price: "$199", per: t("subscribe.per_year"), note: t("subscribe.plan_yearly_save") },
  ];
  return (
    <div className="mb-4">
      <p className="mb-2 text-[12px] tracking-wide" style={{ color: "var(--pearl-dim, #9aa9a0)" }}>
        {t("subscribe.plan_choose")}
      </p>
      <div className="grid grid-cols-2 gap-3">
        {options.map((o) => {
          const active = current === o.key;
          return (
            <button
              key={o.key}
              type="button"
              disabled={disabled}
              onClick={() => !active && onChoose(o.key)}
              className="rounded-2xl border px-4 py-3 text-left transition-colors"
              style={{
                borderColor: active ? "var(--amber, #f39230)" : "var(--line, rgba(255,255,255,.12))",
                background: active ? "rgba(243,146,48,.10)" : "transparent",
                opacity: disabled ? 0.6 : 1,
                cursor: disabled ? "default" : "pointer",
              }}
            >
              <div className="text-[13px]" style={{ color: "var(--pearl-dim, #9aa9a0)" }}>
                {o.key === "yearly" ? t("subscribe.plan_yearly") : t("subscribe.plan_monthly")}
              </div>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-[20px] font-medium" style={{ color: "var(--ink, #f2ecd8)" }}>{o.price}</span>
                <span className="text-[12px]" style={{ color: "var(--pearl-dim, #9aa9a0)" }}>{o.per}</span>
              </div>
              {o.note && (
                <div className="mt-1 text-[11px]" style={{ color: "var(--moss, #9caf78)" }}>{o.note}</div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-baseline">
      <span
        className="text-[12px] tracking-[0.22em] uppercase"
        style={{ color: "var(--text-secondary)", opacity: 0.7 }}
      >
        {label}
      </span>
      <span
        className="text-[17px]"
        style={{ color: "var(--text-primary, #f2ecd8)" }}
      >
        {value}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

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
function NativeMembershipView() {
  const { t } = useT();
  const { logout } = useAuth();
  const { refresh } = useSubscription();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [priceLabel, setPriceLabel] = useState<string | null>(null);

  // Warm the StoreKit/Play store on mount so (a) tapping Subscribe opens the
  // sheet instantly and (b) we can show the localized recurring price on the
  // paywall itself, which App Store Guideline 3.1.2 expects. Best-effort.
  useEffect(() => {
    let cancelled = false;
    void initNativeIAP()
      .then(() => { if (!cancelled) setPriceLabel(getLocalizedMonthlyPrice()); })
      .catch(() => { /* sheet still shows the price on tap; disclosure covers terms */ });
    return () => { cancelled = true; };
  }, []);

  // Wire the store callback once: when the backend confirms a verified
  // purchase, refresh entitlement so the page re-renders into the
  // membership view. A failure surfaces inline.
  useEffect(() => {
    setPurchaseListener((outcome) => {
      if (outcome.ok) {
        void refresh();
        setLoading(false);
        setError("");
      } else {
        setLoading(false);
        setError(outcome.error || t("subscribe.purchase_failed"));
      }
    });
    return () => setPurchaseListener(null);
  }, [refresh]);

  const handleSubscribe = async () => {
    setError("");
    setLoading(true);
    try {
      // Opens the native store sheet. The approved -> verify -> finish flow
      // runs in play-billing.ts; the listener above flips state on success.
      await launchNativePurchase();
    } catch (e) {
      setLoading(false);
      setError(e instanceof Error ? e.message : t("subscribe.purchase_not_started"));
    }
  };

  return (
    <div className="min-h-screen px-6 pt-20 pb-32">
      <div className="max-w-md mx-auto text-center">
        <p
          className="text-[12px] tracking-[0.3em] uppercase mb-5"
          style={{ color: "var(--amber, #f39230)", opacity: 0.85 }}
        >
          {t("subscribe.eyebrow_lbd")}
        </p>

        <h1
          className="text-5xl mb-5"
          style={{
            fontFamily: "var(--font-heading, 'Cormorant Garamond', Georgia, serif)",
            fontWeight: 300,
            letterSpacing: "-0.01em",
            color: "var(--text-primary, #f2ecd8)",
          }}
        >
          {t("subscribe.chart_spoken_to")}
        </h1>

        <p
          className="text-base mb-12 leading-relaxed"
          style={{
            color: "var(--text-secondary, #8a9e8d)",
            fontFamily: "var(--font-heading, 'Cormorant Garamond', Georgia, serif)",
            fontStyle: "italic",
            fontWeight: 300,
          }}
        >
          {t("subscribe.native_blurb")}
        </p>

        <div className="space-y-3">
          <button
            onClick={handleSubscribe}
            disabled={loading}
            className="w-full py-4 rounded-full text-[12px] tracking-[0.3em] uppercase transition-colors disabled:opacity-50"
            style={{
              color: "var(--bg-deep, #0f1f17)",
              background: "var(--amber, #f39230)",
              border: "1px solid var(--amber, #f39230)",
            }}
          >
            {loading ? t("subscribe.opening") : t("subscribe.start_free_trial")}
          </button>

          <button
            onClick={logout}
            className="w-full py-4 rounded-full text-[12px] tracking-[0.3em] uppercase transition-colors"
            style={{
              color: "var(--text-secondary, #8a9e8d)",
              border: "1px solid rgba(138, 158, 141, 0.25)",
              background: "transparent",
            }}
          >
            {t("common.sign_out")}
          </button>

          {error && (
            <p className="text-sm pt-2" style={{ color: "var(--ember, #c4684a)" }}>
              {error}
            </p>
          )}
        </div>

        {/* App Store Guideline 3.1.2: the paywall itself must show the price,
            duration, auto-renew terms, and functional Terms of Use + Privacy
            Policy links. Apple's purchase sheet shows the price too, but
            reviewers expect it on our screen. Links open in the system
            browser (they are not in the WebView allow-list). */}
        <div className="mt-9 space-y-3 text-center">
          {priceLabel && (
            <p className="text-[13px]" style={{ color: "var(--text-primary, #f2ecd8)" }}>
              {t("subscribe.free_week_then")} {priceLabel} {t("subscribe.per_month")}
            </p>
          )}
          <p
            className="text-[12px] leading-relaxed mx-auto"
            style={{ color: "var(--text-secondary, #8a9e8d)", opacity: 0.8, maxWidth: "22rem" }}
          >
            {t("subscribe.auto_renew_terms")}
          </p>
          <p className="text-[12px]">
            <a
              href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--amber, #f39230)", textDecoration: "underline" }}
            >
              {t("subscribe.terms_of_use")}
            </a>
            <span style={{ color: "var(--text-secondary, #8a9e8d)", opacity: 0.5 }}>{"   ·   "}</span>
            <a
              href="https://solray.ai/legal"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--amber, #f39230)", textDecoration: "underline" }}
            >
              {t("subscribe.privacy_policy")}
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

function TrialOffer({
  onStart,
  loading,
  error,
}: {
  onStart: () => void;
  loading: boolean;
  error: string;
}) {
  const { t } = useT();
  return (
    <div className="min-h-screen px-6 pt-20 pb-32">
      <div className="max-w-md mx-auto text-center">
        {/* Eyebrow */}
        <p
          className="text-[12px] tracking-[0.3em] uppercase mb-5"
          style={{ color: "var(--amber, #f39230)", opacity: 0.85 }}
        >
          {t("subscribe.eyebrow_lbd")}
        </p>

        <h1
          className="text-5xl mb-5"
          style={{
            fontFamily: "var(--font-heading, 'Cormorant Garamond', Georgia, serif)",
            fontWeight: 300,
            letterSpacing: "-0.01em",
            color: "var(--text-primary, #f2ecd8)",
          }}
        >
          {t("subscribe.chart_spoken_to")}
        </h1>

        <p
          className="text-base mb-14 leading-relaxed"
          style={{
            color: "var(--text-secondary, #8a9e8d)",
            fontFamily: "var(--font-heading, 'Cormorant Garamond', Georgia, serif)",
            fontStyle: "italic",
            fontWeight: 300,
          }}
        >
          {t("subscribe.trial_blurb")}
        </p>

        {/* What you get */}
        <div
          className="text-left rounded-sm p-7 mb-10"
          style={{
            background: "rgb(var(--rgb-card) / 0.6)",
            border: "1px solid rgba(243, 146, 48, 0.14)",
          }}
        >
          <p
            className="text-[12px] tracking-[0.3em] uppercase mb-6"
            style={{ color: "var(--text-secondary)" }}
          >
            {t("subscribe.everything_included")}
          </p>
          {[
            t("subscribe.feature_oracle"),
            t("subscribe.feature_forecast"),
            t("subscribe.feature_souls"),
            t("subscribe.feature_blueprint"),
            t("subscribe.feature_transits"),
          ].map((item) => (
            <div key={item} className="flex items-start gap-4 mb-3.5 last:mb-0">
              <span
                className="mt-[7px] shrink-0"
                style={{
                  width: 4,
                  height: 4,
                  borderRadius: 999,
                  background: "var(--amber, #f39230)",
                  opacity: 0.75,
                }}
              />
              <span
                className="text-[17px] leading-snug"
                style={{ color: "var(--text-primary, #f2ecd8)" }}
              >
                {item}
              </span>
            </div>
          ))}
        </div>

        {/* Pricing */}
        <div className="mb-10">
          <p
            className="text-xs tracking-wide"
            style={{ color: "var(--text-secondary)" }}
          >
            {t("subscribe.five_days_then")}
          </p>
          <p
            className="mt-2"
            style={{
              color: "var(--text-primary)",
              fontFamily: "var(--font-heading, 'Cormorant Garamond', Georgia, serif)",
              fontWeight: 300,
              fontSize: "3rem",
              lineHeight: 1,
            }}
          >
            $23
            <span
              className="ml-1"
              style={{
                fontSize: "1rem",
                color: "var(--text-secondary)",
                fontStyle: "italic",
              }}
            >
              {t("subscribe.per_month")}
            </span>
          </p>
          <p
            className="text-xs mt-3 tracking-wide"
            style={{ color: "var(--text-secondary)", opacity: 0.75 }}
          >
            {t("subscribe.cancel_anytime")}
          </p>
        </div>

        <ActionButton onClick={onStart} loading={loading} color="var(--amber, #f39230)">
          {t("login.begin_journey")}
        </ActionButton>

        {error && (
          <p className="text-sm mt-4" style={{ color: "var(--ember, #d47a52)" }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useT();
  const colors: Record<string, { bg: string; text: string; border: string }> = {
    trial: {
      bg: "rgba(243,146,48,0.12)",
      text: "var(--amber, #f39230)",
      border: "rgba(243,146,48,0.35)",
    },
    active: {
      bg: "rgba(138,158,102,0.12)",
      text: "var(--moss, #8a9e66)",
      border: "rgba(138,158,102,0.35)",
    },
    past_due: {
      bg: "rgba(212,122,82,0.12)",
      text: "var(--ember, #d47a52)",
      border: "rgba(212,122,82,0.35)",
    },
    cancelled: {
      bg: "rgba(138,158,141,0.08)",
      text: "var(--text-secondary, #8a9e8d)",
      border: "rgba(138,158,141,0.25)",
    },
    expired: {
      bg: "rgba(138,158,141,0.08)",
      text: "var(--text-secondary, #8a9e8d)",
      border: "rgba(138,158,141,0.25)",
    },
  };
  const c = colors[status] || colors.expired;

  const label: Record<string, string> = {
    trial: t("subscribe.badge_trial"),
    active: t("subscribe.badge_active"),
    past_due: t("subscribe.badge_retrying"),
    cancelled: t("subscribe.badge_cancelled"),
    expired: t("subscribe.badge_expired"),
  };

  return (
    <span
      className="text-[12px] tracking-[0.3em] uppercase px-3 py-1.5 rounded-full"
      style={{
        background: c.bg,
        color: c.text,
        border: `1px solid ${c.border}`,
      }}
    >
      {label[status] || status.replace("_", " ")}
    </span>
  );
}

function ActionButton({
  onClick,
  loading,
  color,
  children,
}: {
  onClick: () => void;
  loading: boolean;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="w-full py-4 px-8 rounded-full text-[13px] tracking-[0.3em] uppercase transition-all duration-300 disabled:opacity-50 hover:brightness-110"
      style={{
        background: color,
        color: "var(--bg-deep)",
        boxShadow: "0 1px 0 rgba(255,255,255,0.08) inset, 0 8px 24px rgba(243,146,48,0.12)",
      }}
    >
      {loading ? (
        <span className="inline-block w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin align-middle" />
      ) : (
        children
      )}
    </button>
  );
}
