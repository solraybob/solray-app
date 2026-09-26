"use client";

/**
 * /subscribe/welcome, post-payment confirmation.
 *
 * Lands here after Teya/SecurePay completes successfully and the card
 * has been attached on the backend (which flips the subscription to
 * status="active" in the same call).
 *
 * Trapping rule: this page MUST always have a visible escape hatch.
 * A previous incarnation of the post-payment flow stranded a paying
 * subscriber, they paid, landed on a confirmation, and had no way
 * back into the app. So:
 *   - The header has a permanent "Skip" link to /today.
 *   - The body's primary CTA also goes to /today.
 *   - We never redirect this page unless the user has NO token at all
 *     (meaning auth itself failed). We never bounce them to /subscribe
 *     just because the status check is mid-flight or returns something
 *     unexpected, let them self-navigate.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { getSubscriptionStatus, type SubscriptionStatus } from "@/lib/subscription";
import { useT } from "@/lib/i18n";
import { PageHead, PageTitle, Section, InkButton, HairlineButton } from "@/components/PageHead";

export default function SubscribeWelcome() {
  const router = useRouter();
  const { t, lang } = useT();
  const { token, loading: authLoading } = useAuth();
  const [sub, setSub] = useState<SubscriptionStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  const loadStatus = useCallback((tok: string) => {
    setStatusLoading(true);
    getSubscriptionStatus(tok)
      .then(setSub)
      .catch(() => setSub(null))
      .finally(() => setStatusLoading(false));
  }, []);

  useEffect(() => {
    if (authLoading) return;          // auth context still hydrating
    if (!token) {                     // truly unauthenticated → login
      router.replace("/login");
      return;
    }
    loadStatus(token);
  }, [token, authLoading, router, loadStatus]);

  // Only claim the membership is active once the backend says so. Until
  // then (or if the status call failed) show a neutral confirming state
  // with a retry; the exits stay available either way.
  const confirmed = !statusLoading && !!sub?.has_access;

  // Always render the page, even when status hasn't loaded yet, so the
  // exit links are tappable from the very first paint. Status data is
  // garnish, not gating.
  const renews = sub?.current_period_end
    ? new Date(sub.current_period_end).toLocaleDateString(lang === "en" ? undefined : lang, {
        year: "numeric", month: "long", day: "numeric",
      })
    : null;

  return (
    <div className="min-h-[100dvh] bg-forest-deep" style={{ paddingBottom: "calc(96px + var(--sab, 0px))" }}>
      {/* Permanent header exit. No back button, back goes to Teya. The
          right-hand link IS the way home. Always visible, always tappable. */}
      <PageHead
        label={t("welcome.eyebrow")}
        right={
          <button
            onClick={() => router.push("/today")}
            className="font-body uppercase font-bold"
            style={{ fontSize: 12, letterSpacing: "0.2em", color: "rgb(var(--rgb-text-secondary))", padding: "6px 0" }}
          >
            {t("subscribe.continue_to_app")}
          </button>
        }
      />

      <div className="max-w-lg mx-auto px-5 page-enter">
        {confirmed ? (
          <PageTitle title={t("welcome.youre_in")} sub={t("welcome.active_body")} />
        ) : (
          <PageTitle title={t("welcome.confirming_title")} sub={t("welcome.confirming_body")} />
        )}

        {/* Primary CTA, above the fold on every phone */}
        <div className="space-y-3 mb-10">
          {!confirmed && (
            <HairlineButton onClick={() => token && loadStatus(token)} loading={statusLoading}>
              {t("common.retry")}
            </HairlineButton>
          )}
          <InkButton onClick={() => router.push("/today")}>{t("welcome.open_today")}</InkButton>
          <HairlineButton onClick={() => router.push("/profile/settings")}>{t("welcome.manage_subscription")}</HairlineButton>
        </div>

        {/* Quiet receipt, only shown if status loaded with details. We
            never block the page on this; the user can leave any time. */}
        {confirmed && sub && (sub.card_brand || sub.price || renews) && (
          <Section label={t("subscribe.eyebrow_subscription")}>
            {sub.card_brand && sub.card_last_four && (
              <Row label={t("subscribe.card_on_file")} value={`${sub.card_brand} \u00b7 ${sub.card_last_four}`} />
            )}
            {sub.price && <Row label={t("subscribe.price")} value={sub.price} />}
            {renews && <Row label={t("welcome.next_renewal")} value={renews} />}
          </Section>
        )}

        {/* What's unlocked, three quiet bullets, no marketing tone */}
        {confirmed && (
        <Section label={t("welcome.whats_open")}>
          <ul className="space-y-3 font-body" style={{ fontSize: 17, lineHeight: 1.62, fontWeight: 500, color: "rgb(var(--rgb-text-primary))" }}>
            <UnlockRow>{t("welcome.unlock_forecast")}</UnlockRow>
            <UnlockRow>{t("welcome.unlock_chat")}</UnlockRow>
            <UnlockRow>{t("welcome.unlock_souls")}</UnlockRow>
          </ul>
        </Section>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-baseline font-body" style={{ paddingBlock: 10, borderTop: "1px solid rgb(var(--rgb-border) / .6)" }}>
      <span style={{ fontSize: 15, color: "rgb(var(--rgb-text-secondary))" }}>{label}</span>
      <span style={{ fontSize: 17, fontWeight: 500, color: "rgb(var(--rgb-text-primary))" }}>{value}</span>
    </div>
  );
}

function UnlockRow({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span
        className="shrink-0 rounded-full"
        style={{ width: 4, height: 4, marginTop: 12, backgroundColor: "rgb(var(--rgb-text-primary))", opacity: 0.75 }}
      />
      <span>{children}</span>
    </li>
  );
}
