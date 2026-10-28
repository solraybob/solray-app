"use client";

import { forecastKind } from "@/lib/forecast-kind";
import { useEffect, useState } from "react";
import { apiFetch, ApiError, isAiConsentError, isUnderMinimumAgeError } from "@/lib/api";
import { storedBirthTimeCheck } from "@/lib/birth-time-fold";
import { isStaleAccountError } from "@/lib/account-session";
import { AI_CONSENT_CHANGED_EVENT } from "@/lib/ai-consent";
import { chartStampCurrent, chartWorkStamp, syncBirthRevision, writeChartCache } from "@/lib/chart-revision";
import { PLAIN_NOW_CARD_FOR_MEMBERS, type PlainNowCard } from "@/lib/now-card";
import { signalReadingShown } from "@/lib/native-push";
import { accountKey } from "@/lib/account-session";
import { parseForecastData, type ForecastView, localDayKey } from "../_lib/today-data";
import type { useTodayState } from "./useTodayState";

export function useTodayData(pageCtx: ReturnType<typeof useTodayState>) {
  const {
    backgroundFetchDone, chartRev, dateLocale, dayKey, deckBoxRef, forecast, lastFetchAt, loading,
    reloadNonce, router, seenChartRev, setBirthCheck, setBirthDate, setDayKey, setEmailVerified,
    setError, setForecast, setLoading, setReloadNonce, setVisibleSections, token
  } = pageCtx;
  // Tap an energy bar → seed a first-person question into chat and navigate.
  // Uses the same sessionStorage pattern as AskButton on the profile page.

  const today = new Date().toLocaleDateString(dateLocale, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  useEffect(() => {
    if (!token) return;

    // Cancellation flag for the in-flight fetches. If the user navigates
    // away from /today before a fetch completes, we DO NOT want a late
    // 403 to call router.replace and yank them off whichever page they
    // navigated to. Set on cleanup; checked before any setState/router
    // call inside fetchAndUpdate.
    let cancelled = false;

    // The birth chart changed since the reading on screen was fetched (an
    // edit in another tab, or noticed from another device): it is not shown
    // any longer, and the new chart's reading is fetched, in the foreground
    // unless the cache already holds one for the new chart.
    if (seenChartRev.current !== chartRev) {
      seenChartRev.current = chartRev;
      backgroundFetchDone.current = false;
      setForecast(null);
      setError("");
    }

    const cacheKey = accountKey(`solray_forecast_${dayKey}`);

    async function fetchAndUpdate(isBackground: boolean, retried = false) {
      lastFetchAt.current = Date.now();
      // The chart this forecast is fetched for. /users/me runs alongside
      // and may reveal that the birth details changed (on another device);
      // then this forecast may be for the old chart and is fetched again.
      const stamp = chartWorkStamp();
      try {
        // Run /forecast/today and /users/me in parallel
        const [forecastData] = await Promise.all([
          apiFetch("/forecast/today", {}, token, { quietConsent: true }),
          apiFetch("/users/me", {}, token).then((userData) => {
            if (cancelled) return;
            // Birth details changed (here or on another device): drop the
            // charts built from the old ones before anything is cached.
            syncBirthRevision(userData);
            // /users/me nests the birth date under profile.
            const bd = userData?.profile?.birth_date ?? userData?.birth_date;
            if (typeof bd === "string" && bd) setBirthDate(bd);
            if (typeof userData?.email_verified === "boolean") setEmailVerified(userData.email_verified);
            setBirthCheck(storedBirthTimeCheck(userData));
            if (userData.blueprint) {
              try {
                const bpCacheKey = accountKey("solray_blueprint");
                const existing = localStorage.getItem(bpCacheKey);
                const existingParsed = existing ? JSON.parse(existing) : null;
                if (!existingParsed || !existingParsed._cachedAt) {
                  localStorage.setItem(
                    bpCacheKey,
                    JSON.stringify({ ...userData.blueprint, _cachedAt: Date.now() })
                  );
                }
              } catch (_) {
                // ignore cache errors
              }
            }
          }).catch(() => {
            // /users/me failing shouldn't block forecast
          }),
        ]);

        if (cancelled) return;

        // Fetched for a chart that changed meanwhile: asked for once more,
        // and if it is still not for the current chart, a retryable
        // failure, never a reading of the old chart.
        if (!chartStampCurrent(stamp)) {
          if (!retried) return fetchAndUpdate(isBackground, true);
          setForecast(null);
          setError("today.error_no_sky");
          setLoading(false);
          return;
        }

        const parsed = parseForecastData(forecastData);

        // Cache for next load, but ONLY a complete forecast. Caching a
        // `_pending` / partial reading (e.g. during a backend outage) pins a
        // broken Today that survives reloads and silent background-refresh
        // failures. A pending state must always re-fetch fresh next time.
        // And only under the chart it was fetched for.
        try {
          if (forecastKind(parsed) === "complete") {
            writeChartCache(stamp, cacheKey, parsed);
          } else {
            localStorage.removeItem(cacheKey);
          }
        } catch (_) {
          // ignore storage errors
        }

        if (cancelled) return;
        if (!isBackground) {
          setForecast(parsed);
          setLoading(false);
        } else {
          setForecast(parsed);
        }
      } catch (err) {
        // If we've already left /today, do nothing, let whichever
        // page the user is now on handle its own auth/access state.
        if (cancelled) return;

        // The account changed mid-flight: this answer is not for this screen.
        if (isStaleAccountError(err)) return;
        // 403 because AI consent is missing: the consent sheet is already
        // open (lib/api). Not a billing problem, so no paywall redirect.
        if (isAiConsentError(err)) {
          if (!isBackground) {
            setForecast(null);
            setError("today.consent_needed");
            setLoading(false);
          }
          return;
        }
        // 403 because the account is under 16: the Oracle stays closed. A
        // gentle note, never the paywall; the rest of the app keeps working.
        if (isUnderMinimumAgeError(err)) {
          if (!isBackground) {
            setForecast(null);
            setError("oracle_errors.under_minimum_age");
            setLoading(false);
          }
          return;
        }
        // 403 = trial expired or subscription lapsed. Redirect from
        // both foreground AND background fetches; otherwise an expired
        // user reading from cache is stranded with no UI cue.
        if (err instanceof ApiError && err.status === 403) {
          router.replace("/subscribe");
          return;
        }
        // 401 = auth itself is bad. Kick them to /login even if they
        // were rendering from cache.
        if (err instanceof ApiError && err.status === 401) {
          router.replace("/login");
          return;
        }
        if (!isBackground) {
          // Honest failure state. The previous version of this code path
          // set forecast to a hardcoded MOCK_FORECAST containing invented
          // tags, energy levels, and a generic-Solray "reading." That is
          // exactly the kind of fictional content this product cannot
          // ship, since the user is paying for a personalised reading
          // grounded in their chart. On total fetch failure we now show
          // a real error and let the user retry.
          setForecast(null);
          setError("today.error_no_sky");
          setLoading(false);
        }
      }
    }

    // Try localStorage cache first, but only paint from it when the cached
    // reading is COMPLETE. A cached `_pending` / partial entry must never be
    // shown cache-first: fall through to a foreground fetch so a recovered
    // backend immediately replaces a stale broken state instead of being
    // masked by it.
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached) as ForecastView;
        if (forecastKind(parsed) === "complete") {
          setForecast(parsed);
          setLoading(false);
          // Still fetch fresh in background
          if (!backgroundFetchDone.current) {
            backgroundFetchDone.current = true;
            fetchAndUpdate(true);
          }
          return () => { cancelled = true; };
        }
        // Stale or pending cache: drop it and fetch fresh in foreground.
        localStorage.removeItem(cacheKey);
      }
    } catch (_) {
      // ignore parse errors
    }

    // No cache, fetch and show skeleton while loading
    setLoading(true);
    fetchAndUpdate(false);
    return () => { cancelled = true; };
  }, [token, dayKey, reloadNonce, chartRev]);

  // A new day, or back after a long while: refresh Now. Runs on native
  // resume, when the tab becomes visible again, on focus, and on a timer
  // set for the next local midnight while the screen stays open.
  useEffect(() => {
    if (!token) return;
    const check = () => {
      const k = localDayKey();
      if (k !== dayKey) {
        backgroundFetchDone.current = false;
        setDayKey(k);
        return;
      }
      // Same day, but the app sat in the background for a while: refresh
      // in place (no skeleton) so the reading is current.
      if (Date.now() - lastFetchAt.current > 30 * 60 * 1000) {
        lastFetchAt.current = Date.now();
        try { window.dispatchEvent(new CustomEvent("solray:refresh", { detail: {} })); } catch { /* ignore */ }
      }
    };
    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", check);
    let removeNative: (() => void) | null = null;
    let disposed = false;
    void (async () => {
      try {
        const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
        if (!cap?.isNativePlatform?.()) return;
        const { App } = await import("@capacitor/app");
        const h = await App.addListener("resume", check);
        if (disposed) { void h.remove(); return; }
        removeNative = () => { void h.remove(); };
      } catch { /* plugin unavailable: visibility and focus still cover it */ }
    })();
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5).getTime();
    const timer = window.setTimeout(check, Math.max(1000, nextMidnight - now.getTime()));
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", check);
      window.clearTimeout(timer);
      removeNative?.();
    };
  }, [token, dayKey]);

  useEffect(() => {
    const el = deckBoxRef.current;
    if (!el) return;
    const place = () => {
      const top = el.getBoundingClientRect().top + window.scrollY;
      el.style.setProperty("--today-above", `${Math.max(0, Math.round(top))}px`);
    };
    place();
    window.addEventListener("resize", place);
    let ro: ResizeObserver | null = null;
    try {
      ro = new ResizeObserver(place);
      ro.observe(document.body);
    } catch { /* no ResizeObserver: the resize listener still places it */ }
    return () => {
      window.removeEventListener("resize", place);
      ro?.disconnect();
    };
  }, [forecast, loading]);

  // Consent given in the sheet: fetch the reading that was refused.
  useEffect(() => {
    const onChanged = (e: Event) => {
      if ((e as CustomEvent).detail?.granted) setReloadNonce((n) => n + 1);
    };
    window.addEventListener(AI_CONSENT_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(AI_CONSENT_CHANGED_EVENT, onChanged);
  }, []);

  // Pull-to-refresh: refetch today's forecast in place. No loading skeleton,
  // existing content stays visible until the new data replaces it (so the
  // pull never blanks the screen), and we signal the gesture when settled.
  useEffect(() => {
    const onRefresh = (e: Event) => {
      const done = (e as CustomEvent).detail?.done as (() => void) | undefined;
      if (!token) { done?.(); return; }
      const cacheKey = accountKey(`solray_forecast_${localDayKey()}`);
      (async () => {
        try {
          const stamp = chartWorkStamp();
          const data = await apiFetch("/forecast/today", {}, token, { quietConsent: true });
          // The chart changed while refreshing: load again for the new one.
          if (!chartStampCurrent(stamp)) {
            setReloadNonce((n) => n + 1);
            return;
          }
          const parsed = parseForecastData(data);
          if (forecastKind(parsed) === "complete") writeChartCache(stamp, cacheKey, parsed);
          setForecast(parsed);
          setError("");
          setLoading(false);
        } catch (_) {
          // Keep whatever is on screen; a refresh must never blank it.
        } finally {
          done?.();
        }
      })();
    };
    window.addEventListener("solray:refresh", onRefresh);
    return () => window.removeEventListener("solray:refresh", onRefresh);
  }, [token]);

  // A complete reading is on screen: the push ask's value signal (native
  // shell only). Skeletons, errors and the preparing state never count.
  useEffect(() => {
    if (!loading && forecast && forecast._pending !== true) signalReadingShown();
  }, [forecast, loading]);

  // Plain-language Now card (Batch I). Off for members until
  // PLAIN_NOW_CARD_FOR_MEMBERS is switched on in lib/now-card.ts; while off
  // nothing is fetched and the card is exactly as before. With it on, the
  // plain words are fetched once the reading is on screen and replace the
  // card's title and opening only when they arrive whole.
  const [plainCard, setPlainCard] = useState<PlainNowCard | null>(null);
  const plainReading = forecast && forecast._pending !== true ? forecast.reading : null;
  useEffect(() => {
    setPlainCard(null);
    if (!PLAIN_NOW_CARD_FOR_MEMBERS || !token || !plainReading) return;
    let live = true;
    apiFetch("/forecast/today/plain", {}, token, { quietConsent: true })
      .then((p) => { if (live) setPlainCard(p as PlainNowCard); })
      .catch(() => { /* the card keeps today's words */ });
    return () => { live = false; };
  }, [token, plainReading, chartRev]);

  // Staggered section reveal
  useEffect(() => {
    if (!forecast) return;
    const timings = [0, 100, 400, 700, 900];
    timings.forEach((delay, index) => {
      setTimeout(() => setVisibleSections(index + 1), delay);
    });
  }, [forecast]);

  return { plainCard, today };
}
