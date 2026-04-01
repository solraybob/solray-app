"use client";

import { useEffect, useState, useRef } from "react";
import Image from "next/image";
import ProtectedRoute from "@/components/ProtectedRoute";
import BottomNav from "@/components/BottomNav";
import CurrentCycles from "@/components/CurrentCycles";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";
import LunarPhaseCard from "@/components/LunarPhaseCard";

interface Planet {
  name: string;
  symbol: string;
  sign: string;
  degree: string;
  retrograde?: boolean;
}

interface EnergyLevels {
  mental: number;
  emotional: number;
  physical: number;
  intuitive: number;
}

interface LunarEvent {
  type: "New Moon" | "Full Moon";
  sign: string;
  degree: number;
  house: number;
  house_meaning: string;
  date: string;
  days_until: number;
  is_today: boolean;
  note: string;
}

interface ForecastData {
  day_title: string;
  reading: string;
  tags: {
    astrology: string;
    human_design: string;
    gene_keys: string;
  };
  energy: EnergyLevels;
  planets: Planet[];
  morning_greeting?: string;
  lunar_event?: LunarEvent;
}

const MOCK_FORECAST: ForecastData = {
  day_title: "Let the wave pass before you decide",
  reading:
    "The cosmos invites a softening today. You are not behind. You are being prepared. There is momentum building beneath the surface, and your awareness of it is the catalyst. Trust the timing that arrives without forcing. What unfolds in stillness carries far more weight than what is seized in urgency.",
  tags: {
    astrology: "Venus trine Neptune",
    human_design: "Gate 57. Intuition",
    gene_keys: "Gift of Clarity",
  },
  energy: {
    mental: 6,
    emotional: 8,
    physical: 5,
    intuitive: 9,
  },
  planets: [
    { name: "Sun", symbol: "☉", sign: "Pisces", degree: "29°", retrograde: false },
    { name: "Moon", symbol: "☽", sign: "Scorpio", degree: "14°", retrograde: false },
    { name: "Mercury", symbol: "☿", sign: "Aries", degree: "3°", retrograde: false },
    { name: "Venus", symbol: "♀", sign: "Aquarius", degree: "22°", retrograde: false },
    { name: "Mars", symbol: "♂", sign: "Cancer", degree: "7°", retrograde: false },
    { name: "Jupiter", symbol: "♃", sign: "Gemini", degree: "18°", retrograde: false },
    { name: "Saturn", symbol: "♄", sign: "Pisces", degree: "13°", retrograde: false },
    { name: "Uranus", symbol: "♅", sign: "Taurus", degree: "24°", retrograde: false },
    { name: "Neptune", symbol: "♆", sign: "Pisces", degree: "27°", retrograde: false },
    { name: "Pluto", symbol: "♇", sign: "Aquarius", degree: "1°", retrograde: false },
  ],
  morning_greeting: "Good morning. The day opens gently. I am here.",
};

// Dynamic energy note based on value and dimension
function getEnergyNote(label: string, value: number): string {
  const key = label.toLowerCase() as "mental" | "emotional" | "physical" | "intuitive";
  const notes: Record<typeof key, [string, string, string]> = {
    mental: [
      "Low mental clarity. Slow down decisions.",
      "Moderate focus. Work in shorter bursts.",
      "Sharp and focused. Ideal for complex thinking.",
    ],
    emotional: [
      "Emotionally tender. Protect your energy.",
      "Steady. You can handle most things.",
      "Emotionally open. Connection flows easily.",
    ],
    physical: [
      "Low vitality. Rest is productive today.",
      "Average energy. Pace yourself.",
      "Strong physical energy. Move your body.",
    ],
    intuitive: [
      "Intuition quiet. Rely on facts and plans.",
      "Gut feeling available. Listen carefully.",
      "Intuition heightened. Trust your instincts.",
    ],
  };
  const bucket = notes[key] ?? notes.mental;
  if (value <= 4) return bucket[0];
  if (value <= 7) return bucket[1];
  return bucket[2];
}

function EnergyBar({
  label,
  value,
  animate,
}: {
  label: string;
  value: number;
  animate: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-text-secondary text-xs font-body w-20 shrink-0 tracking-wider uppercase">
        {label}
      </span>
      <div className="flex-1 h-1.5 bg-forest-border rounded-full overflow-hidden">
        <div
          className="h-full bg-amber-sun rounded-full transition-all duration-1000"
          style={{ width: animate ? `${value * 10}%` : "0%" }}
        />
      </div>
      <span className="text-text-secondary text-xs font-body w-4 text-right">{value}</span>
    </div>
  );
}

