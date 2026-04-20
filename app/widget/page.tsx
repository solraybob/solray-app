"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";

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
function getMoonPhase(): { phase: number; label: string; emoji: string } {
  const now = new Date();
  const jd = (now.getTime() / 86400000) + 2440587.5;
  const lunarCycle = 29.53058867;
  const knownNewMoon = 2451549.5;
  let phase = ((jd - knownNewMoon) % lunarCycle) / lunarCycle;
  if (phase < 0) phase += 1;

  const getMoonPhaseLabel = (p: number): string => {
    if (p < 0.03 || p > 0.97) return "New Moon";
    if (p < 0.25) return "Waxing Crescent";
    if (p < 0.27) return "First Quarter";
    if (p < 0.48) return "Waxing Gibbous";
    if (p < 0.52) return "Full Moon";
    if (p < 0.73) return "Waning Gibbous";
    if (p < 0.77) return "Third Quarter";
    return "Waning Crescent";
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
    label: getMoonPhaseLabel(phase),
    emoji: getMoonEmoji(phase),
  };
}

export default function WidgetPage() {
  const [forecast, setForecast] = useState<ForecastData | null>(null);
  const [loading, setLoading] = useState(true);
  const { token } = useAuth();

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    async function fetchForecast() {
      try {
        const dateKey = new Date().toISOString().split("T")[0];
        const cacheKey = `solray_forecast_${dateKey}`;

        // Try cache first
        try {
          const cached = localStorage.getItem(cacheKey);
          if (cached) {
            const parsed: ForecastData = JSON.parse(cached);
            setForecast(parsed);
            setLoading(false);
            return;
          }
        } catch (_) {
          // ignore cache errors
        }

        // Fetch from API
        const data = await apiFetch("/forecast/today", {}, token);
        setForecast(data);
        setLoading(false);

        // Cache for next load
        try {
          localStorage.setItem(cacheKey, JSON.stringify(data));
        } catch (_) {
          // ignore storage errors
        }
      } catch {
        setLoading(false);
      }
    }

    fetchForecast();
  }, [token]);

  const moonPhase = getMoonPhase();

  if (!loading && !forecast) {
    return (
      <div
        className="flex items-center justify-center min-h-screen"
        style={{ backgroundColor: "#050f08" }}
      >
        <p className="text-text-secondary text-xs text-center px-4">
          Unable to load forecast. Please check your connection.
        </p>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col justify-between p-4"
      style={{ backgroundColor: "#050f08", fontFamily: '"Cormorant Garamond", serif' }}
    >
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-amber-sun/30 border-t-amber-sun rounded-full animate-spin" />
        </div>
      ) : forecast ? (
        <>
          {/* Top: Day Title */}
          <div className="flex-1 flex flex-col justify-center pt-8">
            <h1
              className="text-center leading-snug px-3"
              style={{
                fontSize: "16px",
                fontStyle: "italic",
                fontWeight: 300,
                color: "#c4a062",
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
                  fontSize: "10px",
                  color: "#a8a8a8",
                  fontFamily: "system-ui, -apple-system",
                }}
              >
                {moonPhase.label}
              </span>
            </div>

            {/* Branding */}
            <span
              style={{
                fontSize: "8px",
                color: "#6b6b6b",
                letterSpacing: "0.05em",
                fontFamily: "system-ui, -apple-system",
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
