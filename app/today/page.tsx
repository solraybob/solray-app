"use client";

import { useEffect, useState } from "react";
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
    "The cosmos invites a softening today. You are not behind — you are being prepared. There is momentum building beneath the surface, and your awareness of it is the catalyst. Trust the timing that arrives without forcing. What unfolds in stillness carries far more weight than what is seized in urgency.",
  tags: {
    astrology: "Venus trine Neptune",
    human_design: "Gate 57 — Intuition",
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

function EnergyBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-text-secondary text-xs font-body w-20 shrink-0 tracking-wider uppercase">{label}</span>
      <div className="flex-1 h-1.5 bg-forest-border rounded-full overflow-hidden">
        <div
          className="h-full bg-amber-sun rounded-full transition-all duration-1000"
          style={{ width: `${value * 10}%` }}
        />
      </div>
      <span className="text-text-secondary text-xs font-body w-4 text-right">{value}</span>
    </div>
  );
}

export default function TodayPage() {
  const [forecast, setForecast] = useState<ForecastData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { token } = useAuth();

  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  useEffect(() => {
    async function loadForecast() {
      try {
        const data = await apiFetch("/forecast/today", {}, token);
        setForecast(data);
      } catch {
        // Use mock data if API not available
        setForecast(MOCK_FORECAST);
      } finally {
        setLoading(false);
      }
    }
    if (token) loadForecast();
  }, [token]);

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-forest-deep pb-24">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-forest-deep/90 backdrop-blur-sm border-b border-forest-border/50">
          <div className="max-w-lg mx-auto px-5 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full overflow-hidden">
                <Image src="/logo.svg" alt="Solray" width={28} height={28} className="w-full h-full object-cover" />
              </div>
              <span className="font-heading text-xs tracking-[0.2em] uppercase text-text-secondary">Solray AI</span>
            </div>
            <span className="text-text-secondary text-xs font-body">{today}</span>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center pt-32">
            <LoadingSpinner size="lg" />
          </div>
        ) : error ? (
          <div className="max-w-lg mx-auto px-5 pt-16 text-center">
            <p className="text-text-secondary font-body text-sm">{error}</p>
          </div>
        ) : forecast ? (
          <div className="max-w-lg mx-auto px-5 animate-fade-in">
            {/* Hero */}
            <div className="pt-10 pb-8">
              <h1 className="font-heading text-4xl leading-tight text-text-primary italic">
                {forecast.day_title}
              </h1>
            </div>

            {/* Reading */}
            <div className="mb-8">
              <p className="font-body text-text-secondary leading-relaxed text-sm">
                {forecast.reading}
              </p>
            </div>

            {/* Tags */}
            <div className="flex flex-wrap gap-2 mb-8">
              <Tag>{forecast.tags.astrology}</Tag>
              <Tag>{forecast.tags.human_design}</Tag>
              <Tag>{forecast.tags.gene_keys}</Tag>
            </div>

            {/* Energy Levels */}
            <div className="bg-forest-card border border-forest-border rounded-2xl p-5 mb-6">
              <h3 className="font-heading text-lg text-text-primary mb-4">Energy Today</h3>
              <div className="space-y-3">
                <EnergyBar label="Mental" value={forecast.energy.mental} />
                <EnergyBar label="Emotional" value={forecast.energy.emotional} />
                <EnergyBar label="Physical" value={forecast.energy.physical} />
                <EnergyBar label="Intuitive" value={forecast.energy.intuitive} />
              </div>
            </div>

            {/* Planetary Strip */}
            <div className="mb-6">
              <h3 className="font-heading text-lg text-text-primary mb-3">Planets Now</h3>
              <div className="overflow-x-auto -mx-5 px-5">
                <div className="flex gap-3 pb-2" style={{ width: "max-content" }}>
                  {forecast.planets.map((planet) => (
                    <div
                      key={planet.name}
                      className="bg-forest-card border border-forest-border rounded-xl p-3 text-center min-w-[72px]"
                    >
                      <div className="text-2xl mb-1">{planet.symbol}</div>
                      <div className="text-text-primary text-xs font-body">{planet.sign}</div>
                      <div className="text-text-secondary text-[10px] font-body">{planet.degree}</div>
                      {planet.retrograde && (
                        <div className="text-amber-sun text-[9px] font-body mt-0.5">℞</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <BottomNav />
      </div>
    </ProtectedRoute>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-3 py-1.5 rounded-full border border-forest-border text-text-secondary text-xs font-body tracking-wide">
      {children}
    </span>
  );
}
