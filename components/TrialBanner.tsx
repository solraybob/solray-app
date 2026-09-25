"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useSubscription } from "@/lib/subscription-context";
import { isRunningInCapacitor } from "@/lib/native-push";
import { useT } from "@/lib/i18n";

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
  const { t } = useT();
  const { token } = useAuth();
  const { sub } = useSubscription();
  const pathname = usePathname();
  const router = useRouter();
  // Suppress synchronously on native so the trial banner's "Add card" CTA
  // (a web/Teya payment call to action, forbidden under App Store 3.1.3)
  // never paints for even one frame inside the native shell. The effect
  // keeps handling the per-session web dismissal.
  const [dismissed, setDismissed] = useState(() => typeof window !== "undefined" && isRunningInCapacitor());

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

  const TRIAL_DAYS = 3; // matches backend TRIAL_DAYS; was 5, so the bar read wrong
  const daysUsed = daysLeft !== null ? TRIAL_DAYS - daysLeft : 0;
  const progress = Math.min(1, daysUsed / TRIAL_DAYS);
  const urgent = daysLeft !== null && daysLeft <= 1;

  const message =
    daysLeft === null
      ? t("trial.add_card_prompt")
      : daysLeft === 0
      ? t("trial.ends_today")
      : daysLeft === 1
      ? t("trial.one_day_left")
      : t("trial.days_left").replace("{count}", String(daysLeft));

  // The one look: a hairline strip, not a tinted band. The label line in the
  // muted uppercase voice, the message at body size, one hairline pill for
  // the action. Urgency is carried by ember text and the progress rule only.
  const tone = urgent ? "rgb(var(--rgb-ember))" : "rgb(var(--rgb-text-primary))";
  return (
    <div style={{ borderBottom: "1px solid rgb(var(--rgb-border))" }}>
      <div className="max-w-lg mx-auto px-5 py-3 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p
            className="font-body uppercase"
            style={{ fontSize: 11, letterSpacing: "0.3em", color: urgent ? "rgb(var(--rgb-ember))" : "rgb(var(--rgb-text-muted))" }}
          >
            {t("trial.label")}
          </p>
          <p className="font-body truncate" style={{ fontSize: 15, fontWeight: 500, marginTop: 2, color: tone }}>
            {message}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => router.push("/subscribe")}
            className="font-body uppercase font-bold rounded-full transition-opacity hover:opacity-80"
            style={{
              fontSize: 11,
              letterSpacing: "0.2em",
              padding: "7px 14px",
              background: "transparent",
              border: `1px solid ${urgent ? "rgb(var(--rgb-ember) / 0.6)" : "rgb(var(--rgb-border))"}`,
              color: urgent ? "rgb(var(--rgb-ember))" : "rgb(var(--rgb-text-secondary))",
            }}
          >
            {t("trial.add_card")}
          </button>
          <button
            onClick={handleDismiss}
            className="w-7 h-7 flex items-center justify-center transition-opacity hover:opacity-80"
            style={{ color: "rgb(var(--rgb-text-muted))" }}
            aria-label={t("common.dismiss")}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Progress rule: days consumed out of the trial. */}
      <div style={{ height: 1, background: "rgb(var(--rgb-border))" }}>
        <div
          style={{
            height: "100%",
            width: `${progress * 100}%`,
            background: urgent ? "rgb(var(--rgb-ember))" : "rgb(var(--rgb-text-primary))",
            transition: "width 0.6s ease",
          }}
        />
      </div>
    </div>
  );
}
