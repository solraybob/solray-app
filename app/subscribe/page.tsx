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
          className="text-[10px] tracking-[0.3em] uppercase mb-5 text-center"
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
              className="text-[10px] tracking-[0.3em] uppercase"
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

        {/* Actions */}
        <div className="space-y-4">
          {/* Trial without card: add payment */}
          {sub.status === "trial" && !sub.card_last_four && (
            <ActionButton onClick={handleAddCard} loading={actionLoading} color="var(--amber, #f39230)">
              Add payment method
            </ActionButton>
          )}

          {/* Trial with card: activate now */}
          {sub.status === "trial" && sub.card_last_four && (
            <ActionButton onClick={handleActivate} loading={actionLoading} color="var(--amber, #f39230)">
              Subscribe now
            </ActionButton>
          )}

          {/* Expired: restart */}
          {sub.status === "expired" && (
            <ActionButton onClick={handleAddCard} loading={actionLoading} color="var(--amber, #f39230)">
              Rejoin Solray
            </ActionButton>
          )}

          {/* Past due: update card */}
          {sub.status === "past_due" && (
            <ActionButton onClick={handleAddCard} loading={actionLoading} color="var(--amber, #f39230)">
              Update payment method
            </ActionButton>
          )}

          {/* Active or trial: cancel */}
          {(sub.status === "active" || sub.status === "trial") && (
            <button
              onClick={handleCancel}
              disabled={actionLoading}
              className="w-full py-4 rounded-full text-[10px] tracking-[0.3em] uppercase transition-colors disabled:opacity-50"
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
            className="w-full py-4 rounded-full text-[10px] tracking-[0.3em] uppercase transition-colors"
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
        className="text-[10px] tracking-[0.22em] uppercase"
        style={{ color: "var(--text-secondary)", opacity: 0.7 }}
      >
        {label}
      </span>
      <span
        className="text-[15px]"
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
          className="text-[10px] tracking-[0.3em] uppercase mb-5"
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
            className="text-[10px] tracking-[0.3em] uppercase mb-6"
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
                className="text-[15px] leading-snug"
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
      className="text-[10px] tracking-[0.3em] uppercase px-3 py-1.5 rounded-full"
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
      className="w-full py-4 px-8 rounded-full text-[11px] tracking-[0.3em] uppercase transition-all duration-300 disabled:opacity-50 hover:brightness-110"
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
