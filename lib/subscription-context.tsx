"use client";

/**
 * lib/subscription-context.tsx
 *
 * Shared subscription state with a short TTL. Replaces the previous
 * pattern where ProtectedRoute called /subscribe/status on every
 * protected route entry, TrialBanner called it again, and /subscribe
 * called it a third time. On a typical Today, Chat, Souls, Profile
 * cycle that was four redundant calls per page transition just to
 * answer "is this user still allowed to be here."
 *
 * Now: one fetch per TTL window, shared by every consumer. Dedupes
 * concurrent in-flight requests so even if three components mount
 * simultaneously the call happens once.
 *
 * TTL is intentionally short (30s). Long enough that page transitions
 * never refetch in normal flow. Short enough that real status changes
 * (trial just ended, payment just succeeded, manual cancel) propagate
 * within one navigation. Components that need a hard refresh (the
 * subscribe page after a Teya callback) can call refresh() to bypass
 * the cache.
 *
 * Failure mode mirrors ProtectedRoute's previous behavior: if the
 * status call errors (network, backend down) we don't trap users on
 * a spinner. Backend endpoints still gate access independently, so
 * an actually-expired user will hit a 403 on their first data fetch
 * and get redirected to /subscribe by ProtectedRoute's catch path.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "./auth-context";
import { getSubscriptionStatus, type SubscriptionStatus } from "./subscription";

const TTL_MS = 30_000; // 30 seconds

interface SubscriptionState {
  sub: SubscriptionStatus | null;
  loading: boolean;
  error: Error | null;
  /** Force a fresh fetch from the backend, bypassing the TTL cache. */
  refresh: () => Promise<void>;
  /** Refresh only if cache is older than TTL_MS. Cheap to call on every mount. */
  ensureFresh: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionState>({
  sub: null,
  loading: true,
  error: null,
  refresh: async () => {},
  ensureFresh: async () => {},
});

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const [sub, setSub] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Tracks when the last successful fetch completed; used to decide
  // whether ensureFresh() needs to call the backend.
  const lastFetchRef = useRef<number>(0);
  // Coalesces concurrent fetches: if three components call ensureFresh
  // in the same tick, only one /subscribe/status request goes out.
  // Keyed by token: a request started under one session is never shared
  // with, or allowed to write state for, a different session.
  const inFlightRef = useRef<{ token: string; promise: Promise<void>; key: object } | null>(null);
  // Always the current token, updated during render so async results can
  // tell whether they still belong to the live session.
  const currentTokenRef = useRef<string | null>(token);
  currentTokenRef.current = token;

  const refresh = useCallback(async (): Promise<void> => {
    if (!token) {
      setSub(null);
      setLoading(false);
      return;
    }
    if (inFlightRef.current && inFlightRef.current.token === token) {
      return inFlightRef.current.promise;
    }
    const reqToken = token;
    const key = {};
    const promise = (async () => {
      try {
        const next = await getSubscriptionStatus(reqToken);
        if (currentTokenRef.current !== reqToken) return; // stale session
        setSub(next);
        setError(null);
        lastFetchRef.current = Date.now();
      } catch (e) {
        if (currentTokenRef.current !== reqToken) return;
        setError(e instanceof Error ? e : new Error(String(e)));
      } finally {
        if (currentTokenRef.current === reqToken) setLoading(false);
        if (inFlightRef.current && inFlightRef.current.key === key) {
          inFlightRef.current = null;
        }
      }
    })();
    inFlightRef.current = { token: reqToken, promise, key };
    return promise;
  }, [token]);

  const ensureFresh = useCallback(async (): Promise<void> => {
    if (!token) return;
    const age = Date.now() - lastFetchRef.current;
    if (sub && age < TTL_MS) return;
    return refresh();
  }, [token, sub, refresh]);

  // Initial fetch on mount and whenever the token changes (login or
  // logout). On logout (token becomes null) we clear sub so the next
  // login starts clean.
  useEffect(() => {
    // Any token change (logout, or a different account signing in) starts
    // from a clean slate; the previous session's status never lingers.
    setSub(null);
    setError(null);
    lastFetchRef.current = 0;
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    refresh();
  }, [token, refresh]);

  return (
    <SubscriptionContext.Provider
      value={{ sub, loading, error, refresh, ensureFresh }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription(): SubscriptionState {
  return useContext(SubscriptionContext);
}
