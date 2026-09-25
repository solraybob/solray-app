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

/* Only same-origin relative paths: must start with "/" but not "//" (or
   "/\\"), which browsers treat as protocol-relative, off-site URLs. */
function safeNext(raw: string | null): string {
  if (!raw) return "/today";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/today";
  if (raw.startsWith("/login") || raw.startsWith("/onboard")) return "/today";
  return raw;
}

export default function LoginPage() {
  const { t } = useT();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login, token } = useAuth();
  const router = useRouter();

  // ?next= (where a protected page sent them from) and ?expired=1 (the
  // API layer's 401 handler). Read from window.location on mount instead of
  // useSearchParams so the page stays statically renderable without a
  // Suspense boundary.
  const [nextPath, setNextPath] = useState("/today");
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      setNextPath(safeNext(params.get("next")));
      setExpired(params.get("expired") === "1");
    } catch { /* keep defaults */ }
  }, []);

  useEffect(() => {
    if (token) router.replace(nextPath);
  }, [token, router, nextPath]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password, t("login.error_failed"));
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
      router.replace(nextPath);
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
              filter: "drop-shadow(0 18px 26px rgb(var(--rgb-amber) / .26))",
            }}
          >
            <Image
              src="/solray-orb.png"
              unoptimized
              alt="Solray"
              width={96}
              height={96}
              priority
              className="w-full h-full object-contain"
            />
          </div>
          <h1 className="font-heading text-2xl text-text-primary entry-rise inline-flex items-baseline" style={{ fontWeight: 700, letterSpacing: "-0.02em", "--d": "180ms" } as React.CSSProperties} aria-label="Solray">
            <span>s</span>
            <Image src="/solray-orb.png" alt="" width={22} height={22} unoptimized style={{ width: "1ex", height: "1ex", objectFit: "contain", margin: "0 .01em", transform: "translateY(.02em)" }} />
            <span>lray</span>
          </h1>
          <p className="font-body text-text-muted mt-2 entry-rise uppercase" style={{ fontSize: 13, letterSpacing: "0.22em", fontWeight: 500, "--d": "300ms" } as React.CSSProperties}>{t("login.tagline")}</p>
          <p className="font-body text-text-secondary text-[14px] mt-3 tracking-[0.22em] uppercase entry-rise font-bold" style={{ "--d": "420ms" } as React.CSSProperties}>{t("login.cosmic_intelligence")}</p>
        </div>

        {/* Form */}
        {expired && !error && (
          <p className="font-body text-center mb-4 entry-rise" style={{ fontSize: 15, lineHeight: 1.5, color: "rgb(var(--rgb-text-secondary))" }}>
            {t("login.session_expired")}
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 entry-rise" style={{ "--d": "560ms" } as React.CSSProperties}>
          <div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("login.email_placeholder")}
              autoComplete="email"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
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
            <p className="text-center font-body" style={{ fontSize: 15, color: "rgb(var(--rgb-ember))" }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full font-body font-bold py-4 rounded-full text-[14px] uppercase tracking-[0.3em] transition-all duration-200 hover:opacity-90 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 mt-2 entry-cta"
            style={{ background: "rgb(var(--rgb-text-primary))", color: "rgb(var(--rgb-bg-deep))", border: "1.5px solid rgb(var(--rgb-text-primary))" }}
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
          <Link href="/onboard" className="hover:opacity-80 transition-opacity underline underline-offset-4" style={{ color: "rgb(var(--rgb-text-primary))" }}>
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
