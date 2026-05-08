"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useSubscription } from "@/lib/subscription-context";
import { isRunningInCapacitor } from "@/lib/native-push";

/**
 * TrialBanner
 *
 * Appears during the 5-day trial when no card is on file.
 * Sits at the top of every protected page, below the page header.
 * Matches the app's dark forest aesthetic: no garish alerts, just quiet information.
 * Dismissable per session. Hidden on /subscribe.
 *
 * Subscription state comes from the shared SubscriptionProvider, NOT
 * a separate getSubscriptionStatus call. Earlier this component fired
 * its own /subscribe/status request on every mount, which on a typical
 * Today, Chat, Souls, Profile cycle was a redundant round trip per
 * page on top of the one ProtectedRoute already made. Now zero extra
 * fetches.
 */
export default function TrialBanner() {
  const { token } = useAuth();
  const { sub } = useSubscription();
  const pathname = usePathname();
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!token) return;
    // App Store compliance: TrialBanner shows an "Add card" CTA that
    // routes to /subscribe → Teya. That's a payment call to action and
    // is forbidden inside the iOS / Android native shell under
    // App Store Guideline 3.1.3. Suppress the banner entirely in native.
    if (isRunningInCapacitor()) {
      setDismissed(true);
      return;
    }
    if (sessionStorage.getItem("solray_trial_banner_dismissed") === "1") {
      setDismissed(true);
    }
  }, [token]);

  const handleDismiss = () => {
    sessionStorage.setItem("solray_trial_banner_dismissed", "1");
    setDismissed(true);
  };

  if (!token || dismissed || pathname?.startsWith("/subscribe") || !sub) return null;
  if (sub.status !== "trial" || sub.card_last_four) return null;

  const daysLeft = sub.trial_end
    ? Math.max(0, Math.ceil((new Date(sub.trial_end).getTime() - Date.now()) / 86_400_000))
    : null;

  const TRIAL_DAYS = 5;
  const daysUsed = daysLeft !== null ? TRIAL_DAYS - daysLeft : 0;
  const progress = Math.min(1, daysUsed / TRIAL_DAYS);
  const urgent = daysLeft !== null && daysLeft <= 1;

  const message =
    daysLeft === null
      ? "Add a card to keep access when your trial ends."
      : daysLeft === 0
      ? "Your trial ends today."
      : daysLeft === 1
      ? "One day left in your trial."
      : `${daysLeft} days left in your trial.`;

  // Restored prominence per Bob's pre-App-Store memory. Codex confirmed the
  // original (commit 59a77b7) was significantly larger and more visible.
  // Increases: bigger padding, amber-tinted bg gradient instead of flat dark,
  // bigger label + message, fuller-weight CTA button, thicker progress bar.
  return (
    <div
      style={{
        background: urgent
          ? "linear-gradient(180deg, rgba(212,122,82,0.10) 0%, rgb(var(--rgb-bg-dark)) 100%)"
          : "linear-gradient(180deg, rgba(243,146,48,0.08) 0%, rgb(var(--rgb-bg-dark)) 100%)",
        borderBottom: "1px solid rgb(var(--rgb-border))",
        borderTop: urgent
          ? "2px solid rgba(212,122,82,0.55)"
          : "2px solid rgba(243,146,48,0.35)",
      }}
    >
      <div className="max-w-lg mx-auto px-5 py-4 flex items-center justify-between gap-4">
        {/* Left: label + message */}
        <div className="flex items-center gap-4 min-w-0">
          <span
            className="font-body text-[12px] tracking-[0.22em] uppercase shrink-0"
            style={{ color: urgent ? "#d47a52" : "var(--amber)", opacity: 1, fontWeight: 500 }}
          >
            Trial
          </span>
          <p
            className="font-heading text-text-primary truncate"
            style={{ fontSize: "1.05rem", fontWeight: 400, letterSpacing: "0.01em" }}
          >
            {message}
          </p>
        </div>

        {/* Right: CTA + dismiss */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => router.push("/subscribe")}
            className="font-body text-[12px] tracking-[0.22em] uppercase px-4 py-2 rounded-lg transition-colors"
            style={{
              background: urgent ? "rgba(212,122,82,0.15)" : "rgba(243,146,48,0.12)",
              border: urgent ? "1px solid rgba(212,122,82,0.6)" : "1px solid rgba(243,146,48,0.5)",
              color: urgent ? "#d47a52" : "var(--amber)",
              fontWeight: 500,
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.background = urgent
                ? "rgba(212,122,82,0.22)"
                : "rgba(243,146,48,0.18)";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.background = urgent
                ? "rgba(212,122,82,0.15)"
                : "rgba(243,146,48,0.12)";
            }}
          >
            Add card
          </button>
          <button
            onClick={handleDismiss}
            className="w-7 h-7 flex items-center justify-center text-text-secondary opacity-50 hover:opacity-80 transition-opacity"
            aria-label="Dismiss"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Progress bar: days consumed out of 5. Thicker than before. */}
      <div style={{ height: "2px", background: "rgb(var(--rgb-border))" }}>
        <div
          style={{
            height: "100%",
            width: `${progress * 100}%`,
            background: urgent ? "rgba(212,122,82,0.75)" : "rgba(243,146,48,0.6)",
            transition: "width 0.6s ease",
          }}
        />
      </div>
    </div>
  );
}
