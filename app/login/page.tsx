"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import LoadingSpinner from "@/components/LoadingSpinner";
import LanguagePicker from "@/components/LanguagePicker";
import { useT } from "@/lib/i18n";
import EntrySky from "@/components/EntrySky";
import InstallApp from "@/components/InstallApp";

export default function LoginPage() {
  const { t } = useT();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login, token } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (token) router.push("/today");
  }, [token, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      // Fix 5: Prefetch blueprint in background after login
      // so Chart screen is instant on first visit
      const storedToken = localStorage.getItem("solray_token");
      if (storedToken) {
        const apiUrl = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").trim();
        fetch(`${apiUrl}/users/me`, {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${storedToken}`,
          },
        })
          .then((r) => r.json())
          .then((data) => {
            if (data.blueprint) {
              try {
                localStorage.setItem(
                  "solray_blueprint",
                  JSON.stringify({ ...data.blueprint, _cachedAt: Date.now() })
                );
              } catch (_) {
                // ignore storage errors
              }
            }
          })
          .catch(() => {
            // prefetch failure is silent, doesn't block login
          });
      }
      router.push("/today");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("login.error_no_signal"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-forest-deep flex flex-col items-center justify-center px-6 relative overflow-hidden">
      <EntrySky />
      {/* The observatory bezel: two counter-rotating instrument rings, the
          landing hero's signature, here framing the door into the app. */}
      <svg className="entry-instrument" viewBox="0 0 1000 1000" aria-hidden="true">
        <circle cx="500" cy="500" r="478" fill="none" stroke="rgba(242,236,216,0.09)" strokeWidth="1" />
        <circle cx="500" cy="500" r="430" fill="none" stroke="rgba(242,236,216,0.06)" strokeWidth="1" strokeDasharray="1 7" />
        {Array.from({ length: 60 }, (_, i) => {
          const major = i % 5 === 0;
          const ang = (i / 60) * Math.PI * 2;
          const r1 = major ? 452 : 466;
          return (
            <line
              key={i}
              x1={500 + r1 * Math.cos(ang)}
              y1={500 + r1 * Math.sin(ang)}
              x2={500 + 478 * Math.cos(ang)}
              y2={500 + 478 * Math.sin(ang)}
              stroke="rgba(242,236,216,1)"
              strokeOpacity={major ? 0.12 : 0.06}
              strokeWidth={major ? 1.4 : 0.8}
            />
          );
        })}
        {Array.from({ length: 4 }, (_, i) => {
          const ang = (i / 4) * Math.PI * 2 + Math.PI / 6;
          const x = 500 + 430 * Math.cos(ang);
          const y = 500 + 430 * Math.sin(ang);
          return <path key={`d-${i}`} d={`M ${x} ${y - 5} L ${x + 5} ${y} L ${x} ${y + 5} L ${x - 5} ${y} Z`} fill="rgba(243,146,48,0.22)" />;
        })}
      </svg>
      <svg className="entry-instrument entry-instrument-inner" viewBox="0 0 1000 1000" aria-hidden="true">
        <circle cx="500" cy="500" r="478" fill="none" stroke="rgba(242,236,216,0.07)" strokeWidth="1" strokeDasharray="2 10" />
        <circle cx="500" cy="500" r="380" fill="none" stroke="rgba(242,236,216,0.05)" strokeWidth="1" />
      </svg>

      {/* Quiet language switcher in the corner. Users who arrived in
          Spanish (browser locale or chosen on a previous visit) see the
          page in Spanish already; this lets the rest opt in before they
          even create an account. */}
      <div className="absolute top-4 right-4 z-10">
        <LanguagePicker layout="inline" />
      </div>
      <div className="w-full max-w-sm relative z-10">
        {/* Logo — same sun as the landing hero, transparent PNG with the
            amber drop-shadow halo. No circle clip; the silhouette IS the
            shape, which avoids the iOS Safari square-halo bug we hit on
            solray.ai. */}
        <div className="flex flex-col items-center mb-12">
          <div
            className="w-24 h-24 mb-5 entry-sun entry-rise"
            style={{
              filter:
                "drop-shadow(0 0 32px rgba(243, 146, 48, 0.42)) drop-shadow(0 0 80px rgba(243, 146, 48, 0.18))",
            }}
          >
            <Image
              src="/solray-sun.png"
              unoptimized
              alt="Solray"
              width={96}
              height={96}
              priority
              className="w-full h-full object-contain"
            />
          </div>
          <h1 className="font-heading text-2xl tracking-[0.15em] text-text-primary entry-rise" style={{ fontWeight: 300, "--d": "180ms" } as React.CSSProperties}>SOLRAY</h1>
          <p className="font-heading text-sm text-text-secondary mt-1 tracking-[0.06em] entry-rise" style={{ fontStyle: "italic", fontWeight: 300, "--d": "300ms" } as React.CSSProperties}>living by design</p>
          <p className="font-body text-text-secondary text-[12px] mt-3 tracking-[0.22em] uppercase entry-rise" style={{ "--d": "420ms" } as React.CSSProperties}>{t("login.cosmic_intelligence")}</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 entry-rise" style={{ "--d": "560ms" } as React.CSSProperties}>
          <div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("login.email_placeholder")}
              autoComplete="email"
              required
              className="w-full bg-forest-card border border-forest-border rounded-lg px-4 py-3.5 text-text-primary placeholder-text-secondary font-body text-base focus:border-amber-sun transition-colors entry-input"
            />
          </div>
          <div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("login.password_placeholder")}
              autoComplete="current-password"
              required
              className="w-full bg-forest-card border border-forest-border rounded-lg px-4 py-3.5 text-text-primary placeholder-text-secondary font-body text-base focus:border-amber-sun transition-colors entry-input"
            />
          </div>

          {error && (
            <p className="text-ember text-xs text-center font-body">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-amber-sun text-forest-deep font-body font-semibold py-3.5 rounded-lg text-sm tracking-wider transition-all duration-200 hover:opacity-90 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 mt-2 entry-cta"
          >
            {loading ? <LoadingSpinner size="sm" /> : t("login.enter")}
          </button>
        </form>

        <p className="text-center text-text-secondary text-xs mt-5 font-body entry-rise" style={{ "--d": "720ms" } as React.CSSProperties}>
          <Link href="/forgot-password" className="hover:text-text-primary transition-colors">
            {t("login.forgot_password")}
          </Link>
        </p>

        <p className="text-center text-text-secondary text-xs mt-6 font-body entry-rise" style={{ "--d": "820ms" } as React.CSSProperties}>
          {t("login.new_here")}{" "}
          <Link href="/onboard" className="text-amber-sun hover:opacity-80 transition-opacity">
            {t("login.begin_journey")}
          </Link>
        </p>

        {/* Add-to-home-screen. Renders only when the browser can install (or on
            iOS, where it shows the manual Share instruction); invisible once
            installed. Lets influencer traffic put the icon on their phone today,
            ahead of the native app stores. */}
        <div className="mt-8 entry-rise" style={{ "--d": "920ms" } as React.CSSProperties}>
          <InstallApp variant="ghost" />
        </div>
      </div>
    </div>
  );
}
