"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/lib/auth-context";
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

  // Fetch status on mount
  useEffect(() => {
    if (!token) return;
    getSubscriptionStatus(token)
      .then(setSub)
      .catch(() => setSub(null))
      .finally(() => setLoading(false));
  }, [token]);

  // Handle SecurePay callback (token comes back as URL param)
  useEffect(() => {
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
      import("@/lib/subscription").then(({ attachCard }) =>
        attachCard(token, {
          teya_token: teyaToken,
          card_last_four: lastFour || "****",
          card_brand: brand,
        })
          .then(() => {
            // Refresh status
            return getSubscriptionStatus(token);
          })
          .then(setSub)
          .catch((e) => setError(e.message))
          .finally(() => setActionLoading(false))
      );

      // Clean URL
      window.history.replaceState({}, "", "/subscribe");
    }
  }, [token]);

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

  // No subscription yet: show the offer
  if (!sub || !sub.subscribed) {
    return <TrialOffer onStart={handleStartTrial} loading={actionLoading} error={error} />;
  }

  // Has subscription: show status + management
  return (
    <div className="min-h-screen px-6 pt-16 pb-32">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <h1
          className="text-3xl font-light mb-2"
          style={{ fontFamily: "var(--font-heading, 'Cormorant Garamond', Georgia, serif)" }}
        >
          Your Subscription
        </h1>
        <p className="text-sm mb-10" style={{ color: "var(--text-secondary, #8a9e8d)" }}>
          {sub.status === "trial" && "You are on a free trial."}
          {sub.status === "active" && "Your subscription is active."}
          {sub.status === "past_due" && "There was an issue with your payment. We are retrying."}
          {sub.status === "cancelled" && "Your subscription has been cancelled."}
          {sub.status === "expired" && "Your trial has expired."}
        </p>

        {/* Status card */}
        <div
          className="rounded-sm p-6 mb-6"
          style={{ background: "var(--card, #0a1f12)", border: "1px solid var(--border, #1a3020)" }}
        >
          <div className="flex justify-between items-center mb-4">
            <span className="text-xs tracking-widest uppercase" style={{ color: "var(--text-secondary)" }}>
              Status
            </span>
            <StatusBadge status={sub.status || ""} />
          </div>

          {sub.status === "trial" && sub.trial_end && (
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Trial ends {new Date(sub.trial_end).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            </p>
          )}

          {sub.current_period_end && sub.status !== "trial" && (
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              {sub.status === "cancelled" ? "Access until" : "Next billing"}{" "}
              {new Date(sub.current_period_end).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            </p>
          )}

          {sub.card_brand && sub.card_last_four && (
            <p className="text-sm mt-2" style={{ color: "var(--text-secondary)" }}>
              {sub.card_brand} ending in {sub.card_last_four}
            </p>
          )}

          {sub.price && sub.status !== "expired" && (
            <p className="text-sm mt-2" style={{ color: "var(--text-secondary)" }}>
              {sub.price}/month
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="space-y-3">
          {/* Trial without card: add payment */}
          {sub.status === "trial" && !sub.card_last_four && (
            <ActionButton onClick={handleAddCard} loading={actionLoading} color="var(--amber, #e8821a)">
              Add Payment Method
            </ActionButton>
          )}

          {/* Trial with card: activate now */}
          {sub.status === "trial" && sub.card_last_four && (
            <ActionButton onClick={handleActivate} loading={actionLoading} color="var(--amber, #e8821a)">
              Subscribe Now ({sub.price}/month)
            </ActionButton>
          )}

          {/* Expired: restart */}
          {sub.status === "expired" && (
            <ActionButton onClick={handleAddCard} loading={actionLoading} color="var(--amber, #e8821a)">
              Subscribe ({sub.price || "$23.00"}/month)
            </ActionButton>
          )}

          {/* Past due: update card */}
          {sub.status === "past_due" && (
            <ActionButton onClick={handleAddCard} loading={actionLoading} color="var(--amber, #e8821a)">
              Update Payment Method
            </ActionButton>
          )}

          {/* Active or trial: cancel */}
          {(sub.status === "active" || sub.status === "trial") && (
            <button
              onClick={handleCancel}
              disabled={actionLoading}
              className="w-full py-3 rounded-sm text-sm tracking-wide transition-colors"
              style={{
                color: "var(--text-secondary, #8a9e8d)",
                border: "1px solid var(--border, #1a3020)",
              }}
            >
              Cancel Subscription
            </button>
          )}
        </div>

        {error && (
          <p className="text-sm mt-4" style={{ color: "var(--ember, #c4623a)" }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

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
        <h1
          className="text-4xl font-light mb-4"
          style={{ fontFamily: "var(--font-heading, 'Cormorant Garamond', Georgia, serif)" }}
        >
          Living by Design
        </h1>
        <p className="text-sm mb-12" style={{ color: "var(--text-secondary, #8a9e8d)" }}>
          Your exact birth moment, read against today's sky, every morning.
          Three systems, one voice, speaking to your chart alone.
        </p>

        {/* What you get */}
        <div
          className="text-left rounded-sm p-6 mb-8"
          style={{ background: "var(--card, #0a1f12)", border: "1px solid var(--border, #1a3020)" }}
        >
          <p className="text-xs tracking-widest uppercase mb-5" style={{ color: "var(--text-secondary)" }}>
            Everything included
          </p>
          {[
            "Daily personalised forecast",
            "Higher Self Oracle (unlimited conversations)",
            "Soul Connections (compatibility readings)",
            "Full natal chart, Human Design, and Gene Keys",
            "Transit tracking and cycle awareness",
          ].map((item) => (
            <div key={item} className="flex items-start gap-3 mb-3">
              <span className="text-xs mt-0.5" style={{ color: "var(--amber, #e8821a)" }}>
                *
              </span>
              <span className="text-sm" style={{ color: "var(--text-primary, #e8e0cc)" }}>
                {item}
              </span>
            </div>
          ))}
        </div>

        {/* Pricing */}
        <div className="mb-8">
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            5 days free, then
          </p>
          <p className="text-3xl font-light mt-1" style={{ color: "var(--text-primary)" }}>
            $23<span className="text-base" style={{ color: "var(--text-secondary)" }}>/month</span>
          </p>
          <p className="text-xs mt-2" style={{ color: "var(--text-secondary)" }}>
            Cancel anytime. No commitment.
          </p>
        </div>

        <ActionButton onClick={onStart} loading={loading} color="var(--amber, #e8821a)">
          Begin Your Journey
        </ActionButton>

        {error && (
          <p className="text-sm mt-4" style={{ color: "var(--ember, #c4623a)" }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    trial: { bg: "rgba(232,130,26,0.15)", text: "var(--amber, #e8821a)" },
    active: { bg: "rgba(107,125,74,0.15)", text: "var(--moss, #6b7d4a)" },
    past_due: { bg: "rgba(196,98,58,0.15)", text: "var(--ember, #c4623a)" },
    cancelled: { bg: "rgba(138,158,141,0.1)", text: "var(--text-secondary, #8a9e8d)" },
    expired: { bg: "rgba(138,158,141,0.1)", text: "var(--text-secondary, #8a9e8d)" },
  };
  const c = colors[status] || colors.expired;

  return (
    <span
      className="text-xs tracking-wide uppercase px-3 py-1 rounded-sm"
      style={{ background: c.bg, color: c.text }}
    >
      {status.replace("_", " ")}
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
      className="w-full py-3.5 rounded-sm text-sm tracking-wide font-medium transition-opacity disabled:opacity-50"
      style={{ background: color, color: "#050f08" }}
    >
      {loading ? (
        <span className="inline-block w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
      ) : (
        children
      )}
    </button>
  );
}