// Planet card for the cosmic ticker strip
function PlanetCard({ planet }: { planet: Planet }) {
  return (
    <div className="flex flex-col items-center bg-forest-card/60 border border-forest-border/60 rounded-2xl px-3 py-3 min-w-[76px] shrink-0 gap-0.5">
      <div className="flex items-center gap-1">
        <span className="text-2xl leading-none" style={{ opacity: 0.85 }}>
          {planet.symbol}
        </span>
        {planet.retrograde && (
          <span className="text-amber-sun/80 text-[10px] font-body leading-none mt-0.5">℞</span>
        )}
      </div>
      <span className="text-text-secondary/60 text-[9px] font-body tracking-widest uppercase mt-0.5">
        {planet.name}
      </span>
      <span className="text-text-primary/90 text-xs font-body font-medium">
        {planet.sign}
      </span>
      <span className="text-text-secondary/50 text-[10px] font-body">{planet.degree}</span>
    </div>
  );
}

// Skeleton components for instant perceived loading
function SkeletonToday() {
  return (
    <div className="max-w-lg mx-auto px-5">
      {/* Hero title skeleton */}
      <div className="pt-12 pb-10">
        <div className="skeleton-shimmer h-14 w-4/5 rounded-lg mb-3" />
        <div className="skeleton-shimmer h-14 w-2/3 rounded-lg" />
      </div>

      {/* Energy bars skeleton */}
      <div className="mb-8 space-y-4">
        {["Mental", "Emotional", "Physical", "Intuitive"].map((label) => (
          <div key={label} className="flex items-center gap-3">
            <span className="text-text-secondary text-xs font-body w-20 shrink-0 tracking-wider uppercase opacity-40">
              {label}
            </span>
            <div className="flex-1 h-1.5 bg-forest-border rounded-full overflow-hidden">
              <div className="h-full w-0 bg-amber-sun rounded-full" />
            </div>
            <span className="text-text-secondary text-xs font-body w-4 text-right opacity-0">0</span>
          </div>
        ))}
      </div>

      {/* Cycles skeleton */}
      <div className="skeleton-shimmer h-32 w-full rounded-2xl mb-10" />

      {/* Divider */}
      <div className="border-t border-forest-border/40 mb-8" />

      {/* Reading skeleton — 4 lines */}
      <div className="pb-8 space-y-3">
        <div className="skeleton-shimmer h-4 w-full rounded" />
        <div className="skeleton-shimmer h-4 w-full rounded" />
        <div className="skeleton-shimmer h-4 w-5/6 rounded" />
        <div className="skeleton-shimmer h-4 w-3/4 rounded" />
      </div>

      {/* Tags skeleton */}
      <div className="flex flex-wrap gap-2 mb-10">
        <div className="skeleton-shimmer h-7 w-32 rounded-full" />
        <div className="skeleton-shimmer h-7 w-28 rounded-full" />
        <div className="skeleton-shimmer h-7 w-24 rounded-full" />
      </div>

      {/* Planet strip skeleton */}
      <div className="mb-6">
        <div className="skeleton-shimmer h-3 w-16 rounded mb-3" />
        <div className="flex gap-2.5 overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton-shimmer min-w-[76px] h-[90px] rounded-2xl" />
          ))}
        </div>
      </div>
    </div>
  );
}

// Parse raw forecast API response into ForecastData
function parseForecastData(data: any): ForecastData {
  if (data.day_title && data.reading && data.tags && data.energy) {
    const planets: Planet[] =
      data.planets ||
      Object.entries(data.transits || {}).map(([name, p]: [string, any]) => ({
        name,
        symbol: {
          Sun: "☉",
          Moon: "☽",
          Mercury: "☿",
          Venus: "♀",
          Mars: "♂",
          Jupiter: "♃",
          Saturn: "♄",
          Uranus: "♅",
          Neptune: "♆",
          Pluto: "♇",
        }[name] || "✦",
        sign: p.sign,
        degree: `${Math.floor(p.degree)}°`,
        retrograde: p.retrograde,
      }));
    // Pass through lunar_event if present
    return { ...data, planets, lunar_event: data.lunar_event ?? undefined };
  } else {
    // AI not ready yet, show mock with real planet positions
    const planets: Planet[] = Object.entries(data.transits || {})
      .slice(0, 10)
      .map(([name, p]: [string, any]) => ({
        name,
        symbol: {
          Sun: "☉",
          Moon: "☽",
          Mercury: "☿",
          Venus: "♀",
          Mars: "♂",
          Jupiter: "♃",
          Saturn: "♄",
          Uranus: "♅",
          Neptune: "♆",
          Pluto: "♇",
        }[name] || "✦",
        sign: p.sign,
        degree: `${Math.floor(p.degree)}°`,
        retrograde: p.retrograde,
      }));
    return {
      ...MOCK_FORECAST,
      planets: planets.length > 0 ? planets : MOCK_FORECAST.planets,
    };
  }
}

