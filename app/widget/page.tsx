"use client";

import { useChartRevision } from "@/lib/use-chart-revision";
import { chartWorkStamp, syncBirthRevision, writeChartCache } from "@/lib/chart-revision";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { apiFetch, isAiConsentError } from "@/lib/api";
import { accountKey, isStaleAccountError } from "@/lib/account-session";
import { AI_CONSENT_CHANGED_EVENT } from "@/lib/ai-consent";
import { forecastKind, localDayKey } from "@/lib/forecast-kind";
import { useT } from "@/lib/i18n";

interface ForecastData {
  day_title: string;
  reading: string;
  energy: {
    mental: number;
    emotional: number;
    physical: number;
    intuitive: number;
  };
  planets: Array<{
    name: string;
    symbol: string;
    sign: string;
    degree: string;
    retrograde?: boolean;
  }>;
  tags: {
    astrology: string;
    human_design: string;
    gene_keys: string;
  };
}

// Moon phase calculation helpers. The lunar glyphs are the single
// documented exception to Solray's no-emoji rule, see the note on
// MoonCycleBar in app/today/page.tsx.
function getMoonPhase(): { phase: number; labelKey: string; emoji: string } {
  const now = new Date();
  const jd = (now.getTime() / 86400000) + 2440587.5;
  const lunarCycle = 29.53058867;
  const knownNewMoon = 2451549.5;
  let phase = ((jd - knownNewMoon) % lunarCycle) / lunarCycle;
  if (phase < 0) phase += 1;

  // Translation keys (moon.phase_*), worded in the member's language.
  const getMoonPhaseLabel = (p: number): string => {
    if (p < 0.03 || p > 0.97) return "moon.phase_new_moon";
    if (p < 0.25) return "moon.phase_waxing_crescent";
    if (p < 0.27) return "moon.phase_first_quarter";
    if (p < 0.48) return "moon.phase_waxing_gibbous";
    if (p < 0.52) return "moon.phase_full_moon";
    if (p < 0.73) return "moon.phase_waning_gibbous";
    if (p < 0.77) return "moon.phase_third_quarter";
    return "moon.phase_waning_crescent";
  };

  const getMoonEmoji = (p: number): string => {
    if (p < 0.03 || p > 0.97) return "\u{1F311}";
    if (p < 0.25) return "\u{1F312}";
    if (p < 0.27) return "\u{1F313}";
    if (p < 0.48) return "\u{1F314}";
    if (p < 0.52) return "\u{1F315}";
    if (p < 0.73) return "\u{1F316}";
    if (p < 0.77) return "\u{1F317}";
    return "\u{1F318}";
  };

  return {
    phase,
    labelKey: getMoonPhaseLabel(phase),
    emoji: getMoonEmoji(phase),
  };
}

