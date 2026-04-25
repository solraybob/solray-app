"use client";

import { useEffect, useState, useRef } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import CurrentCycles from "@/components/CurrentCycles";
import { useAuth } from "@/lib/auth-context";
import { apiFetch, ApiError } from "@/lib/api";
import LunarPhaseCard from "@/components/LunarPhaseCard";
import DepthSlides from "@/components/DepthSlides";

// Planet to hero image mapping
const PLANET_HERO_IMAGES: Record<string, string> = {
  // All verified sky/space/atmosphere images
  sun: "https://images.unsplash.com/photo-1534088568595-a066f410bcda?w=800&q=80",   // dramatic storm clouds, warm light
  moon: "https://images.unsplash.com/photo-1532693322450-2cb5c511067d?w=800&q=80",  // full moon night sky
  mercury: "https://images.unsplash.com/photo-1537420327992-d6e192287183?w=800&q=80", // lightning storm sky
  venus: "https://images.unsplash.com/photo-1534088568595-a066f410bcda?w=800&q=80&sat=-20&con=20", // same storm clouds, cooler
  mars: "https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=800&q=80",   // epic thunderhead clouds
  jupiter: "https://images.unsplash.com/photo-1534088568595-a066f410bcda?w=800&q=80", // towering storm clouds
  saturn: "https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=800&q=80",  // milky way, cold
  uranus: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800&q=80",  // deep space blue
  neptune: "https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=800&q=80", // dark star field
  pluto: "https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=800&q=80",   // milky way cosmos
  default: "https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=800&q=80", // star field
};

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

interface TagDetails {
  astrology: string;
  human_design: string;
  gene_keys: string;
}

interface ForecastData {
  day_title: string;
  reading: string;
  tags: {
    astrology: string;
    human_design: string;
    gene_keys: string;
  };
  tag_details?: TagDetails;
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

// Extract dominant planet from astrology tag string
function getDominantPlanet(astrologyTag: string): string {
  const planetNames = ["sun", "moon", "mars", "jupiter", "saturn", "mercury", "venus", "uranus", "neptune", "pluto"];
  const lowercaseTag = astrologyTag.toLowerCase();
  for (const planet of planetNames) {
    if (lowercaseTag.includes(planet)) {
      return planet;
    }
  }
  return "sun"; // default
}

// Get hero image URL for dominant planet
function getHeroImageUrl(astrologyTag: string): string {
  const planet = getDominantPlanet(astrologyTag);
  return PLANET_HERO_IMAGES[planet] || PLANET_HERO_IMAGES.default;
}

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

// Extended palette — aged pigments. Label stays in text.secondary;
// color does the categorizing, not the type.
const ENERGY_COLORS: Record<string, string> = {
  Mental:    "#9babb9", // mist
  Emotional: "#d47a52", // ember
  Physical:  "#8a9e66", // moss
  Intuitive: "#9b86a0", // wisteria
};

// Prompts seeded into chat when a bar is tapped. Phrased as the user
// asking their Higher Self — keeps the question in first-person voice.
const ENERGY_PROMPTS: Record<string, (pct: number) => string> = {
  Mental:    (p) => `My mental energy is at ${p}% today. What's shaping it, and how should I work with it?`,
  Emotional: (p) => `My emotional energy is at ${p}% today. What's underneath this, and what does it need from me?`,
  Physical:  (p) => `My physical energy is at ${p}% today. How should I move, rest, or pace myself?`,
  Intuitive: (p) => `My intuitive energy is at ${p}% today. What is my gut trying to tell me I'm not listening to?`,
};

// Display-layer transform: remap raw 0-10 readings onto a 50-95 visual range.
// The backend's scale is relative, not absolute — a "4 out of 10" is a quiet
// day, not a broken one, so the visual floor sits at 50% not 0%. Relative
// differences are preserved (a 9 is still visibly higher than a 4). When the
// forecast engine gets recalibrated we just delete this function.
function toDisplayPct(value: number): number {
  const clamped = Math.max(0, Math.min(10, value));
  return Math.round(50 + (clamped / 10) * 45);
}

function EnergyBar({
  label,
  value,
  delayMs,
  onAsk,
}: {
  label: string;
  value: number;
  delayMs: number;
  onAsk: (label: string, pct: number) => void;
}) {
  const color = ENERGY_COLORS[label] || "#f39230";
  const pct = toDisplayPct(value);

  // Animation is driven by pure CSS @keyframes (see globals.css), not React
  // state. The fill div gets `--pct` as a CSS variable; the keyframe
  // animates width from 0 → var(--pct). Width-based (not transform-based)
  // draw, because transform scaleX was too subtle / getting coalesced away
  // somewhere in the iOS Safari paint pipeline on cached loads. Width is
  // less performant but unambiguous.
  //
  // Two-phase arrival: label row fades in first (all rows together, no
  // per-row stagger), then the line ink-draws from left with a soft-decel
  // curve, staggered per row by delayMs.
  const labelFadeMs = 400;
  const drawMs      = 900;
  const drawDelay   = 300 + delayMs;

  return (
    <button
      type="button"
      onClick={() => onAsk(label, pct)}
      aria-label={`Ask your Higher Self about your ${label.toLowerCase()} energy at ${pct} percent`}
      className="group block w-full text-left focus:outline-none focus-visible:ring-1 focus-visible:ring-amber-sun/40 rounded-sm"
    >
      {/* Label row — fades in as a unit, no per-row stagger here. */}
      <div
        className="flex items-baseline justify-between mb-2"
        style={{
          animation: `solrayLabelFade ${labelFadeMs}ms cubic-bezier(0.22, 0.8, 0.36, 1) both`,
        }}
      >
        <span className="font-body text-[10px] font-normal tracking-[0.22em] uppercase text-text-secondary">
          {label}
        </span>
        <span
          className="font-heading text-[15px] text-text-secondary/70"
          style={{ fontFeatureSettings: '"lnum"' }}
        >
          {pct}
        </span>
      </div>

      {/* Track — matches MoonCycleBar grammar (h-1.5, rounded-full). No dot;
          the user asked for the line alone. The fill is width-sized via a
          CSS variable so the keyframe can animate from 0 → --pct. */}
      <div className="relative w-full h-1.5 bg-forest-border/50 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{
            // CSS custom property consumed by the @keyframes `to` block.
            // Cast needed because React's CSSProperties type doesn't know
            // about arbitrary custom properties.
            ["--pct" as any]: `${pct}%`,
            width: `${pct}%`,
            background: `linear-gradient(to right, ${color}, transparent)`,
            animation: `solrayInkDraw ${drawMs}ms cubic-bezier(0.22, 0.8, 0.36, 1) ${drawDelay}ms both`,
          }}
        />
      </div>
    </button>
  );
}

