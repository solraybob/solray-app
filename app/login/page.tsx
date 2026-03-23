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
      router.push("/today");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-forest-deep flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm animate-fade-in">
        {/* Logo */}
        <div className="flex flex-col items-center mb-12">
          <div className="w-16 h-16 rounded-full overflow-hidden mb-4">
            <Image src="/logo.png" alt="Solray" width={64} height={64} className="w-full h-full object-cover" />
          </div>
          <h1 className="font-heading text-2xl tracking-widest text-text-primary uppercase">Solray AI</h1>
          <p className="text-text-secondary text-xs mt-1 tracking-widest">Your cosmic intelligence</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              required
              className="w-full bg-forest-card border border-forest-border rounded-lg px-4 py-3.5 text-text-primary placeholder-text-secondary font-body text-sm focus:border-amber-sun transition-colors"
            />
          </div>
          <div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              required
              className="w-full bg-forest-card border border-forest-border rounded-lg px-4 py-3.5 text-text-primary placeholder-text-secondary font-body text-sm focus:border-amber-sun transition-colors"
            />
          </div>

          {error && (
            <p className="text-red-400 text-xs text-center font-body">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-amber-sun text-forest-deep font-body font-semibold py-3.5 rounded-lg text-sm tracking-wider transition-all duration-200 hover:opacity-90 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
          >
            {loading ? <LoadingSpinner size="sm" /> : "Enter"}
          </button>
        </form>

        <p className="text-center text-text-secondary text-xs mt-8 font-body">
          New here?{" "}
          <Link href="/onboard" className="text-amber-sun hover:opacity-80 transition-opacity">
            Begin your journey
          </Link>
        </p>
      </div>
    </div>
  );
}
