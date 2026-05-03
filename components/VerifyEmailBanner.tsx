"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";

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
  const { token } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  // Don't render if verified, dismissed, or unknown
  if (emailVerified !== false || dismissed) return null;

  const handleResend = async () => {
    if (!token || sending) return;
    setSending(true);
    try {
      await apiFetch("/users/resend-verification", { method: "POST" }, token);
      setSent(true);
    } catch {
      // Silently fail: the user can try again
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="px-4 py-3 flex items-center justify-between gap-3"
      style={{
        background: "rgba(243,146,48,0.08)",
        borderBottom: "1px solid rgba(243,146,48,0.15)",
      }}
    >
      <p className="text-xs" style={{ color: "var(--amber, #f39230)" }}>
        {sent
          ? "Verification email sent. Check your inbox."
          : "Please verify your email to unlock all features."}
      </p>
      <div className="flex items-center gap-2 shrink-0">
        {!sent && (
          <button
            onClick={handleResend}
            disabled={sending}
            className="text-xs px-3 py-1 rounded-sm transition-opacity"
            style={{
              background: "var(--amber, #f39230)",
              color: "var(--bg-deep)",
              opacity: sending ? 0.5 : 1,
            }}
          >
            {sending ? "Sending..." : "Resend"}
          </button>
        )}
        <button
          onClick={() => setDismissed(true)}
          className="text-xs px-1 opacity-40 hover:opacity-70"
          style={{ color: "var(--text-secondary)" }}
          aria-label="Dismiss"
        >
          &times;
        </button>
      </div>
    </div>
  );
}