// Planet card for the cosmic ticker strip.
// Mapped onto the aged-pigment palette, grouped by modern rulership
// pairs so the paired planets share a hue naturally:
//   Sun          → amber-sun   (the hero stays the hero)
//   Moon ~ Uranus → mist        (silvery cool, sudden awakening)
//   Mercury       → pearl       (quick, luminous, mercurial)
//   Venus ~ Neptune → wisteria  (love, dreams, mysticism)
//   Mars  ~ Pluto   → ember     (warrior fire, transformation heat)
//      wait — Pluto is paired with Saturn below, not Mars. See below.
//   Jupiter       → moss        (expansion, growth, abundance)
//   Saturn ~ Pluto → indigo     (structure, depth, dark cool)
const PLANET_COLORS: Record<string, string> = {
  Sun:     "#f39230",  // amber-sun — hero
  Moon:    "#9babb9",  // mist
  Mercury: "#ece4cf",  // pearl
  Venus:   "#9b86a0",  // wisteria
  Mars:    "#d47a52",  // ember
  Jupiter: "#8a9e66",  // moss
  Saturn:  "#6a8692",  // indigo
  Uranus:  "#9babb9",  // mist (paired with Moon)
  Neptune: "#9b86a0",  // wisteria (paired with Venus)
  Pluto:   "#6a8692",  // indigo (paired with Saturn)
};

function PlanetCard({ planet }: { planet: Planet }) {
  const color = PLANET_COLORS[planet.name] || "#8a9e8d";
  return (
    <div
      className="flex flex-col items-center rounded-2xl px-3 py-3 min-w-[76px] shrink-0 gap-0.5"
      style={{ background: "rgb(var(--rgb-card))", border: `1px solid ${color}30` }}
    >
      <div className="flex items-center gap-1 h-8 items-center justify-center">
        <span style={{ color, opacity: 0.9, fontSize: "1.4rem", lineHeight: 1, display: "flex", alignItems: "center", height: "2rem" }}>
          {planet.symbol}
        </span>
        {planet.retrograde && (
          <span className="text-[10px] font-body leading-none mt-0.5" style={{ color }}>℞</span>
        )}
      </div>
      <span className="font-body text-text-secondary/80 text-[10px] tracking-widest uppercase mt-0.5">
        {planet.name}
      </span>
      <span className="font-body text-text-primary text-[13px] font-medium">
        {planet.sign}
      </span>
      <span className="font-body text-text-secondary/70 text-[10px]">{planet.degree}</span>
    </div>
  );
}

