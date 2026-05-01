"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import LoadingSpinner from "@/components/LoadingSpinner";

export default function LoginPage() {
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
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
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
            // prefetch failure is silent — doesn't block login
          });
      }
      router.push("/today");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "The signal didn't reach. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-forest-deep flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm animate-fade-in">
        {/* Logo */}
        <div className="flex flex-col items-center mb-12">
          <div className="w-8 h-8 rounded-full overflow-hidden mb-4">
            <Image src="/logo.jpg" alt="Solray" width={32} height={32} className="w-full h-full object-cover" />
          </div>
          <h1 className="font-heading text-2xl tracking-[0.15em] text-text-primary" style={{ fontWeight: 300 }}>SOLRAY</h1>
          <p className="font-heading text-sm text-text-secondary mt-1 tracking-[0.06em]" style={{ fontStyle: "italic", fontWeight: 300 }}>living by design</p>
          <p className="font-body text-text-secondary text-[10px] mt-3 tracking-[0.22em] uppercase">Your cosmic intelligence</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              autoComplete="email"
              required
              className="w-full bg-forest-card border border-forest-border rounded-lg px-4 py-3.5 text-text-primary placeholder-text-secondary font-body text-base focus:border-amber-sun transition-colors"
            />
          </div>
          <div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete="current-password"
              required
              className="w-full bg-forest-card border border-forest-border rounded-lg px-4 py-3.5 text-text-primary placeholder-text-secondary font-body text-base focus:border-amber-sun transition-colors"
            />
          </div>

          {error && (
            <p className="text-ember text-xs text-center font-body">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-amber-sun text-forest-deep font-body font-semibold py-3.5 rounded-lg text-sm tracking-wider transition-all duration-200 hover:opacity-90 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
          >
            {loading ? <LoadingSpinner size="sm" /> : "Enter"}
          </button>
        </form>

        <p className="text-center text-text-secondary text-xs mt-5 font-body">
          <Link href="/forgot-password" className="hover:text-text-primary transition-colors">
            Forgot password?
          </Link>
        </p>

        <p className="text-center text-text-secondary text-xs mt-6 font-body">
          New here?{" "}
          <Link href="/onboard" className="text-amber-sun hover:opacity-80 transition-opacity">
            Begin your journey
          </Link>
        </p>
      </div>
    </div>
  );
}