export default function WidgetPage() {
  const [forecast, setForecast] = useState<ForecastData | null>(null);
  const [loading, setLoading] = useState(true);
  const { token } = useAuth();
  const { t } = useT();
  // A birth correction (here or in another tab) replaces the reading: the
  // old one leaves the screen and an answer for the old chart never lands.
  const chartRev = useChartRevision();
  const shownRevRef = useRef(chartRev);

  // What the widget shows besides the reading (lib/forecast-kind, the same
  // reading of an answer as Today's): the sky without a reading for a
  // member who has not agreed to AI processing, a reading not written yet,
  // or a failure. Only a complete reading is shown as one, or cached.
  const [state, setState] = useState<"loading" | "complete" | "consent" | "pending" | "failed">("loading");
  // The day the reading is for. It moves on at local midnight, and on
  // waking from suspension or coming back into view on a later day, as on
  // Today (Codex out21-5 #2).
  const [dayKey, setDayKey] = useState(() => localDayKey());
  const shownDayRef = useRef(dayKey);
  useEffect(() => {
    const check = () => {
      const k = localDayKey();
      setDayKey((cur) => (cur === k ? cur : k));
    };
    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", check);
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5).getTime();
    const timer = window.setTimeout(check, Math.max(1000, nextMidnight - now.getTime()));
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", check);
      window.clearTimeout(timer);
    };
  }, [dayKey]);
  // Agreed in the consent sheet (in the app): ask again for the reading.
  const [consentNonce, setConsentNonce] = useState(0);
  useEffect(() => {
    const onChanged = (e: Event) => {
      if ((e as CustomEvent).detail?.granted) setConsentNonce((n) => n + 1);
    };
    window.addEventListener(AI_CONSENT_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(AI_CONSENT_CHANGED_EVENT, onChanged);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (shownRevRef.current !== chartRev || shownDayRef.current !== dayKey) {
      // Another chart or another day: yesterday's (or the old chart's)
      // reading leaves the screen.
      shownRevRef.current = chartRev;
      shownDayRef.current = dayKey;
      setForecast(null);
      setLoading(true);
      setState("loading");
    }
    if (!token) {
      setLoading(false);
      setState("failed");
      return;
    }
    const show = (kind: "complete" | "consent" | "pending" | "failed", data: ForecastData | null) => {
      if (cancelled) return;
      setForecast(kind === "complete" ? data : null);
      setState(kind);
      setLoading(false);
    };

    async function fetchForecast() {
      // The local day (lib/forecast-kind localDayKey): the backend resolves
      // "today" by the member's local date, and so does the cache key.
      const cacheKey = accountKey(`solray_forecast_${dayKey}`);
      // Whether the chart behind the caches is still the member's current
      // one: a birth correction on another device is only learnt from
      // /users/me. On a change the caches are dropped and the chart
      // revision moves on, which loads this screen again (Codex out21-5 #1).
      const chartStillCurrent = async (): Promise<boolean> => {
        try {
          const me = await apiFetch("/users/me", {}, token);
          if (cancelled) return false;
          return !syncBirthRevision(me);
        } catch (e) {
          if (isStaleAccountError(e)) return false;
          return true;   // offline: what is cached stays
        }
      };

      // Cache first, but only a COMPLETE reading. Anything else (a pending
      // or partial entry, a sky without a reading) is dropped and fetched
      // again, so a recovered backend or a fresh consent replaces it.
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (forecastKind(parsed) === "complete") {
            // Shown at once, then checked against the current chart; on a
            // change it is replaced (the reload clears it).
            show("complete", parsed as ForecastData);
            void chartStillCurrent();
            return;
          }
          localStorage.removeItem(cacheKey);
        }
      } catch (_) {
        // ignore cache errors
      }

      try {
        const stamp = chartWorkStamp();
        // The reading and the chart check together: a reading for a chart
        // corrected elsewhere is never shown or cached (the check drops the
        // caches and moves the revision on, which loads this screen again).
        const [data, current] = await Promise.all([
          apiFetch("/forecast/today", {}, token, { quietConsent: true }),
          chartStillCurrent(),
        ]);
        if (cancelled || !current) return;
        const kind = forecastKind(data);
        show(kind, kind === "complete" ? data as ForecastData : null);
        // Cached only when complete, and only under the chart it was
        // fetched for.
        if (kind === "complete") writeChartCache(stamp, cacheKey, data);
      } catch (e) {
        if (isStaleAccountError(e)) return;
        // Not agreed to AI processing: said so, never as a failure.
        show(isAiConsentError(e) ? "consent" : "failed", null);
      }
    }

    fetchForecast();
    return () => { cancelled = true; };
  }, [token, chartRev, consentNonce, dayKey]);

  const moonPhase = getMoonPhase();

  if (!loading && !forecast) {
    const note = state === "consent" ? t("widget.consent_needed")
      : state === "pending" ? t("widget.pending")
      : t("widget.load_failed");
    return (
      <div
        className="flex items-center justify-center min-h-screen"
        style={{ backgroundColor: "var(--bg-deep)" }}
      >
        <p className="text-text-secondary text-xs text-center px-4">
          {note}
        </p>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col justify-between p-4"
      style={{ backgroundColor: "var(--bg-deep)", fontFamily: 'var(--font-heading), "Zen Kaku Gothic New", system-ui, sans-serif' }}
    >
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-6 h-6 rounded-full animate-spin" style={{ border: "2px solid rgb(var(--rgb-border))", borderTopColor: "rgb(var(--rgb-text-primary))" }} />
        </div>
      ) : forecast ? (
        <>
          {/* Top: Day Title */}
          <div className="flex-1 flex flex-col justify-center pt-8">
            <h1
              className="text-center leading-snug px-3"
              style={{
                fontSize: "18px",
                fontWeight: 700,
                letterSpacing: "-.02em",
                color: "rgb(var(--rgb-text-primary))",
                lineHeight: "1.4",
                overflow: "hidden",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
              }}
            >
              {forecast.day_title}
            </h1>
          </div>

          {/* Bottom: Moon phase + branding */}
          <div className="flex items-end justify-between pb-4">
            {/* Moon phase */}
            <div className="flex items-center gap-2">
              <span style={{ fontSize: "18px" }}>{moonPhase.emoji}</span>
              <span
                style={{
                  fontSize: "15px",
                  fontWeight: 500,
                  color: "rgb(var(--rgb-text-secondary))",
                }}
              >
                {t(moonPhase.labelKey)}
              </span>
            </div>

            {/* Branding */}
            <span
              style={{
                fontSize: "14px",
                fontWeight: 700,
                color: "rgb(var(--rgb-text-muted))",
                letterSpacing: "0.18em",
                textTransform: "uppercase",
              }}
            >
              solray.ai
            </span>
          </div>
        </>
      ) : null}
    </div>
  );
}
