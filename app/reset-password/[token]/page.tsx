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
import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import LoadingSpinner from "@/components/LoadingSpinner";

export default function ResetPasswordPage() {
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

    if (password.length < 6) {
      setError("Password should be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    try {
      const res = await fetch(`${apiUrl}/users/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, new_password: password }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.detail || "Could not reset password.");
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
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-forest-deep flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="flex flex-col items-center mb-10">
          <div className="w-8 h-8 rounded-full overflow-hidden mb-4">
            <Image src="/logo.jpg" alt="Solray" width={32} height={32} className="w-full h-full object-cover" />
          </div>
          <h1 className="font-heading text-2xl tracking-[0.15em] text-text-primary" style={{ fontWeight: 300 }}>SOLRAY</h1>
          <p className="font-body text-text-secondary text-[12px] mt-3 tracking-[0.22em] uppercase">Set new password</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="font-body text-text-secondary text-[15px] leading-relaxed text-center mb-4">
            Pick a new password. We&rsquo;ll log you in once it&rsquo;s set.
          </p>

          <div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="New password"
              autoComplete="new-password"
              required
              autoFocus
              minLength={6}
              className="w-full bg-forest-card border border-forest-border rounded-lg px-4 py-3.5 text-text-primary placeholder-text-secondary font-body text-base focus:border-amber-sun transition-colors"
            />
          </div>
          <div>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Confirm password"
              autoComplete="new-password"
              required
              minLength={6}
              className="w-full bg-forest-card border border-forest-border rounded-lg px-4 py-3.5 text-text-primary placeholder-text-secondary font-body text-base focus:border-amber-sun transition-colors"
            />
          </div>

          {error && (
            <p className="text-ember text-xs text-center font-body">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || password.length < 6 || password !== confirm}
            className="w-full bg-amber-sun text-forest-deep font-body font-semibold py-3.5 rounded-lg text-sm tracking-wider transition-all duration-200 hover:opacity-90 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
          >
            {loading ? <LoadingSpinner size="sm" /> : "Set password"}
          </button>

          <p className="text-center text-text-secondary text-xs mt-5 font-body">
            <Link href="/login" className="hover:text-text-primary transition-colors">
              Back to login
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
