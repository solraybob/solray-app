"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { PageHead, PageTitle, HairlineButton, InkButton } from "@/components/PageHead";
import { ResendVerification } from "./ResendVerification";

/**
 * The whole screen for a web signup whose free trial waits on the email
 * being confirmed. Resend, a way to get help with a wrong address, and the
 * parts of the account that stay open without a membership (settings).
 * Checked again when the member comes back to the tab, and on request, so
 * confirming in the mail app moves them on to Today.
 */
export function PendingTrialView({
  token, email, onCheck, onSignOut, onAccountSettings,
}: {
  token: string | null;
  email: string | null;
  onCheck: () => Promise<boolean>;
  onSignOut: () => void;
  onAccountSettings: () => void;
}) {
  const { t } = useT();
  const [checking, setChecking] = useState(false);
  const [notYet, setNotYet] = useState(false);
  useEffect(() => {
    const again = () => { if (document.visibilityState === "visible") void onCheck(); };
    document.addEventListener("visibilitychange", again);
    window.addEventListener("focus", again);
    return () => {
      document.removeEventListener("visibilitychange", again);
      window.removeEventListener("focus", again);
    };
  }, [onCheck]);
  const check = async () => {
    if (checking) return;
    setChecking(true);
    setNotYet(false);
    try {
      await onCheck();
    } finally {
      setChecking(false);
      // Still on this screen: not confirmed yet (once it is, the page
      // moves on to Today by itself).
      setNotYet(true);
    }
  };
  return (
    <div className="min-h-[100dvh] bg-forest-deep" style={{ paddingBottom: "calc(96px + var(--sab, 0px))" }}>
      <PageHead label={t("subscribe.eyebrow_subscription")} />
      <div className="max-w-lg mx-auto px-5">
        <PageTitle
          title={t("subscribe.pending_title")}
          sub={email ? t("subscribe.pending_body").replace("{email}", email) : t("subscribe.pending_body_no_email")}
        />
        <div className="space-y-3">
          <InkButton onClick={check} loading={checking}>{t("subscribe.pending_confirmed")}</InkButton>
          {notYet && (
            <p role="status" className="font-body" style={{ fontSize: 15, lineHeight: 1.6, color: "rgb(var(--rgb-text-secondary))" }}>
              {t("subscribe.pending_not_yet")}
            </p>
          )}
        </div>
        <div className="mt-4">
          <ResendVerification token={token} />
        </div>
        <p className="font-body" style={{ fontSize: 15, lineHeight: 1.6 }}>
          <a
            href="https://solray.ai/support"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-4"
            style={{ color: "rgb(var(--rgb-text-secondary))" }}
          >
            {t("subscribe.pending_help")}
          </a>
        </p>
        <div className="mt-10 space-y-3" style={{ borderTop: "1px solid rgb(var(--rgb-border))", paddingTop: 20 }}>
          <p className="font-body" style={{ fontSize: 15, lineHeight: 1.6, color: "rgb(var(--rgb-text-muted))" }}>
            {t("subscribe.pending_free_parts")}
          </p>
          <HairlineButton onClick={onAccountSettings}>{t("subscribe.account_settings")}</HairlineButton>
          <HairlineButton onClick={onSignOut}>{t("common.sign_out")}</HairlineButton>
        </div>
      </div>
    </div>
  );
}
