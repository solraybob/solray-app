"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";
import { useT } from "@/lib/i18n";

/**
 * VerifyEmailBanner
 *
 * Shows a subtle banner when the user's email is not yet verified.
 * Includes a one-tap resend button. Dismissable per session.
 *
 * Usage: drop <VerifyEmailBanner /> into any page or layout.
 * It renders nothing if the user is already verified.
 */
export default function VerifyEmailBanner({
  emailVerified,
}: {
  emailVerified: boolean | undefined;
}) {
  const { t } = useT();
  const { token } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [failed, setFailed] = useState(false);

  // Don't render if verified, dismissed, or unknown
  if (emailVerified !== false || dismissed) return null;

  const handleResend = async () => {
    if (!token || sending) return;
    setSending(true);
    setFailed(false);
    try {
      await apiFetch("/users/resend-verification", { method: "POST" }, token);
      setSent(true);
    } catch {
      setFailed(true);
    } finally {
      setSending(false);
    }
  };

  // One-look strip: a hairline under it, muted body text, a hairline pill.
  // No tinted purple band.
  return (
    <div
      className="max-w-lg mx-auto px-5 py-3 flex items-center justify-between gap-3"
      style={{ borderBottom: "1px solid rgb(var(--rgb-border))" }}
    >
      <p className="font-body" style={{ fontSize: 14, lineHeight: 1.5, color: failed ? "rgb(var(--rgb-ember))" : "rgb(var(--rgb-text-secondary))" }}>
        {sent ? t("verify_banner.sent") : failed ? t("verify_banner.failed") : t("verify_banner.prompt")}
      </p>
      <div className="flex items-center gap-2 shrink-0">
        {!sent && (
          <button
            onClick={handleResend}
            disabled={sending}
            className="font-body uppercase font-bold rounded-full transition-opacity disabled:opacity-50"
            style={{
              fontSize: 11,
              letterSpacing: "0.2em",
              padding: "6px 12px",
              background: "transparent",
              border: "1px solid rgb(var(--rgb-border))",
              color: "rgb(var(--rgb-text-secondary))",
            }}
          >
            {sending ? t("verify_banner.sending") : t("verify_banner.resend")}
          </button>
        )}
        <button
          onClick={() => setDismissed(true)}
          className="px-1"
          style={{ fontSize: 18, lineHeight: 1, color: "rgb(var(--rgb-text-muted))" }}
          aria-label={t("common.dismiss")}
        >
          &times;
        </button>
      </div>
    </div>
  );
}
