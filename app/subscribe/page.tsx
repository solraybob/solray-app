"use client";

import { memberErrorText } from "@/lib/member-error";
import { registerUnfinishedWork } from "@/lib/draft-guard";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/lib/auth-context";
import { useSubscription } from "@/lib/subscription-context";
import { isRunningInCapacitor } from "@/lib/native-push";
import { startTrial, createSecurePaySession, activateSubscription, cancelSubscription, setPlan, DeadlineError, storeEndedCardNotice } from "@/lib/subscription";
import { ApiError } from "@/lib/api";
import { useT } from "@/lib/i18n";
import CardForm, { type CardSaveResult } from "@/components/CardForm";
import { PageHead, PageTitle, Section, HairlineButton } from "@/components/PageHead";
import { ActionButton, Notice, StatusBadge, DetailRow } from "./_components/subscribe-ui";
import { NativeMembershipView } from "./_components/NativeMembershipView";
import { PendingTrialView } from "./_components/PendingTrialView";
import { TrialOffer } from "./_components/TrialOffer";
import { ResendVerification } from "./_components/ResendVerification";
import { PlanPicker } from "./_components/PlanPicker";

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
  const { token, logout, user } = useAuth();
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
    // Never the server's own text: its words for a known case, else ours.
    return memberErrorText(e, t, "subscribe.purchase_failed", { byStatus: { 402: "subscribe.payment_failed" } });
  };
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [showCardForm, setShowCardForm] = useState(false);
  // The update reload waits while a payment step is under way here: the
  // card form open (its fields may be hosted out of reach of the draft
  // tracking) or a billing action on its way (lib/draft-guard).
  const paymentBusyRef = useRef(false);
  paymentBusyRef.current = showCardForm || actionLoading;
  useEffect(() => registerUnfinishedWork(() => paymentBusyRef.current), []);
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

  // The email was confirmed while this page waited for it (another tab, the
  // mail app, the "I have confirmed it" check): the trial has started, so
  // on to Today rather than a billing page.
  const wasPending = useRef(false);
  useEffect(() => {
    if (sub?.trial_pending_verification) { wasPending.current = true; return; }
    if (wasPending.current && sub?.has_access) router.replace("/today");
  }, [sub, router]);

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

  // A web signup whose free trial waits for the email to be confirmed: one
  // calm screen, no billing controls (nothing has started, nothing can be
  // cancelled). Confirming the email goes on to Today.
  if (sub && sub.subscribed && sub.trial_pending_verification) {
    return (
      <PendingTrialView
        token={token}
        email={user?.email || null}
        onCheck={refresh}
        onSignOut={handleSignOut}
        onAccountSettings={handleAccountSettings}
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

