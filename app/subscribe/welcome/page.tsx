"use client";

/**
 * /subscribe/welcome — post-payment confirmation.
 *
 * Lands here after Teya/SecurePay completes successfully and the card
 * has been attached on the backend (which flips the subscription to
 * status="active" in the same call).
 *
 * Trapping rule: this page MUST always have a visible escape hatch.
 * A previous incarnation of the post-payment flow stranded a paying
 * subscriber — they paid, landed on a confirmation, and had no way
 * back into the app. So:
 *   - The header has a permanent "Skip" link to /today.
 *   - The body's primary CTA also goes to /today.
 *   - We never redirect this page unless the user has NO token at all
 *     (meaning auth itself failed). We never bounce them to /subscribe
 *     just because the status check is mid-flight or returns something
 *     unexpected — let them self-navigate.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { getSubscriptionStatus, type SubscriptionStatus } from "@/lib/subscription";

export default function SubscribeWelcome() {
  const router = useRouter();
  const { token, loading: authLoading } = useAuth();
  const [sub, setSub] = useState<SubscriptionStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;          // auth context still hydrating
    if (!token) {                     // truly unauthenticated → login
      router.replace("/login");
      return;
    }
    getSubscriptionStatus(token)
      .then(setSub)
      .catch(() => setSub(null))
      .finally(() => setStatusLoading(false));
  }, [token, authLoading, router]);

  // Always render the page — even when status hasn't loaded yet — so the
  // exit links are tappable from the very first paint. Status data is
  // garnish, not gating.
  const renews = sub?.current_period_end
    ? new Date(sub.current_period_end).toLocaleDateString(undefined, {
        year: "numeric", month: "long", day: "numeric",
      })
    : null;

  return (
    <div className="min-h-[100dvh] bg-forest-deep">

      {/* Permanent header exit. No back button — back goes to Teya. The
          Skip link IS the way home. Always-visible, always-tappable. */}
      <div className="border-b border-forest-border/50">
        <div className="max-w-lg mx-auto px-5 py-3 flex items-center justify-between">
          <p className="font-body text-text-secondary/70 text-[10px] tracking-[0.22em] uppercase">
            Subscription
          </p>
          <button
            onClick={() => router.push("/today")}
            className="font-body text-amber-sun text-[11px] tracking-[0.18em] uppercase hover:opacity-80 transition-opacity"
          >
            Continue to app
          </button>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-6 pt-12 pb-24 page-enter">

        {/* Quiet celebration mark — sun glyph, not a checkmark. Solray's
            vocabulary is solar, not transactional. */}
        <div className="flex justify-center mb-8">
          <div
            className="relative flex items-center justify-center rounded-full"
            style={{
              width: 80, height: 80,
              border: "1px solid rgb(var(--rgb-amber) / 0.5)",
              background: "rgb(var(--rgb-amber) / 0.06)",
            }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"
                 style={{ color: "rgb(var(--rgb-amber))" }}>
              <circle cx="12" cy="12" r="4.5"/>
              <line x1="12" y1="2"  x2="12" y2="4"/>
              <line x1="12" y1="20" x2="12" y2="22"/>
              <line x1="4.22"  y1="4.22"  x2="5.64"  y2="5.64"/>
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
              <line x1="2"  y1="12" x2="4"  y2="12"/>
              <line x1="20" y1="12" x2="22" y2="12"/>
              <line x1="4.22"  y1="19.78" x2="5.64"  y2="18.36"/>
              <line x1="18.36" y1="5.64"  x2="19.78" y2="4.22"/>
            </svg>
          </div>
        </div>

        <p className="font-body text-text-secondary text-[10px] tracking-[0.22em] uppercase text-center mb-3">
          Welcome to Solray
        </p>
        <h1
          className="font-heading text-text-primary text-center mb-3"
          style={{ fontSize: 30, fontWeight: 300, letterSpacing: "0.02em" }}
        >
          You&rsquo;re in.
        </h1>
        <p className="font-body text-text-secondary text-[14px] leading-relaxed text-center max-w-sm mx-auto mb-8">
          Your subscription is active. The full Solray experience is unlocked
          and your daily forecasts will keep arriving each morning.
        </p>

        {/* Primary CTA — large, above the fold on every phone, can't miss */}
        <button
          onClick={() => router.push("/today")}
          className="w-full font-body text-[12px] tracking-[0.22em] uppercase py-3.5 rounded-full transition-colors mb-3"
          style={{
            backgroundColor: "rgb(var(--rgb-amber))",
            color: "rgb(var(--rgb-bg-deep))",
          }}
        >
          Open today
        </button>
        <button
          onClick={() => router.push("/profile/settings")}
          className="w-full font-body text-[10px] tracking-[0.22em] uppercase py-2.5 text-text-secondary/70 hover:text-text-secondary transition-colors mb-10"
        >
          Manage subscription
        </button>

        {/* Quiet receipt — only shown if status loaded with details. We
            never block the page on this; the user can leave any time. */}
        {!statusLoading && sub && (sub.card_brand || sub.price || renews) && (
          <div className="rounded-2xl border border-forest-border/60 bg-forest-card/40 px-5 py-5 mb-10">
            <div className="space-y-3 font-body text-[13px]">
              {sub.card_brand && sub.card_last_four && (
                <div className="flex items-center justify-between">
                  <span className="text-text-secondary text-[11px] tracking-[0.18em] uppercase">Card on file</span>
                  <span className="text-text-primary">{sub.card_brand} &middot; {sub.card_last_four}</span>
                </div>
              )}
              {sub.price && (
                <div className="flex items-center justify-between">
                  <span className="text-text-secondary text-[11px] tracking-[0.18em] uppercase">Price</span>
                  <span className="text-text-primary">{sub.price}</span>
                </div>
              )}
              {renews && (
                <div className="flex items-center justify-between">
                  <span className="text-text-secondary text-[11px] tracking-[0.18em] uppercase">Next renewal</span>
                  <span className="text-text-primary">{renews}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* What's unlocked — three quiet bullets, no marketing tone */}
        <div>
          <p className="font-body text-text-secondary text-[10px] tracking-[0.22em] uppercase mb-4">
            What&rsquo;s open to you
          </p>
          <ul className="space-y-3 font-body text-[13px] text-text-primary leading-relaxed">
            <UnlockRow>Daily personalised forecast and energy reading.</UnlockRow>
            <UnlockRow>Higher Self chat with full chart context and persistent memory.</UnlockRow>
            <UnlockRow>Souls — connect with others and read your dynamics together.</UnlockRow>
          </ul>
        </div>

      </div>
    </div>
  );
}

function UnlockRow({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span
        className="shrink-0 mt-2 rounded-full"
        style={{
          width: 4, height: 4,
          backgroundColor: "rgb(var(--rgb-amber))",
        }}
      />
      <span>{children}</span>
    </li>
  );
}
