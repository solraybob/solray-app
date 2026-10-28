"use client";

import { useT } from "@/lib/i18n";
import { PageHead, PageTitle, Section, HairlineButton } from "@/components/PageHead";
import { Notice, ActionButton } from "./subscribe-ui";

export function TrialOffer({
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
