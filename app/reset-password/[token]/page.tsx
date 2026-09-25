"use client";

/**
 * /reset-password/[token], set a new password using the link from email.
 *
 * Posts {token, new_password} to /users/reset-password. On success the
 * backend returns a fresh JWT and we log the user in immediately so
 * they don't have to remember the password they just set and re-type
 * it on the login page.
 */

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/i18n";
import { errorText } from "@/lib/errors";
import { PageHead, PageTitle, InkButton, hairlinePillStyle, inputStyle } from "@/components/PageHead";

const MIN_PASSWORD = 8;

export default function ResetPasswordPage() {
  const { t } = useT();
  const params = useParams();
  const router = useRouter();
  const { setToken } = useAuth();
  const token = String(params?.token || "");

  const [password,  setPassword]  = useState("");
  const [confirm,   setConfirm]   = useState("");
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < MIN_PASSWORD) {
      setError(t("reset.error_too_short"));
      return;
    }
    if (password !== confirm) {
      setError(t("reset.error_mismatch"));
      return;
    }

    setLoading(true);
    const apiUrl = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").trim();
    try {
      const res = await fetch(`${apiUrl}/users/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, new_password: password }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(errorText(e?.detail, t("reset.error_failed")));
      }
      const data = await res.json();
      // Backend issues a fresh JWT so we land the user straight into
      // /today rather than bouncing them through the login page.
      if (data.token && data.profile) {
        setToken(data.token, {
          id: data.profile.id || data.user_id,
          email: data.profile.email,
          name: data.profile.name,
        });
        router.replace("/today");
      } else {
        // Backend returned ok but no token, fall back to login.
        router.replace("/login");
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("common.error_generic"));
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-forest-deep" style={{ paddingBottom: "calc(48px + var(--sab, 0px))" }}>
      <PageHead label={t("reset.set_new_password")} />
      <div className="max-w-lg mx-auto px-5 animate-fade-in">
        <form onSubmit={handleSubmit}>
          <PageTitle title={t("reset.set_new_password")} sub={t("reset.prompt")} />

          <div className="space-y-3">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("reset.new_password")}
              autoComplete="new-password"
              required
              autoFocus
              minLength={MIN_PASSWORD}
              className="font-body placeholder-text-muted"
              style={inputStyle}
            />
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder={t("reset.confirm_password")}
              autoComplete="new-password"
              required
              minLength={MIN_PASSWORD}
              className="font-body placeholder-text-muted"
              style={inputStyle}
            />
          </div>

          {error && (
            <p className="font-body mt-4" style={{ fontSize: 15, color: "rgb(var(--rgb-ember))" }}>{error}</p>
          )}

          <div className="mt-6 space-y-3">
            <InkButton type="submit" loading={loading} disabled={password.length < MIN_PASSWORD || password !== confirm}>
              {t("reset.set_password")}
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
      </div>
    </div>
  );
}