// Skeleton components for instant perceived loading
function SkeletonToday() {
  return (
    <div>
      {/* Hero skeleton — matches real hero: padded, rounded-2xl, 160px */}
      <div className="max-w-lg mx-auto px-5 pt-3">
        <div className="w-full h-[160px] bg-forest-card skeleton-shimmer rounded-2xl" />
      </div>

      <div className="max-w-lg mx-auto px-5">
        {/* Energy bars skeleton */}
        <div className="mb-8 mt-8 space-y-4">
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
    </div>
  );
}

// Hero image card with day title
function HeroImageCard({
  dayTitle,
  imageSrc,
  reading,
}: {
  dayTitle: string;
  imageSrc: string;
  reading?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="rounded-2xl overflow-hidden cursor-pointer"
      style={{ border: "1px solid rgba(26,48,32,0.6)" }}
      onClick={() => setOpen(v => !v)}
    >
      {/* Image section */}
      <div className="relative w-full h-[160px]">
        <Image
          src={imageSrc}
          alt={dayTitle}
          fill
          className="object-cover"
          priority
          unoptimized
        />
        <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.12) 0%, rgba(0,0,0,0.55) 42%, rgba(0,0,0,0.78) 100%)" }} />

        {/* Day title centered */}
        <div className="absolute inset-0 flex flex-col items-center justify-center px-6">
          <h1
            className="font-heading text-[26px] leading-[1.22] text-center"
            style={{ color: "#f2ecd8", fontWeight: 400, fontStyle: "italic", letterSpacing: "-0.01em", textShadow: "0 2px 14px rgba(0,0,0,0.85), 0 1px 5px rgba(0,0,0,0.95)" }}
          >
            {dayTitle}
          </h1>
        </div>

        {/* Today's Weather label + arrow */}
        <div className="absolute bottom-0 w-full flex flex-col items-center pb-3 gap-1">
          <p className="font-body text-[11px] tracking-[0.18em] uppercase" style={{ color: "rgba(242,236,216,0.85)", fontWeight: 500 }}>
            Today&apos;s Weather
          </p>
          <svg
            width="12" height="8" viewBox="0 0 16 10" fill="none"
            style={{
              opacity: 0.6,
              transform: open ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.3s ease",
            }}
          >
            <path d="M1 1L8 8L15 1" stroke="#f39230" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>

      {/* Expandable reading */}
      {open && reading && (
        <div
          className="px-5 pt-5 pb-6"
          style={{ background: "rgb(var(--rgb-card))" }}
          onClick={e => e.stopPropagation()}
        >
          {reading.split(/\n\n+/).map((para, i) => (
            <p
              key={i}
              className={`font-body text-text-secondary text-[13px] leading-relaxed ${i > 0 ? "mt-5" : ""}`}
            >
              {para.trim()}
            </p>
          ))}
        </div>
      )}
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
    // Explicitly pass through optional fields so cache round-trips preserve them
    return {
      ...data,
      planets,
      tag_details: data.tag_details ?? undefined,
      lunar_event: data.lunar_event ?? undefined,
    };
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
  const [visibleSections, setVisibleSections] = useState(0);
  const { token } = useAuth();
  const router = useRouter();
  const backgroundFetchDone = useRef(false);

  // Tap an energy bar → seed a first-person question into chat and navigate.
  // Uses the same sessionStorage pattern as AskButton on the profile page.
  const handleEnergyAsk = (label: string, pct: number) => {
    const promptBuilder = ENERGY_PROMPTS[label];
    const question = promptBuilder
      ? promptBuilder(pct)
      : `What does my ${label.toLowerCase()} energy at ${pct}% mean for today?`;
    try {
      sessionStorage.setItem(
        "solray_chat_prompt",
        JSON.stringify({ topic: `${label} energy`, question })
      );
    } catch (_) {
      // ignore — navigation still works, just without the seeded prompt
    }
    router.push("/chat");
  };

  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  useEffect(() => {
    if (!token) return;

    const _d = new Date();
    const dateKey = `${_d.getFullYear()}-${String(_d.getMonth() + 1).padStart(2, "0")}-${String(_d.getDate()).padStart(2, "0")}`;
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
      } catch (err) {
        if (!isBackground) {
          if (err instanceof ApiError && err.status === 403) {
            router.replace("/subscribe");
            return;
          }
          if (err instanceof ApiError && err.status === 401) {
            router.replace("/login");
            return;
          }
          setForecast(MOCK_FORECAST);
          setError("Reading from memory. Reconnect when ready to see the live sky.");
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
  }, [forecast]);

  return (
    <ProtectedRoute>
      <div
        className="min-h-[100dvh] bg-forest-deep"
        style={{ paddingBottom: "calc(160px + env(safe-area-inset-bottom, 16px))" }}
      >
        {/* Header — tag on top row, title + date on row below. Prevents overlap on small screens. */}
        <div className="border-b border-forest-border/50">
          <div className="max-w-lg mx-auto px-5 pt-2 pb-3">
            <p className="font-body text-[10px] tracking-[0.18em] uppercase mb-1" style={{ color: "#f39230" }}>
              Living By Design
            </p>
            <div className="relative flex items-center justify-end" style={{ height: "26px" }}>
              <h1
                className="font-heading tracking-[0.15em] text-text-primary absolute left-1/2 -translate-x-1/2"
                style={{ fontWeight: 300, fontSize: "21px" }}
              >
                SOLRAY
              </h1>
              <span className="font-body text-text-secondary text-[10px]">{today}</span>
            </div>
          </div>
        </div>

        {loading ? (
          // Beautiful skeleton instead of spinner
          <SkeletonToday />
        ) : forecast ? (
          <>
            {/* HERO IMAGE CARD — card style, with padding like CurrentCycles */}
            <div
              className="max-w-lg mx-auto px-5 pt-3 transition-all duration-700"
              style={{
                opacity: visibleSections >= 1 ? 1 : 0,
              }}
            >
              <HeroImageCard
                dayTitle={forecast.day_title}
                imageSrc={getHeroImageUrl(forecast.tags.astrology)}
                reading={forecast.reading}
              />
            </div>

            {/* MOON CYCLE BAR — below hero */}
            <div className="max-w-lg mx-auto px-5 mt-4">
              <MoonCycleBar planets={forecast.planets} />
            </div>

            {/* Below fold content */}
            <div className="max-w-lg mx-auto px-5">
              {/* Subtle offline/error notice */}
              {error && (
                <div className="mt-4 px-3 py-2 rounded-lg border border-forest-border/40 bg-forest-card/30">
                  <p className="text-text-secondary/60 text-[10px] font-body text-center">{error}</p>
                </div>
              )}

              {/* ENERGY BARS — the daily ritual. Hairline ink-lines,
                  each row fades in on its own clock at 80ms stagger. */}
              <div className="mt-14 mb-12">
                {/* Parallel label to "Today's Weather" on the hero card */}
                <p
                  className="font-body text-text-secondary text-[10px] tracking-[0.22em] uppercase mb-7 transition-opacity duration-700"
                  style={{ opacity: visibleSections >= 2 ? 0.85 : 0 }}
                >
                  Today&apos;s Vibe
                </p>
                <div className="space-y-[22px]">
                  <EnergyBar
                    label="Mental"
                    value={forecast.energy.mental}
                    delayMs={120}
                    onAsk={handleEnergyAsk}
                  />
                  <EnergyBar
                    label="Emotional"
                    value={forecast.energy.emotional}
                    delayMs={200}
                    onAsk={handleEnergyAsk}
                  />
                  <EnergyBar
                    label="Physical"
                    value={forecast.energy.physical}
                    delayMs={280}
                    onAsk={handleEnergyAsk}
                  />
                  <EnergyBar
                    label="Intuitive"
                    value={forecast.energy.intuitive}
                    delayMs={360}
                    onAsk={handleEnergyAsk}
                  />
                </div>
              </div>



              {/* TODAY'S DIMENSIONS (DEPTH SLIDES) */}
              <div
                className="mb-12 transition-all duration-700"
                style={{
                  opacity: visibleSections >= 3 ? 1 : 0,
                  transform: visibleSections >= 3 ? "translateY(0)" : "translateY(8px)",
                }}
              >
                <p className="font-body text-text-secondary text-[10px] tracking-[0.22em] uppercase mb-4">
                  Today&apos;s Dimensions
                </p>
                <DepthSlides
                  tags={forecast.tags}
                  tagDetails={forecast.tag_details}
                />
              </div>

              {/* CURRENT CYCLES */}
              <div
                className="mb-12 transition-all duration-700"
                style={{
                  opacity: visibleSections >= 4 ? 1 : 0,
                  transform: visibleSections >= 4 ? "translateY(0)" : "translateY(8px)",
                }}
              >
                <CurrentCycles token={token} />
              </div>

              {/* PLANET STRIP — live cosmic ticker */}
              <div
                className="mb-6 transition-all duration-700"
                style={{
                  opacity: visibleSections >= 5 ? 1 : 0,
                  transform: visibleSections >= 5 ? "translateY(0)" : "translateY(8px)",
                }}
              >
                <p className="font-body text-text-secondary text-[10px] tracking-[0.22em] uppercase mb-3">
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
          </>
        ) : (
          <div className="max-w-lg mx-auto px-5 pt-24 text-center">
            <p className="text-text-secondary font-body text-sm leading-relaxed">
              Unable to load today&apos;s forecast. Please check your connection and refresh.
            </p>
          </div>
        )}

      </div>
    </ProtectedRoute>
  );
}

