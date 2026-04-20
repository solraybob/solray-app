"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { getSubscriptionStatus, type SubscriptionStatus } from "@/lib/subscription";

/**
 * TrialBanner
 *
 * Appears during the 5-day trial when no card is on file.
 * Sits at the top of every protected page, below the page header.
 * Matches the app's dark forest aesthetic: no garish alerts, just quiet information.
 * Dismissable per session. Hidden on /subscribe.
 */
export default function TrialBanner() {
  const { token } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [sub, setSub] = useState<SubscriptionStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!token) return;
    if (sessionStorage.getItem("solray_trial_banner_dismissed") === "1") {
      setDismissed(true);
      return;
    }
    getSubscriptionStatus(token).then(setSub).catch(() => {});
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

  return (
    <div
      style={{
        background: "#071510",
        borderBottom: "1px solid #1a3020",
        borderTop: urgent
          ? "1px solid rgba(212,122,82,0.35)"
          : "1px solid rgba(243,146,48,0.20)",
      }}
    >
      <div className="max-w-lg mx-auto px-5 py-2.5 flex items-center justify-between gap-4">
        {/* Left: label + message */}
        <div className="flex items-center gap-3 min-w-0">
          <span
            className="font-body text-[9px] tracking-[0.18em] uppercase shrink-0"
            style={{ color: urgent ? "#d47a52" : "#f39230", opacity: 0.9 }}
          >
            Trial
          </span>
          <p
            className="font-heading text-text-secondary truncate"
            style={{ fontSize: "0.8rem", fontWeight: 300, fontStyle: "italic", letterSpacing: "0.01em" }}
          >
            {message}
          </p>
        </div>

        {/* Right: CTA + dismiss */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => router.push("/subscribe")}
            className="font-body text-[10px] tracking-widest uppercase px-3 py-1 rounded-lg transition-colors"
            style={{
              background: "transparent",
              border: urgent ? "1px solid rgba(212,122,82,0.5)" : "1px solid rgba(243,146,48,0.35)",
              color: urgent ? "#d47a52" : "#f39230",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.background = urgent
                ? "rgba(212,122,82,0.10)"
                : "rgba(243,146,48,0.08)";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.background = "transparent";
            }}
          >
            Add card
          </button>
          <button
            onClick={handleDismiss}
            className="w-6 h-6 flex items-center justify-center text-text-secondary opacity-40 hover:opacity-70 transition-opacity"
            aria-label="Dismiss"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Progress bar: days consumed out of 5 */}
      <div style={{ height: "1px", background: "#1a3020" }}>
        <div
          style={{
            height: "100%",
            width: `${progress * 100}%`,
            background: urgent ? "rgba(212,122,82,0.60)" : "rgba(243,146,48,0.45)",
            transition: "width 0.6s ease",
          }}
        />
      </div>
    </div>
  );
}
