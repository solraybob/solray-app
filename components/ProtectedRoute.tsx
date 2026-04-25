"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { getSubscriptionStatus } from "@/lib/subscription";
import LoadingSpinner from "./LoadingSpinner";
import TrialBanner from "./TrialBanner";

/**
 * ProtectedRoute
 *
 * Two gates before the page renders:
 *
 *   1. Auth gate: no token → /login.
 *   2. Access gate: token but no premium access (expired trial,
 *      cancelled past period end, etc.) → /subscribe so the user has a
 *      clear path back. The /subscribe page already carries the right
 *      copy for every post-trial state.
 *
 * Backend endpoints (forecast, chat, blueprint reads) all enforce
 * `require_premium` independently — this gate is the UX layer on top of
 * that, so an expired user gets cleanly redirected instead of seeing a
 * page chrome that then errors on every data fetch.
 *
 * Failure mode is deliberate: if the status call itself errors (network,
 * backend down) we let the page render rather than trap a paying user
 * on a spinner. The page's own API calls will surface real errors.
 */
export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { token, loading } = useAuth();
  const router = useRouter();
  const [accessChecked, setAccessChecked] = useState(false);

  useEffect(() => {
    if (!loading && !token) {
      router.push("/login");
    }
  }, [token, loading, router]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    getSubscriptionStatus(token)
      .then((sub) => {
        if (cancelled) return;
        if (!sub.has_access) {
          router.replace("/subscribe");
          return;
        }
        setAccessChecked(true);
      })
      .catch(() => {
        // Network or backend error: don't strand the user on a spinner.
        // Backend endpoints still gate independently — the page's own
        // calls will surface a real error if the user truly lacks access.
        if (!cancelled) setAccessChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, [token, router]);

  if (loading || (token && !accessChecked)) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-forest-deep">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!token) return null;

  return (
    <>
      <TrialBanner />
      {children}
    </>
  );
}
