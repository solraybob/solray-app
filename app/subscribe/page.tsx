"use client";

import { useEffect, useRef, useState } from "react";
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
  resendVerification,
  announceStorePurchase,
  releaseStorePurchase,
  DeadlineError,
  storeEndedCardNotice,
} from "@/lib/subscription";
import { storeGateErrorCode } from "@/lib/native-iap-helpers";
import { ApiError } from "@/lib/api";
import {
  launchNativePurchase,
  restoreNativePurchases,
  setPurchaseListener,
  initNativeIAP,
  getLocalizedMonthlyPrice,
  getLocalizedYearlyPrice,
  nativePlanState,
  onNativeProductsUpdated,
  MONTHLY_PRODUCT_ID,
  YEARLY_PRODUCT_ID,
  NativeIAPError,
  type NativePlanState,
} from "@/lib/play-billing";
import { useT } from "@/lib/i18n";
import { termsOfUseUrl } from "@/lib/legal-links";
import CardForm, { type CardSaveResult } from "@/components/CardForm";
import { PageHead, PageTitle, Section, HairlineButton } from "@/components/PageHead";

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
  const { token, logout } = useAuth();
  const { sub, loading: subLoading, refresh, error: subError } = useSubscription();
  const router = useRouter();
  // Notices carried in by redirects: ?payment=failed (card declined or the
  // hosted page was cancelled) and ?activation=unknown (payment went
  // through but activation has not been confirmed yet).
  const [notice, setNotice] = useState<"" | "payment_failed" | "activation_pending" | "trial_used">("");
  const [retrying, setRetrying] = useState(false);

  const handleSignOut = () => {
    logout();
    router.replace("/login");
  };
  // Account settings (deletion, privacy) stay reachable without access.
  const handleAccountSettings = () => router.push("/profile/settings");
  // Billing errors in the member's language. A deadline means the outcome is
  // unknown: say so and pull fresh status instead of inviting a blind retry.
  // Every action re-reads the membership afterwards. The status call has a
  // deadline; when it could not be confirmed, say so (B5) rather than leave
  // the screen implying it is current.
  const refreshAfterAction = async () => {
    const fresh = await refresh();
    if (!fresh) setError(t("subscribe.status_unconfirmed"));
    return fresh;
  };
  const billingError = (e: unknown, paymentStep = false): string => {
    if (e instanceof DeadlineError) {
      void refresh();
      return paymentStep ? t("subscribe.payment_timeout") : t("subscribe.action_timeout");
    }
    if (e instanceof ApiError && e.code === "charge_pending") return t("subscribe.charge_pending");
    if (e instanceof ApiError && e.code === "store_purchase_pending") return t("subscribe.store_purchase_pending");
    if (e instanceof ApiError && e.code === "store_managed") return t("subscribe.store_managed_card");
    const storeEnded = storeEndedCardNotice(e, t, lang);
    if (storeEnded !== null) return storeEnded;
    return e instanceof Error && e.message ? e.message : t("subscribe.purchase_failed");
  };
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [showCardForm, setShowCardForm] = useState(false);
  const [cardSavedNote, setCardSavedNote] = useState("");
  // A calm, non-error note from the card form (a store membership ended
  // with paid time left: nothing was charged, the form closes).
  const [cardNotice, setCardNotice] = useState("");
  const [planBusy, setPlanBusy] = useState(false);
  const [planError, setPlanError] = useState("");
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
    void import("@/lib/analytics")
      .then(({ track }) => track("subscribe_view", undefined, token))
      .catch(() => { /* ignore */ });
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
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("payment") === "failed") setNotice("payment_failed");
      else if (params.get("activation") === "unknown") setNotice("activation_pending");
    } catch { /* ignore */ }
  }, []);

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
      const res = await startTrial(token);
      if (res?.trial_used) setNotice("trial_used");
      // Provider refresh below pulls fresh authoritative state
      await refreshAfterAction();
    } catch (e) {
      setError(billingError(e));
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
    // Fire and forget: analytics must never delay opening the card form.
    void import("@/lib/analytics")
      .then(({ track }) => track("subscribe_card_tap", { sub_status: sub?.status ?? null }, token))
      .catch(() => { /* ignore */ });

    // Default path since 2026-06-11: the inline card form. It tokenizes in
    // the browser against RPG and stores a MULTI-use token, which is the
    // only thing monthly billing can charge. SecurePay (which never returns
    // reusable tokens) stays behind an env escape hatch in case the token
    // flow ever needs to be disabled in a hurry.
    if (process.env.NEXT_PUBLIC_USE_SECUREPAY !== "1") {
      setCardSavedNote("");
      setCardNotice("");
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
    } catch (e) {
      setError(billingError(e));
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
      await refreshAfterAction();
    } catch (e) {
      setError(billingError(e, true));
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
      await refreshAfterAction();
    } catch (e) {
      setError(billingError(e));
    } finally {
      setActionLoading(false);
    }
  };

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-forest-deep flex items-center justify-center">
        <div className="w-6 h-6 rounded-full animate-spin" style={{ border: "2px solid rgb(var(--rgb-border))", borderTopColor: "rgb(var(--rgb-text-primary))" }} />
      </div>
    );
  }

  // Status call failed and there is nothing cached: say so and offer a
  // retry. Falling through here used to show the trial offer (or, on
  // native, the purchase sheet) to members who may already be paying.
  if (!sub && subError) {
    return (
      <div className="min-h-[100dvh] bg-forest-deep" style={{ paddingBottom: "calc(96px + var(--sab, 0px))" }}>
        <PageHead label={t("subscribe.eyebrow_subscription")} />
        <div className="max-w-lg mx-auto px-5">
          <PageTitle title={t("subscribe.status_error_title")} sub={t("subscribe.status_error_body")} />
          <div className="space-y-3">
            <ActionButton
              onClick={async () => {
                setRetrying(true);
                try { await refresh(); } finally { setRetrying(false); }
              }}
              loading={retrying}
            >
              {t("common.retry")}
            </ActionButton>
            <HairlineButton onClick={handleSignOut}>{t("common.sign_out")}</HairlineButton>
          </div>
        </div>
      </div>
    );
  }

  const noticeText =
    notice === "payment_failed" ? t("subscribe.payment_failed") :
    notice === "activation_pending" ? t("subscribe.activation_pending") :
    notice === "trial_used" ? t("subscribe.trial_used") :
    sub?.charge_pending ? t("subscribe.charge_pending") : "";

  // Native (iOS/Android): ANY account without active access goes straight to
  // the in-app purchase screen. This covers never-subscribed, expired,
  // lapsed, past_due, and a trial that has ended. Previously these states
  // fell through to the web "management" view whose only control was a
  // "Continue to app" button that pushed to /today, where the entitlement
  // gate bounced the user right back to /subscribe: a soft-lock where
  // nothing visibly happened and the user could never reach the purchase
  // sheet. Gating on has_access (not the looser `subscribed`) is what makes
  // the StoreKit purchase reachable for every non-member on iOS.
  //
  // A member still inside Solray's own server-side free trial (status
  // "trial", no store purchase yet) also gets the purchase screen on native.
  // Before 2026-10-05 they saw the web status page with every payment control
  // hidden, so for the first three days there was no way to reach StoreKit at
  // all, which is exactly where App Review looks for the subscription. They
  // keep their access, so the screen offers Continue to app as well.
  if (isNative && (!sub || !sub.has_access || sub.status === "trial")) {
    const inTrial = Boolean(sub && sub.has_access);
    return (
      <NativeMembershipView
        onSignOut={handleSignOut}
        onAccountSettings={handleAccountSettings}
        onContinue={inTrial ? () => router.push("/today") : undefined}
      />
    );
  }

  // No subscription yet (web only now; native handled above).
  if (!sub || !sub.subscribed) {
    return <TrialOffer onStart={handleStartTrial} loading={actionLoading} error={error} notice={noticeText} onSignOut={handleSignOut} onAccountSettings={handleAccountSettings} />;
  }

  // Has subscription: show status + management.
  // "Lapsed" = status still says active but the paid period (plus grace) has
  // ended and recurring billing had no card token to renew with. The user
  // must pass through SecurePay checkout once more; afterwards the period
  // restarts. Rendered like expired, with its own honest copy.
  const lapsed = sub.status === "active" && !sub.has_access;
  // Cancelled and the paid month has run out: same as expired, they need a
  // way back in. This state used to render no payment button at all.
  const rejoinable = sub.status === "expired" || (sub.status === "cancelled" && !sub.has_access);
  // Apple / Google bill store members; our cancel cannot stop their charge,
  // so those members are sent to their store instead of a button that lies.
  const storeBilled = sub.platform === "ios" || sub.platform === "android";
  const statusSubtitle: Record<string, string> = {
    trial: t("subscribe.subtitle_trial"),
    active: t("subscribe.subtitle_active"),
    past_due: t("subscribe.subtitle_past_due"),
    cancelled: t("subscribe.subtitle_cancelled"),
    expired: t("subscribe.subtitle_expired"),
  };

  const dateFmt = (d: string) =>
    new Date(d).toLocaleDateString(lang === "en" ? "en-GB" : lang, {
      month: "long",
      day: "numeric",
      year: "numeric",
    });

  return (
    <div className="min-h-[100dvh] bg-forest-deep" style={{ paddingBottom: "calc(96px + var(--sab, 0px))" }}>
      <PageHead label={t("subscribe.eyebrow_subscription")} />
      <div className="max-w-lg mx-auto px-5">
        <PageTitle
          title={t("subscribe.your_membership")}
          sub={
            lapsed
              ? t("subscribe.subtitle_lapsed")
              : sub.trial_pending_verification
              ? t("subscribe.subtitle_pending_verification")
              : sub.status === "trial" && !sub.has_access
              ? t("subscribe.subtitle_expired")
              : sub.status === "cancelled" && !sub.has_access
              ? t("subscribe.subtitle_rejoin")
              : statusSubtitle[sub.status || ""] || ""
          }
        />

        {noticeText && <Notice text={noticeText} tone={notice === "payment_failed" ? "ember" : "muted"} />}

        {!isNative && sub.trial_pending_verification && <ResendVerification token={token} />}

        <Section label={t("subscribe.status")} right={<StatusBadge status={lapsed ? "expired" : sub.trial_pending_verification ? "awaiting_email" : sub.status || ""} />}>
          <div>
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
        </Section>

        {/* Plan picker (web only, before the sub is charged). Monthly $23 or
            yearly $199. Switching POSTs /subscribe/plan and refreshes so the
            price row + the charge that follows reflect the chosen plan. The
            backend locks the plan once active, so this never shows post-charge. */}
        {!isNative && (sub.status === "trial" || rejoinable) && (
          <PlanPicker
            current={sub.plan === "yearly" ? "yearly" : "monthly"}
            disabled={planBusy}
            onChoose={async (p) => {
              if (!token || planBusy) return;
              setPlanBusy(true);
              setPlanError("");
              try {
                await setPlan(token, p);
                await refreshAfterAction();
              } catch (e) {
                // Keep the current selection and say the change did not go
                // through: a card payment still being confirmed is buying the
                // current plan, so it changes only once that settles.
                setPlanError(e instanceof ApiError && e.code === "charge_pending"
                  ? t("subscribe.charge_pending") : t("subscribe.plan_change_failed"));
              } finally {
                setPlanBusy(false);
              }
            }}
            t={t}
          />
        )}
        {!isNative && planError && (
          <p role="alert" className="font-body mb-4" style={{ fontSize: 15, color: "rgb(var(--rgb-ember))" }}>
            {planError}
          </p>
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
            <ActionButton onClick={handleAddCard} loading={actionLoading}>
              {t("subscribe.add_payment")}
            </ActionButton>
          )}

          {/* Trial with card: activate now */}
          {!isNative && sub.status === "trial" && sub.card_last_four && (
            <ActionButton onClick={handleActivate} loading={actionLoading}>
              {t("subscribe.subscribe_now")}
            </ActionButton>
          )}

          {/* Lapsed active: paid period over, no token to auto-renew with.
              Same SecurePay checkout as rejoin; charges the month and
              restarts the period on return. */}
          {!isNative && lapsed && (
            <ActionButton onClick={handleAddCard} loading={actionLoading}>
              {t("subscribe.renew")}
            </ActionButton>
          )}

          {/* Expired, or cancelled and ended: restart */}
          {!isNative && rejoinable && (
            <ActionButton onClick={handleAddCard} loading={actionLoading}>
              {t("subscribe.rejoin")}
            </ActionButton>
          )}

          {/* Past due: update card */}
          {!isNative && sub.status === "past_due" && (
            <ActionButton onClick={handleAddCard} loading={actionLoading}>
              {t("subscribe.update_payment")}
            </ActionButton>
          )}

          {/* Inline card form: browser tokenization, multi-use token saved,
              due payments settled on the spot. */}
          {!isNative && showCardForm && token && (
            <CardForm
              token={token}
              onUncertain={() => { void refresh(); }}
              onNotice={(text: string) => {
                setShowCardForm(false);
                setCardSavedNote("");
                setCardNotice(text);
                void refresh();
              }}
              onSuccess={async (r: CardSaveResult) => {
                setShowCardForm(false);
                setCardNotice("");
                setCardSavedNote(
                  r.store_active
                    ? t("subscribe.store_restored")
                    : r.charged
                    ? t("subscribe.card_saved_charged")
                    : t("subscribe.card_saved")
                );
                await refreshAfterAction();
              }}
            />
          )}
          {!isNative && cardNotice && (
            <p
              role="status"
              className="text-[15px] leading-relaxed"
              style={{ color: "rgb(var(--rgb-text-secondary))" }}
            >
              {cardNotice}
            </p>
          )}
          {!isNative && cardSavedNote && (
            <p
              className="text-[15px]"
              style={{ color: "rgb(var(--rgb-moss))" }}
            >
              {cardSavedNote}
            </p>
          )}

          {/* Native shows no line pointing at the web for payment: "managed
              on the web" read as a route to non-IAP purchasing (Guideline
              3.1.3). The status badge above already says where things stand. */}

          {/* Active or trial: cancel. Available on every platform; cancel
              is a backend-only call and never touches a payment processor. */}
          {storeBilled && sub.has_access && (
            <p className="text-[15px] leading-relaxed" style={{ color: "rgb(var(--rgb-text-secondary))" }}>
              {sub.platform === "ios" ? t("subscribe.managed_in_app_store") : t("subscribe.managed_in_play")}
            </p>
          )}

          {!storeBilled && (sub.status === "active" || sub.status === "trial" || sub.status === "past_due") && (
            <button
              onClick={handleCancel}
              disabled={actionLoading}
              className="w-full py-4 rounded-full text-[14px] tracking-[0.3em] uppercase transition-colors disabled:opacity-50 font-bold"
              style={{
                color: "rgb(var(--rgb-text-secondary))",
                border: "1px solid rgb(var(--rgb-border))",
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
          {sub.has_access ? (
            <ActionButton onClick={() => router.push("/today")} loading={false}>
              {t("subscribe.continue_to_app")}
            </ActionButton>
          ) : (
            // Without access, "Continue to app" only bounced the member off
            // the access gate straight back here. Signing out is the honest
            // secondary exit.
            <div className="space-y-3">
              <HairlineButton onClick={handleSignOut}>{t("common.sign_out")}</HairlineButton>
              <HairlineButton onClick={handleAccountSettings}>{t("subscribe.account_settings")}</HairlineButton>
            </div>
          )}
        </div>

        {error && (
          <p
            className="font-body mt-6"
            style={{ fontSize: 15, color: "rgb(var(--rgb-ember))" }}
          >
            {error}
          </p>
        )}
      </div>
    </div>
  );
}


/** A web member whose free trial waits on email verification. */
function ResendVerification({ token }: { token: string | null }) {
  const { t } = useT();
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const send = async () => {
    if (!token || state === "sending") return;
    setState("sending");
    try {
      await resendVerification(token);
      setState("sent");
    } catch {
      setState("failed");
    }
  };
  return (
    <div className="mb-6 space-y-3">
      {state !== "sent" && (
        <HairlineButton onClick={send} loading={state === "sending"}>
          {t("subscribe.resend_verification")}
        </HairlineButton>
      )}
      {(state === "sent" || state === "failed") && (
        <p
          className="font-body"
          role="status"
          style={{ fontSize: 15, color: state === "failed" ? "rgb(var(--rgb-ember))" : "rgb(var(--rgb-text-secondary))" }}
        >
          {state === "sent" ? t("subscribe.verification_sent") : t("subscribe.verification_send_failed")}
        </p>
      )}
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
      <p className="mb-2 text-[14px] tracking-wide" style={{ color: "rgb(var(--rgb-text-muted))" }}>
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
              className="rounded-sm border px-4 py-3 text-left transition-colors"
              style={{
                borderColor: active ? "rgb(var(--rgb-text-primary))" : "rgb(var(--rgb-border))",
                background: active ? "rgb(var(--rgb-card))" : "transparent",
                opacity: disabled ? 0.6 : 1,
                cursor: disabled ? "default" : "pointer",
              }}
            >
              <div className="text-[15px]" style={{ color: "rgb(var(--rgb-text-muted))" }}>
                {o.key === "yearly" ? t("subscribe.plan_yearly") : t("subscribe.plan_monthly")}
              </div>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-[20px]" style={{ fontWeight: 700, color: "rgb(var(--rgb-text-primary))" }}>{o.price}</span>
                <span className="text-[14px]" style={{ color: "rgb(var(--rgb-text-muted))" }}>{o.per}</span>
              </div>
              {o.note && (
                <div className="mt-1 text-[13px]" style={{ color: "rgb(var(--rgb-moss))" }}>{o.note}</div>
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
    <div className="flex justify-between items-baseline font-body" style={{ paddingBlock: 10, borderTop: "1px solid rgb(var(--rgb-border) / .6)" }}>
      <span style={{ fontSize: 15, color: "rgb(var(--rgb-text-secondary))" }}>{label}</span>
      <span style={{ fontSize: 17, fontWeight: 500, color: "rgb(var(--rgb-text-primary))" }}>{value}</span>
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
// If the store never calls back after the sheet opened (Ask to Buy waiting
// on a parent, a pending bank approval, a sheet dismissed without an event),
// stop the spinner instead of leaving the member on "Opening..." forever.
const NATIVE_PURCHASE_TIMEOUT_MS = 60_000;

function NativeMembershipView({ onSignOut, onAccountSettings, onContinue }: { onSignOut: () => void; onAccountSettings: () => void; onContinue?: () => void }) {
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
      setError(state === "unavailable" ? t("subscribe.iap_trial_used") : t("subscribe.iap_loading"));
      readPrices();
      return;
    }
    if (state !== selectedState) readPrices(); // the wording follows the fresh answer

    clearPurchaseTimer();
    purchaseTimer.current = setTimeout(() => {
      purchaseTimer.current = null;
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
        release();
      }
    } catch (e) {
      clearPurchaseTimer();
      setLoading(false);
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

function TrialOffer({
  onStart,
  loading,
  error,
  notice,
  onSignOut,
  onAccountSettings,
}: {
  onStart: () => void;
  loading: boolean;
  error: string;
  notice?: string;
  onSignOut: () => void;
  onAccountSettings: () => void;
}) {
  const { t } = useT();
  return (
    <div className="min-h-[100dvh] bg-forest-deep" style={{ paddingBottom: "calc(96px + var(--sab, 0px))" }}>
      <PageHead label={t("subscribe.eyebrow_lbd")} />
      <div className="max-w-lg mx-auto px-5">
        <PageTitle title={t("subscribe.chart_spoken_to")} sub={t("subscribe.trial_blurb")} />

        {notice && <Notice text={notice} tone="ember" />}

        {/* What you get */}
        <Section label={t("subscribe.everything_included")}>
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
                  background: "rgb(var(--rgb-text-primary))", border: "1.5px solid rgb(var(--rgb-text-primary))",
                  opacity: 0.75,
                }}
              />
              <span
                className="text-[17px] leading-snug"
                style={{ color: "rgb(var(--rgb-text-primary))" }}
              >
                {item}
              </span>
            </div>
          ))}
        </Section>

        {/* Pricing */}
        <div className="mb-10">
          <p
            className="text-[15px]"
            style={{ color: "rgb(var(--rgb-text-secondary))" }}
          >
            {t("subscribe.five_days_then")}
          </p>
          <p
            className="mt-2"
            style={{
              color: "rgb(var(--rgb-text-primary))",
              fontFamily: "var(--font-heading, 'Zen Kaku Gothic New', system-ui, sans-serif)",
              fontWeight: 700,
              fontSize: "3rem",
              lineHeight: 1,
            }}
          >
            $23
            <span
              className="ml-1"
              style={{
                fontSize: "1rem",
                color: "rgb(var(--rgb-text-secondary))",
              }}
            >
              {t("subscribe.per_month")}
            </span>
          </p>
          <p
            className="text-[14px] mt-3"
            style={{ color: "rgb(var(--rgb-text-muted))" }}
          >
            {t("subscribe.cancel_anytime")}
          </p>
        </div>

        <div className="space-y-3">
          <ActionButton onClick={onStart} loading={loading}>
            {t("login.begin_journey")}
          </ActionButton>
          <HairlineButton onClick={onSignOut}>{t("common.sign_out")}</HairlineButton>
          <HairlineButton onClick={onAccountSettings}>{t("subscribe.account_settings")}</HairlineButton>
        </div>

        {error && (
          <p className="text-[15px] mt-4" style={{ color: "rgb(var(--rgb-ember))" }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useT();
  // One dot of meaning, no pill: the rest of the app marks state with a word
  // in the label voice, not a coloured capsule.
  const dot: Record<string, string> = {
    trial: "rgb(var(--rgb-amber))",
    active: "rgb(var(--rgb-moss))",
    past_due: "rgb(var(--rgb-ember))",
  };
  const label: Record<string, string> = {
    trial: t("subscribe.badge_trial"),
    active: t("subscribe.badge_active"),
    past_due: t("subscribe.badge_retrying"),
    // A web signup's trial starts when the email is confirmed; until then
    // the badge must not say Trial over a line saying it has not started.
    awaiting_email: t("subscribe.badge_awaiting_email"),
    cancelled: t("subscribe.badge_cancelled"),
    expired: t("subscribe.badge_expired"),
  };
  return (
    <span className="inline-flex items-center gap-2" style={{ color: "rgb(var(--rgb-text-primary))" }}>
      <span style={{ width: 7, height: 7, borderRadius: 999, background: dot[status] || "rgb(var(--rgb-text-muted))" }} />
      {label[status] || status.replace("_", " ")}
    </span>
  );
}

function Notice({ text, tone }: { text: string; tone: "ember" | "muted" }) {
  return (
    <p
      className="font-body"
      role="status"
      style={{
        fontSize: 15,
        lineHeight: 1.55,
        paddingBlock: 14,
        marginBottom: 20,
        borderTop: "1px solid rgb(var(--rgb-border))",
        borderBottom: "1px solid rgb(var(--rgb-border))",
        color: tone === "ember" ? "rgb(var(--rgb-ember))" : "rgb(var(--rgb-text-secondary))",
      }}
    >
      {text}
    </p>
  );
}

function ActionButton({
  onClick,
  loading,
  children,
}: {
  onClick: () => void;
  loading: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="w-full py-4 px-8 rounded-full text-[14px] tracking-[0.3em] uppercase transition-opacity duration-300 disabled:opacity-50 font-bold"
      style={{
        background: "rgb(var(--rgb-text-primary))",
        color: "rgb(var(--rgb-bg-deep))",
        border: "1.5px solid rgb(var(--rgb-text-primary))",
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
