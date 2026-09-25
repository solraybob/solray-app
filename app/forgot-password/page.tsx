"use client";

/**
 * /forgot-password, request a reset link.
 *
 * Posts the email to /users/forgot-password. The backend always returns
 * the same success payload regardless of whether the email is registered
 * (anti-enumeration), so this page mirrors that: on submit we always
 * show the same "if that email is registered, a link is on the way"
 * message, even if no account matches. Users who mistype get a small
 * UX cost; attackers can't probe for valid emails.
 */

import { useState } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n";
import { errorText } from "@/lib/errors";
import { PageHead, PageTitle, BodyText, InkButton, hairlinePillStyle, inputStyle } from "@/components/PageHead";

export default function ForgotPasswordPage() {
  const { t } = useT();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const apiUrl = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").trim();
    try {
      const res = await fetch(`${apiUrl}/users/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(errorText(e?.detail, t("forgot.error_request")));
      }
      setSubmitted(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("common.error_generic"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-forest-deep" style={{ paddingBottom: "calc(48px + var(--sab, 0px))" }}>
      <PageHead label={t("forgot.reset_password")} />
      <div className="max-w-lg mx-auto px-5 animate-fade-in">
        {submitted ? (
          <>
            <PageTitle title={t("forgot.sent_title")} sub={t("forgot.sent_detail")} />
            <Link
              href="/login"
              className="block w-full text-center py-4 px-8 rounded-full text-[14px] tracking-[0.3em] uppercase font-bold"
              style={hairlinePillStyle}
            >
              {t("forgot.back_to_login")}
            </Link>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <PageTitle title={t("forgot.reset_password")} />
            <BodyText muted style={{ marginBottom: 24, marginTop: -12 }}>{t("forgot.prompt")}</BodyText>

            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("login.email_placeholder")}
              required
              autoFocus
              className="font-body placeholder-text-muted"
              style={inputStyle}
            />

            {error && (
              <p className="font-body mt-4" style={{ fontSize: 15, color: "rgb(var(--rgb-ember))" }}>{error}</p>
            )}

            <div className="mt-6 space-y-3">
              <InkButton type="submit" loading={loading} disabled={!email.trim()}>
                {t("forgot.send_link")}
              </InkButton>
              <Link
                href="/login"
                className="block w-full text-center py-4 px-8 rounded-full text-[14px] tracking-[0.3em] uppercase font-bold"
                style={hairlinePillStyle}
              >
                {t("forgot.back_to_login")}
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
