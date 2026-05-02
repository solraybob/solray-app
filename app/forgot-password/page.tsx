"use client";

/**
 * /forgot-password — request a reset link.
 *
 * Posts the email to /users/forgot-password. The backend always returns
 * the same success payload regardless of whether the email is registered
 * (anti-enumeration), so this page mirrors that: on submit we always
 * show the same "if that email is registered, a link is on the way"
 * message, even if no account matches. Users who mistype get a small
 * UX cost; attackers can't probe for valid emails.
 */

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import LoadingSpinner from "@/components/LoadingSpinner";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    try {
      const res = await fetch(`${apiUrl}/users/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.detail || "Could not request a reset. Try again.");
      }
      setSubmitted(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
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
          <p className="font-body text-text-secondary text-[12px] mt-3 tracking-[0.22em] uppercase">Reset password</p>
        </div>

        {submitted ? (
          <div className="text-center space-y-4">
            <p className="font-body text-text-primary text-[16px] leading-relaxed">
              If that email is registered, a reset link is on the way.
            </p>
            <p className="font-body text-text-secondary text-[14px] leading-relaxed">
              The link is good for one hour. Check spam if it does not arrive within a few minutes.
            </p>
            <Link
              href="/login"
              className="inline-block mt-6 font-body text-amber-sun text-[14px] tracking-[0.18em] uppercase hover:opacity-80 transition-opacity"
            >
              Back to login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="font-body text-text-secondary text-[15px] leading-relaxed text-center mb-4">
              Enter your email. We&rsquo;ll send a link to set a new password.
            </p>

            <div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                autoComplete="email"
                required
                autoFocus
                className="w-full bg-forest-card border border-forest-border rounded-lg px-4 py-3.5 text-text-primary placeholder-text-secondary font-body text-base focus:border-amber-sun transition-colors"
              />
            </div>

            {error && (
              <p className="text-ember text-xs text-center font-body">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || !email.trim()}
              className="w-full bg-amber-sun text-forest-deep font-body font-semibold py-3.5 rounded-lg text-sm tracking-wider transition-all duration-200 hover:opacity-90 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
            >
              {loading ? <LoadingSpinner size="sm" /> : "Send reset link"}
            </button>

            <p className="text-center text-text-secondary text-xs mt-5 font-body">
              <Link href="/login" className="hover:text-text-primary transition-colors">
                Back to login
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
