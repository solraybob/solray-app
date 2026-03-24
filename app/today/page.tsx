"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import ProtectedRoute from "@/components/ProtectedRoute";
import BottomNav from "@/components/BottomNav";
import LoadingSpinner from "@/components/LoadingSpinner";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";

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
  const note = getEnergyNote(label, value);
  return (
    <div className="flex flex-col gap-1.5">
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
      <p className="text-text-secondary/50 text-[10px] font-body pl-[92px] leading-tight">
        {note}
      </p>
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

export default function TodayPage() {
  const [forecast, setForecast] = useState<ForecastData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [barsAnimated, setBarsAnimated] = useState(false);
  const [visibleSections, setVisibleSections] = useState(0);
  const { token, logout } = useAuth();
  const router = useRouter();

  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  useEffect(() => {
    async function loadForecast() {
      try {
        const data = await apiFetch("/forecast/today", {}, token);
        // If AI fields are present, use real data; otherwise use mock
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
          setForecast({ ...data, planets });
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
          setForecast({
            ...MOCK_FORECAST,
            planets: planets.length > 0 ? planets : MOCK_FORECAST.planets,
          });
        }
      } catch {
        // Network failure — fall back to mock and show a subtle note
        setForecast(MOCK_FORECAST);
        setError("Showing cached reading. Reconnect to see today's live forecast.");
      } finally {
        setLoading(false);
      }
    }
    if (token) loadForecast();
  }, [token]);

  // Staggered section reveal
  useEffect(() => {
    if (!forecast) return;
    const timings = [0, 100, 500, 700, 900];
    timings.forEach((delay, index) => {
      setTimeout(() => setVisibleSections(index + 1), delay);
    });
    setTimeout(() => setBarsAnimated(true), 600);
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
              <button
                onClick={() => {
                  logout();
                  router.push("/login");
                }}
                className="text-text-secondary text-xs font-body hover:text-amber-sun transition-colors"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center pt-32">
            <LoadingSpinner size="lg" />
          </div>
        ) : forecast ? (
          <div className="max-w-lg mx-auto px-5">
            {/* Subtle offline/error notice */}
            {error && (
              <div className="mt-4 px-3 py-2 rounded-lg border border-forest-border/40 bg-forest-card/30">
                <p className="text-text-secondary/60 text-[10px] font-body text-center">{error}</p>
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

            {/* READING */}
            <div
              className="pb-10 transition-all duration-700"
              style={{
                opacity: visibleSections >= 2 ? 1 : 0,
                transform: visibleSections >= 2 ? "translateY(0)" : "translateY(12px)",
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

            {/* Divider */}
            <div
              className="transition-all duration-500"
              style={{ opacity: visibleSections >= 3 ? 1 : 0 }}
            >
              <div className="border-t border-forest-border/40 mb-8" />
            </div>

            {/* ENERGY BARS */}
            <div
              className="mb-8 transition-all duration-700"
              style={{
                opacity: visibleSections >= 3 ? 1 : 0,
                transform: visibleSections >= 3 ? "translateY(0)" : "translateY(12px)",
              }}
            >
              <div className="space-y-4">
                <EnergyBar label="Mental" value={forecast.energy.mental} animate={barsAnimated} />
                <EnergyBar label="Emotional" value={forecast.energy.emotional} animate={barsAnimated} />
                <EnergyBar label="Physical" value={forecast.energy.physical} animate={barsAnimated} />
                <EnergyBar label="Intuitive" value={forecast.energy.intuitive} animate={barsAnimated} />
              </div>
            </div>

            {/* TAGS */}
            <div
              className="flex flex-wrap gap-2 mb-8 transition-all duration-700"
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