// Moon phase calculation helpers
function getMoonPhaseValue(): number {
  const now = new Date();
  const jd = (now.getTime() / 86400000) + 2440587.5;
  const lunarCycle = 29.53058867;
  const knownNewMoon = 2451549.5;
  const phase = ((jd - knownNewMoon) % lunarCycle) / lunarCycle;
  return phase < 0 ? phase + 1 : phase;
}

function getMoonPhaseLabel(p: number): string {
  if (p < 0.03 || p > 0.97) return "New Moon";
  if (p < 0.25) return "Waxing Crescent";
  if (p < 0.27) return "First Quarter";
  if (p < 0.48) return "Waxing Gibbous";
  if (p < 0.52) return "Full Moon";
  if (p < 0.73) return "Waning Gibbous";
  if (p < 0.77) return "Third Quarter";
  return "Waning Crescent";
}

// Moon phase is the only place in the app where emoji are used. The
// lunar glyphs (new through waning crescent) read as celestial symbols
// rather than face/object emoji and fit the soft forest palette, so
// they are kept as a deliberate, single-purpose carve-out from the
// otherwise strict no-emoji rule.
function getMoonEmoji(p: number): string {
  if (p < 0.03 || p > 0.97) return "\u{1F311}"; // new
  if (p < 0.25) return "\u{1F312}";              // waxing crescent
  if (p < 0.27) return "\u{1F313}";              // first quarter
  if (p < 0.48) return "\u{1F314}";              // waxing gibbous
  if (p < 0.52) return "\u{1F315}";              // full
  if (p < 0.73) return "\u{1F316}";              // waning gibbous
  if (p < 0.77) return "\u{1F317}";              // third quarter
  return "\u{1F318}";                             // waning crescent
}