export default function TodayPage() {
  const [forecast, setForecast] = useState<ForecastData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [barsAnimated, setBarsAnimated] = useState(false);
  const [visibleSections, setVisibleSections] = useState(0);
  const { token } = useAuth();
  const backgroundFetchDone = useRef(false);

  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  useEffect(() => {
    if (!token) return;

    const dateKey = new Date().toISOString().split("T")[0];
    const cacheKey = `solray_forecast_${dateKey}`;

    async function fetchAndUpdate(isBackground: boolean) {
      try {
        // Fix 2: Run /forecast/today and /users/me in parallel
        const [forecastData] = await Promise.all([
          apiFetch("/forecast/today", {}, token),
          // prefetch user data in parallel (used by other screens)
          apiFetch("/users/me", {}, token).then((userData) => {
            if (userData.blueprint) {
              // Cache blueprint for chart screen
              try {
                const bpCacheKey = "solray_blueprint";
                const existing = localStorage.getItem(bpCacheKey);
                const existingParsed = existing ? JSON.parse(existing) : null;
                // Only update if newer or missing
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

        const parsed = parseForecastData(forecastData);

        // Cache for next load
        try {
          localStorage.setItem(cacheKey, JSON.stringify(parsed));
        } catch (_) {
          // ignore storage errors
        }

        if (!isBackground) {
          setForecast(parsed);
          setLoading(false);
        } else {
          // Background refresh — update silently if different
          setForecast(parsed);
        }
      } catch {
        if (!isBackground) {
          setForecast(MOCK_FORECAST);
          setError("Showing cached reading. Reconnect to see today's live forecast.");
          setLoading(false);
        }
      }
    }

    // Fix 3: Try localStorage cache first
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed: ForecastData = JSON.parse(cached);
        setForecast(parsed);
        setLoading(false);
        // Still fetch fresh in background
        if (!backgroundFetchDone.current) {
          backgroundFetchDone.current = true;
          fetchAndUpdate(true);
        }
        return;
      }
    } catch (_) {
      // ignore parse errors
    }

    // No cache — fetch and show skeleton while loading
    fetchAndUpdate(false);
  }, [token]);

  // Staggered section reveal
  useEffect(() => {
    if (!forecast) return;
    const timings = [0, 100, 400, 700, 900];
    timings.forEach((delay, index) => {
      setTimeout(() => setVisibleSections(index + 1), delay);
    });
    setTimeout(() => setBarsAnimated(true), 300);
  }, [forecast]);

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-forest-deep pb-24">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-forest-deep/90 backdrop-blur-sm border-b border-forest-border/50">
          <div className="max-w-lg mx-auto px-5 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full overflow-hidden">
                <Image
                  src="/logo.jpg"
                  alt="Solray"
                  width={28}
                  height={28}
                  className="w-full h-full object-cover"
                />
              </div>
              <span className="font-heading text-xs tracking-[0.2em] uppercase text-text-secondary">
                Solray AI
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-text-secondary text-xs font-body">{today}</span>
            </div>
          </div>
        </div>

        {loading ? (
          // Fix 1: Beautiful skeleton instead of spinner
          <SkeletonToday />
        ) : forecast ? (
          <div className="max-w-lg mx-auto px-5">
            {/* Subtle offline/error notice */}
            {error && (
              <div className="mt-4 px-3 py-2 rounded-lg border border-forest-border/40 bg-forest-card/30">
                <p className="text-text-secondary/60 text-[10px] font-body text-center">{error}</p>
              </div>
            )}

            {/* LUNAR PHASE ALERT — shown when within 3-day window */}
            {forecast.lunar_event && (
              <div
                className="pt-6 transition-all duration-700"
                style={{
                  opacity: visibleSections >= 1 ? 1 : 0,
                  transform: visibleSections >= 1 ? "translateY(0)" : "translateY(12px)",
                }}
              >
                <LunarPhaseCard event={forecast.lunar_event} />
              </div>
            )}

            {/* HERO: Day Title */}
            <div
              className="pt-12 pb-10 transition-all duration-700"
              style={{
                opacity: visibleSections >= 1 ? 1 : 0,
                transform: visibleSections >= 1 ? "translateY(0)" : "translateY(12px)",
              }}
            >
              <h1
                className="font-heading text-5xl leading-[1.15] text-text-primary"
                style={{ fontWeight: 300, fontStyle: "italic", letterSpacing: "-0.01em" }}
              >
                {forecast.day_title}
              </h1>
            </div>

            {/* ENERGY BARS */}
            <div
              className="mb-8 transition-all duration-700"
              style={{
                opacity: visibleSections >= 2 ? 1 : 0,
                transform: visibleSections >= 2 ? "translateY(0)" : "translateY(12px)",
              }}
            >
              <div className="space-y-4">
                <EnergyBar label="Mental" value={forecast.energy.mental} animate={barsAnimated} />
                <EnergyBar label="Emotional" value={forecast.energy.emotional} animate={barsAnimated} />
                <EnergyBar label="Physical" value={forecast.energy.physical} animate={barsAnimated} />
                <EnergyBar label="Intuitive" value={forecast.energy.intuitive} animate={barsAnimated} />
              </div>
            </div>

            {/* CURRENT CYCLES */}
            <div
              className="mb-10 transition-all duration-700"
              style={{
                opacity: visibleSections >= 3 ? 1 : 0,
                transform: visibleSections >= 3 ? "translateY(0)" : "translateY(8px)",
              }}
            >
              <CurrentCycles token={token} />
            </div>

            {/* Divider */}
            <div
              className="transition-all duration-500"
              style={{ opacity: visibleSections >= 4 ? 1 : 0 }}
            >
              <div className="border-t border-forest-border/40 mb-8" />
            </div>

            {/* DIVIDER + TODAY'S READING LABEL */}
            <div
              className="flex items-center gap-3 mb-6 transition-all duration-700"
              style={{
                opacity: visibleSections >= 4 ? 1 : 0,
                transform: visibleSections >= 4 ? "translateY(0)" : "translateY(12px)",
              }}
            >
              <div className="flex-1 h-px" style={{ background: "rgba(26,48,32,1)" }} />
              <p className="font-body text-text-secondary/50 uppercase tracking-widest" style={{ fontSize: "0.65rem" }}>
                Today&apos;s Weather
              </p>
              <div className="flex-1 h-px" style={{ background: "rgba(26,48,32,1)" }} />
            </div>

            {/* READING */}
            <div
              className="pb-8 transition-all duration-700"
              style={{
                opacity: visibleSections >= 4 ? 1 : 0,
                transform: visibleSections >= 4 ? "translateY(0)" : "translateY(12px)",
              }}
            >
              {forecast.reading.split(/\n\n+/).map((para, i) => (
                <p
                  key={i}
                  className={`font-body text-text-secondary text-base leading-[1.85] ${i > 0 ? "mt-5" : ""}`}
                >
                  {para.trim()}
                </p>
              ))}
            </div>

            {/* TAGS */}
            <div
              className="flex flex-wrap gap-2 mb-10 transition-all duration-700"
              style={{
                opacity: visibleSections >= 4 ? 1 : 0,
                transform: visibleSections >= 4 ? "translateY(0)" : "translateY(8px)",
              }}
            >
              <Tag>{forecast.tags.astrology}</Tag>
              <Tag>{forecast.tags.human_design}</Tag>
              <Tag>{forecast.tags.gene_keys}</Tag>
            </div>

            {/* PLANET STRIP — live cosmic ticker */}
            <div
              className="mb-6 transition-all duration-700"
              style={{
                opacity: visibleSections >= 5 ? 1 : 0,
                transform: visibleSections >= 5 ? "translateY(0)" : "translateY(8px)",
              }}
            >
              <p className="text-text-secondary/40 text-[9px] font-body tracking-[0.25em] uppercase mb-3">
                Sky Now
              </p>
              {/* Scrollable ticker */}
              <div
                className="-mx-5 px-5 overflow-x-auto"
                style={{ WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}
              >
                <div className="flex gap-2.5 pb-3" style={{ width: "max-content" }}>
                  {forecast.planets.map((planet) => (
                    <PlanetCard key={planet.name} planet={planet} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="max-w-lg mx-auto px-5 pt-24 text-center">
            <p className="text-text-secondary font-body text-sm leading-relaxed">
              Unable to load today&apos;s forecast. Please check your connection and refresh.
            </p>
          </div>
        )}

        <BottomNav />
      </div>
    </ProtectedRoute>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-3 py-1.5 rounded-full border border-forest-border/60 text-text-secondary/70 text-xs font-body tracking-wide">
      {children}
    </span>
  );
}
