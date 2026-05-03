"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/lib/auth-context";
import { isRunningInCapacitor } from "@/lib/native-push";
import {
  getSubscriptionStatus,
  startTrial,
  createSecurePaySession,
  activateSubscription,
  cancelSubscription,
  type SubscriptionStatus,
} from "@/lib/subscription";

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
  const { token } = useAuth();
  const router = useRouter();
  const [sub, setSub] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");

  // App Store Guideline 3.1.1 / 3.1.3 compliance: when running inside the
  // Capacitor native shell (iOS or Android), every payment-launching CTA
  // must be hidden. Solray takes subscriptions exclusively through
  // solray.ai on the web. The native app is sign-in-and-use only. New
  // members subscribe on the web first, then sign in here. This is the
  // same model Spotify, Netflix, Audible and Kindle use, and is the only
  // model Apple approves for non-Reader subscription apps that don't
  // implement StoreKit IAP.
  const [isNative, setIsNative] = useState(false);
  useEffect(() => {
    setIsNative(isRunningInCapacitor());
  }, []);

  // Fetch status on mount
  useEffect(() => {
    if (!token) return;
    getSubscriptionStatus(token)
      .then(setSub)
      .catch(() => setSub(null))
      .finally(() => setLoading(false));
    // Funnel event: every /subscribe view. The canary uses this to
    // detect users stuck on /subscribe without tapping anything (which
    // suggests the page is misbehaving).
    void (async () => {
      try {
        const { track } = await import("@/lib/analytics");
        await track("subscribe_view", undefined, token);
      } catch { /* ignore */ }
    })();
  }, [token]);

  // Handle SecurePay callback (token comes back as URL param). Skipped
  // entirely on the native shell so the app never touches a Teya token,
  // even if a stray URL is opened deep-linked into the WebView.
  useEffect(() => {
    if (isNative) return;
    const params = new URLSearchParams(window.location.search);

    // Borgun param casing varies between test and live environments.
    // Build a lowercase lookup so we catch token/Token/TOKEN etc.
    const lc: Record<string, string> = {};
    params.forEach((v, k) => { lc[k.toLowerCase()] = v; });

    const teyaToken = lc["token"];
    const rawPan = lc["pan"] || lc["maskedpan"] || "";
    const lastFour = lc["last_four"] || (rawPan ? rawPan.slice(-4) : "");
    const brand = lc["card_type"] || lc["cardtype"] || "Card";

    if (teyaToken && token) {
      setActionLoading(true);
      // Strip the token-bearing URL immediately so a refresh / share /
      // history-back doesn't re-trigger the attach with a stale token.
      window.history.replaceState({}, "", "/subscribe");
      import("@/lib/subscription").then(({ attachCard }) =>
        attachCard(token, {
          teya_token: teyaToken,
          card_last_four: lastFour || "****",
          card_brand: brand,
        })
          .then(() => {
            // Backend's /subscribe/card flips status to 'active' atomically
            // when SecurePay returns successfully. Redirect to the welcome
            // confirmation page; it pulls fresh status on mount and double-
            // checks before celebrating.
            router.replace("/subscribe/welcome");
          })
          .catch((e) => {
            setError(e.message);
            setActionLoading(false);
          })
      );
    }
  }, [token, router]);

  // ------------------------------------------------------------------
  // Actions
  // ------------------------------------------------------------------

  const handleStartTrial = async () => {
    if (!token) return;
    setActionLoading(true);
    setError("");
    try {
      await startTrial(token);
      const updated = await getSubscriptionStatus(token);
      setSub(updated);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddCard = async () => {
    if (!token) return;
    setActionLoading(true);
    setError("");
    // Funnel event: user has explicitly tapped a payment-launch button.
    // This is the "intent to pay" line that the canary divides into to
    // produce the conversion-rate metric.
    try {
      const { track } = await import("@/lib/analytics");
      await track("subscribe_card_tap", { sub_status: sub?.status ?? null }, token);
    } catch { /* ignore */ }
    try {
      const session = await createSecurePaySession(token);
      if (session.session_url) {
        window.location.href = session.session_url;
      } else {
        setError("Could not open payment page. Please try again.");
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
      const updated = await getSubscriptionStatus(token);
      setSub(updated);
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
      const updated = await getSubscriptionStatus(token);
      setSub(updated);
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

  // No subscription yet.
  // On the web, show the trial offer. On native (iOS/Android), App Store
  // and Play Store rules prohibit any in-app payment CTA for digital
  // subscriptions, so we render a sign-in-and-use view instead. New
  // members must subscribe on the web at solray.ai, then sign in here.
  if (!sub || !sub.subscribed) {
    if (isNative) {
      return <NativeMembershipView />;
    }
    return <TrialOffer onStart={handleStartTrial} loading={actionLoading} error={error} />;
  }

  // Has subscription: show status + management
  const statusSubtitle: Record<string, string> = {
    trial: "Your five-day window. Your chart, yours to explore.",
    active: "Living by design. Your chart, spoken to, every day.",
    past_due: "A charge did not clear. We will try again shortly.",
    cancelled: "Cancelled. Your access continues until the period ends.",
    expired: "Your trial has ended. Rejoin when you are ready.",
  };

  const dateFmt = (d: string) =>
    new Date(d).toLocaleDateString("en-US", {
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
          Subscription
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
          Your membership
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
          {statusSubtitle[sub.status || ""] || ""}
        </p>

        {/* Status card */}
        <div
          className="rounded-sm p-7 mb-10"
          style={{
            background: "rgba(10, 31, 18, 0.6)",
            border: "1px solid rgba(243, 146, 48, 0.14)",
          }}
        >
          <div className="flex justify-between items-center mb-6">
            <span
              className="text-[12px] tracking-[0.3em] uppercase"
              style={{ color: "var(--text-secondary)" }}
            >
              Status
            </span>
            <StatusBadge status={sub.status || ""} />
          </div>

          <div className="space-y-3">
            {sub.status === "trial" && sub.trial_end && (
              <DetailRow label="Trial ends" value={dateFmt(sub.trial_end)} />
            )}

            {sub.current_period_end && sub.status !== "trial" && (
              <DetailRow
                label={sub.status === "cancelled" ? "Access until" : "Next billing"}
                value={dateFmt(sub.current_period_end)}
              />
            )}

            {sub.card_brand && sub.card_last_four && (
              <DetailRow
                label="Card on file"
                value={`${sub.card_brand} \u00b7 ${sub.card_last_four}`}
              />
            )}

            {sub.price && sub.status !== "expired" && (
              <DetailRow label="Price" value={`${sub.price} / month`} />
            )}
          </div>
        </div>

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
              Add payment method
            </ActionButton>
          )}

          {/* Trial with card: activate now */}
          {!isNative && sub.status === "trial" && sub.card_last_four && (
            <ActionButton onClick={handleActivate} loading={actionLoading} color="var(--amber, #f39230)">
              Subscribe now
            </ActionButton>
          )}

          {/* Expired: restart */}
          {!isNative && sub.status === "expired" && (
            <ActionButton onClick={handleAddCard} loading={actionLoading} color="var(--amber, #f39230)">
              Rejoin Solray
            </ActionButton>
          )}

          {/* Past due: update card */}
          {!isNative && sub.status === "past_due" && (
            <ActionButton onClick={handleAddCard} loading={actionLoading} color="var(--amber, #f39230)">
              Update payment method
            </ActionButton>
          )}

          {/* Native-only: a soft, non-CTA status line for the states where
              the web user would have seen a payment button. No link, no
              button, no call to action; just status info. Apple permits
              status info; it does not permit calls to action that route
              to non-IAP purchasing. */}
          {isNative && (sub.status === "expired" || sub.status === "past_due" || sub.status === "trial") && (
            <p
              className="text-center text-[14px] leading-relaxed"
              style={{ color: "var(--text-secondary, #8a9e8d)", opacity: 0.85 }}
            >
              Your Solray membership is managed on the web.
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
              Cancel subscription
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
            Continue to app
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
 * direct customers to non-IAP purchasing. Solray does not implement
 * StoreKit IAP for v1.0, so the native app simply has no path to
 * subscribe; new members must do so on solray.ai in a browser.
 *
 * Pattern follows Spotify, Netflix, Audible, Kindle: status info only,
 * no CTAs to the web. The user can sign out, continue to the app
 * (which will route them around content gates as a non-subscriber), or
 * close the app and visit solray.ai on their own.
 */
function NativeMembershipView() {
  const router = useRouter();
  const { logout } = useAuth();

  return (
    <div className="min-h-screen px-6 pt-20 pb-32">
      <div className="max-w-md mx-auto text-center">
        <p
          className="text-[12px] tracking-[0.3em] uppercase mb-5"
          style={{ color: "var(--amber, #f39230)", opacity: 0.85 }}
        >
          Membership
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
          Your Solray account.
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
          Solray memberships are managed on the web. Once you are a member,
          you can sign in here and access everything.
        </p>

        <div className="space-y-3">
          {/* Continue to app removed: ProtectedRoute will bounce an
              unsubscribed user straight back to /subscribe, so the
              button promised an escape that did not exist. Native
              users without a membership only see Sign out here.
              They subscribe on solray.ai in a browser and then sign
              in. Caught by Codex audit P2.7. */}
          <button
            onClick={logout}
            className="w-full py-4 rounded-full text-[12px] tracking-[0.3em] uppercase transition-colors"
            style={{
              color: "var(--text-secondary, #8a9e8d)",
              border: "1px solid rgba(138, 158, 141, 0.25)",
              background: "transparent",
            }}
          >
            Sign out
          </button>
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
  return (
    <div className="min-h-screen px-6 pt-20 pb-32">
      <div className="max-w-md mx-auto text-center">
        {/* Eyebrow */}
        <p
          className="text-[12px] tracking-[0.3em] uppercase mb-5"
          style={{ color: "var(--amber, #f39230)", opacity: 0.85 }}
        >
          Living by design
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
          Your chart, spoken to.
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
          Your exact birth moment, read against today's sky, every morning.
          Three systems, one voice, speaking to your chart alone.
        </p>

        {/* What you get */}
        <div
          className="text-left rounded-sm p-7 mb-10"
          style={{
            background: "rgba(10, 31, 18, 0.6)",
            border: "1px solid rgba(243, 146, 48, 0.14)",
          }}
        >
          <p
            className="text-[12px] tracking-[0.3em] uppercase mb-6"
            style={{ color: "var(--text-secondary)" }}
          >
            Everything included
          </p>
          {[
            "Daily personalised forecast",
            "Higher Self Oracle, unlimited",
            "Soul Connections and compatibility readings",
            "Full natal chart, Human Design, and Gene Keys",
            "Transit tracking and cycle awareness",
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
            Five days free, then
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
              / month
            </span>
          </p>
          <p
            className="text-xs mt-3 tracking-wide"
            style={{ color: "var(--text-secondary)", opacity: 0.75 }}
          >
            Cancel anytime. No commitment.
          </p>
        </div>

        <ActionButton onClick={onStart} loading={loading} color="var(--amber, #f39230)">
          Begin your journey
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
    trial: "Trial",
    active: "Active",
    past_due: "Retrying",
    cancelled: "Cancelled",
    expired: "Expired",
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
        color: "#050f08",
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