// Persistent moon cycle component, always visible.
function MoonCycleBar({ planets }: { planets: Planet[] }) {
  const phase = getMoonPhaseValue();
  const moonSign = planets.find(p => p.name === "Moon")?.sign || "";
  const phaseLabel = getMoonPhaseLabel(phase);
  const phaseEmoji = getMoonEmoji(phase);
  const illumination = Math.round(Math.sin(phase * Math.PI) * 100);

  return (
    <div className="bg-forest-card/40 border border-forest-border/50 rounded-2xl p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">{phaseEmoji}</span>
          <div>
            <p className="font-body text-text-primary text-[13px] font-medium">{phaseLabel}</p>
            {moonSign && (
              <p className="font-body text-text-secondary text-[10px]">Moon in {moonSign}</p>
            )}
          </div>
        </div>
        <div className="text-right">
          <p className="font-heading text-amber-sun text-[13px]">{illumination}%</p>
          <p className="font-body text-text-secondary text-[10px]">illuminated</p>
        </div>
      </div>

      {/* Cycle bar */}
      <div className="relative">
        <div
          className="w-full h-1.5 bg-forest-border/50 rounded-full overflow-hidden"
          style={{
            WebkitMaskImage: "linear-gradient(to right, transparent 0%, black 14%, black 86%, transparent 100%)",
            maskImage: "linear-gradient(to right, transparent 0%, black 14%, black 86%, transparent 100%)",
          }}
        >
          <div
            className="h-full bg-amber-sun/60 rounded-full"
            style={{ width: `${Math.min(phase * 100, 99)}%` }}
          />
        </div>
        {/* Current position dot */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-amber-sun border-2 border-forest-deep"
          style={{ left: `${Math.min(phase * 100, 97)}%`, transform: "translate(-50%, -50%)" }}
        />

        {/* Phase labels */}
        <div className="flex justify-between mt-2">
          <span className="font-body text-text-secondary/60 text-[9px]">New</span>
          <span className="font-body text-text-secondary/60 text-[9px]">1st Q</span>
          <span className="font-body text-text-secondary/60 text-[9px]">Full</span>
          <span className="font-body text-text-secondary/60 text-[9px]">3rd Q</span>
          <span className="font-body text-text-secondary/60 text-[9px]">New</span>
        </div>
      </div>
    </div>
  );
}
