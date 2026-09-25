"use client";

import { useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useSubscription } from "@/lib/subscription-context";
import LoadingSpinner from "./LoadingSpinner";
import TrialBanner from "./TrialBanner";
import InstallBanner from "./InstallBanner";

/**
 * ProtectedRoute
 *
 * Two gates before the page renders:
 *
 *   1. Auth gate: no token, /login.
 *   2. Access gate: token but no premium access (expired trial,
 *      cancelled past period end, etc.), /subscribe so the user has a
 *      clear path back. The /subscribe page already carries the right
 *      copy for every post-trial state.
 *
 * Subscribe-pages bypass the access gate. Both /subscribe and
 * /subscribe/welcome are reachable for users without active access,
 * if we redirected those, an expired user trying to rejoin would hit
 * an infinite loop (gate, /subscribe, gate, /subscribe ...).
 *
 * Backend endpoints (forecast, chat, blueprint reads) all enforce
 * `require_premium` independently, this gate is the UX layer on top of
 * that, so an expired user gets cleanly redirected instead of seeing a
 * page chrome that then errors on every data fetch.
 *
 * Subscription state comes from the shared SubscriptionProvider, NOT a
 * fresh fetch on every transition. Earlier versions of this component
 * called getSubscriptionStatus on every protected route mount, which
 * meant moving Today, Chat, Souls, Profile paid a round trip per
 * navigation. The provider caches with a short TTL (30s) and the
 * existing mount calls ensureFresh so a cold visit still re-checks.
 *
 * Failure mode is deliberate: if the status call itself errors (network,
 * backend down) we let the page render rather than trap a paying user
 * on a spinner. The page's own API calls will surface real errors.
 */
export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { token, loading: authLoading } = useAuth();
  const { sub, loading: subLoading, ensureFresh } = useSubscription();
  const router = useRouter();
  const pathname = usePathname() || "";

  // Pages where we explicitly do NOT enforce active-subscription
  // (otherwise an expired user could never reach the page that lets
  // them re-subscribe). Includes the welcome page so a brand-new
  // subscriber's status-cache lag doesn't ricochet them off it either.
  const isSubscribeRoute =
    pathname === "/subscribe" || pathname.startsWith("/subscribe/");
  // Admin tools are never subscription-gated: the backend authorizes every
  // /admin endpoint by role on its own, and an operator whose own trial has
  // lapsed must still be able to reach the admin pages.
  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");
  const skipAccessGate = isSubscribeRoute || isAdminRoute;

  // Did this mount ever see a live session? If the token disappears while the
  // page is open, that is a sign out (or account deletion): go to a plain
  // /login, not /login?next=<this page>, so the next person to sign in on
  // this device does not land on the previous member's settings screen.
  const hadToken = useRef(false);
  if (token) hadToken.current = true;

  // 1. Auth gate
  useEffect(() => {
    if (!authLoading && !token) {
      if (hadToken.current) {
        router.replace("/login");
        return;
      }
      // replace, not push: Back from /login must not land on a protected
      // page that immediately bounces again. Carry the current location so
      // login can return the member to where they were.
      let next = pathname;
      try {
        next = window.location.pathname + window.location.search;
      } catch { /* SSR: keep pathname */ }
      const q = next && next !== "/" ? `?next=${encodeURIComponent(next)}` : "";
      router.replace(`/login${q}`);
    }
  }, [token, authLoading, router, pathname]);

  // 2. Access gate. Trigger a TTL-aware refresh on every mount, but do
  //    NOT block render on it: if we already have a cached sub, render
  //    immediately; if not, the provider's loading state shows a
  //    spinner. The check below redirects on no_access regardless of
  //    whether the data was cached or freshly fetched, so the gate
  //    still works on expiry.
  useEffect(() => {
    if (!token || skipAccessGate) return;
    void ensureFresh();
  }, [token, skipAccessGate, ensureFresh]);

  // Redirect when we know the user has no access. Triggers on both
  // initial load AND when refresh() lands a fresh state showing
  // expiry happened mid-session.
  useEffect(() => {
    if (!token || skipAccessGate) return;
    if (sub && !sub.has_access) {
      router.replace("/subscribe");
    }
  }, [token, sub, skipAccessGate, router]);

  // Render order:
  //   - Auth still loading: spinner
  //   - No token: render nothing (redirect already in flight)
  //   - Subscribe route: bypass access check, render immediately
  //   - Sub still loading AND no cached value: spinner
  //   - Otherwise: render
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-forest-deep">
        <LoadingSpinner size="lg" />
      </div>
    );
  }
  if (!token) return null;
  if (!skipAccessGate && subLoading && !sub) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-forest-deep">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <>
      <InstallBanner />
      <TrialBanner />
      {children}
    </>
  );
}
