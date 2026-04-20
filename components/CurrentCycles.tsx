"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { apiFetch } from "@/lib/api";

// Planet-specific atmospheric images for cycle cards
const PLANET_CYCLE_IMAGES: Record<string, string> = {
  Sun: "https://images.unsplash.com/photo-1506318137071-a8e063b4bec0?auto=format&fit=crop&w=800&q=60",
  Moon: "https://images.unsplash.com/photo-1532693322450-2cb5c511067d?auto=format&fit=crop&w=800&q=60",
  Mercury: "https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?auto=format&fit=crop&w=800&q=60",
  Venus: "https://images.unsplash.com/photo-1518837695005-2083093ee35b?auto=format&fit=crop&w=800&q=60",
  Mars: "https://images.unsplash.com/photo-1614732414444-096e5f1122d5?auto=format&fit=crop&w=800&q=60",
  Jupiter: "https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&w=800&q=60",
  Saturn: "https://images.unsplash.com/photo-1454789548928-9efd52dc4031?auto=format&fit=crop&w=800&q=60",
  Uranus: "https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?auto=format&fit=crop&w=800&q=60",
  Neptune: "https://images.unsplash.com/photo-1501854140801-50d01698950b?auto=format&fit=crop&w=800&q=60",
  Pluto: "https://images.unsplash.com/photo-1608178398319-48f814d0750c?auto=format&fit=crop&w=800&q=60",
  default: "https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?auto=format&fit=crop&w=800&q=60",
};

function getCycleImage(planet: string): string {
  return PLANET_CYCLE_IMAGES[planet] || PLANET_CYCLE_IMAGES.default;
}

interface Cycle {
  transit_planet: string;
  natal_point: string;
  aspect: string;
  orb: number;
  phase: "applying" | "separating";
  started: string;  // YYYY-MM-DD
  peak: string;     // YYYY-MM-DD
  ends: string;     // YYYY-MM-DD
  title: string;
  summary: string | null;
}

interface UpcomingCycle {
  transit_planet: string;
  natal_point: string;
  aspect: string;
  title: string;
  status: "upcoming";
  days_until_orb: number;
  enters_orb: string; // YYYY-MM-DD
  summary: string | null;
}

interface CyclesResponse {
  cycles: Cycle[];
  upcoming?: UpcomingCycle[];
  total_active?: number;
  total_upcoming?: number;
  // legacy
  count?: number;
  generated_at: string;
}

// Safari-compatible sentence splitter (no lookbehind assertions)
function splitFirstSentence(text: string): [string, string] {
  const match = text.match(/^[\s\S]*?[.!?](?:\s|$)/);
  const first = match ? match[0].trim() : text;
  const rest = text.slice(match ? match[0].length : text.length).trim();
  return [first, rest];
}

// Human-readable cycle title transformations
const CYCLE_TITLE_MAP: Record<string, string> = {
  "Jupiter meets your Chiron": "Jupiter opens your deepest wound into wisdom",
  "Nodal Return": "Your 18-year chapter completes",
  "Pluto meets your Moon": "Your emotional foundations transform",
  "Neptune meets your Sun": "Your identity dissolves and reforms",
  "Uranus meets your ASC": "Your outer self breaks free",
};

function humanizeCycleTitle(title: string): string {
  // Exact match first
  if (CYCLE_TITLE_MAP[title]) return CYCLE_TITLE_MAP[title];
  // Partial match
  for (const [key, value] of Object.entries(CYCLE_TITLE_MAP)) {
    if (title.toLowerCase().includes(key.toLowerCase())) return value;
  }
  return title;
}

// Format date like "Jan 2026"
function fmtDate(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T12:00:00Z");
  return d.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

// Format date like "May 31, 2026"
function fmtDateLong(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T12:00:00Z");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

// Calculate progress 0–100 through the transit window
function calcProgress(started: string, peak: string, ends: string): number {
  const now = Date.now();
  const s = new Date(started + "T12:00:00Z").getTime();
  const e = new Date(ends + "T12:00:00Z").getTime();
  if (e <= s) return 50;
  const progress = (now - s) / (e - s);
  return Math.max(0, Math.min(100, Math.round(progress * 100)));
}

// Peak position on the progress bar (0–100)
function calcPeakPos(started: string, peak: string, ends: string): number {
  const s = new Date(started + "T12:00:00Z").getTime();
  const e = new Date(ends + "T12:00:00Z").getTime();
  const p = new Date(peak + "T12:00:00Z").getTime();
  if (e <= s) return 50;
  return Math.max(5, Math.min(95, Math.round(((p - s) / (e - s)) * 100)));
}

function CycleCard({ cycle }: { cycle: Cycle }) {
  const [expanded, setExpanded] = useState(false);
  const progress = calcProgress(cycle.started, cycle.peak, cycle.ends);
  const peakPos = calcPeakPos(cycle.started, cycle.peak, cycle.ends);

  const duration = `${fmtDate(cycle.started)} — ${fmtDate(cycle.ends)}`;
  const summary = cycle.summary || "";
  const [firstSentence, rest] = splitFirstSentence(summary);

  return (
    <div
      className="rounded-2xl cursor-pointer transition-all duration-300 active:scale-[0.99] overflow-hidden"
      style={{ border: "1px solid rgba(26,48,32,0.6)" }}
      onClick={() => setExpanded((v) => !v)}
    >
      {/* Photo header — locked height, never grows */}
      <div className="relative" style={{ minHeight: "160px" }}>
        <Image
          src={getCycleImage(cycle.transit_planet)}
          alt={cycle.transit_planet}
          fill
          className="object-cover"
          sizes="(max-width: 768px) 100vw, 512px"
          unoptimized
        />
        <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(5,15,8,0.65) 0%, rgba(5,15,8,0.85) 100%)" }} />

        {/* Content over image */}
        <div className="relative z-10 p-5">
          {/* Title row */}
          <div className="flex items-start justify-between gap-2 mb-3">
            <h3 className="font-heading text-text-primary leading-tight" style={{ fontSize: "1.05rem", fontWeight: 400 }}>
              {humanizeCycleTitle(cycle.title)}
            </h3>
            <span
              className="text-text-secondary/40 text-[11px] font-body shrink-0 mt-0.5 transition-transform duration-200"
              style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}
            >
              ▾
            </span>
          </div>

          {/* Progress bar */}
          <div className="mb-3">
            <div className="relative h-1.5 bg-forest-border rounded-full overflow-visible">
              <div className="absolute left-0 top-0 h-full bg-amber-sun/60 rounded-full transition-all duration-700" style={{ width: `${progress}%` }} />
              <div className="absolute top-1/2 -translate-y-1/2 w-1.5 h-3 bg-amber-sun rounded-full shadow-sm" style={{ left: `${peakPos}%`, transform: "translateX(-50%) translateY(-50%)" }} title="Peak" />
              <div className="absolute top-1/2 -translate-y-1/2 w-2 h-2 bg-amber-sun rounded-full shadow-md border border-forest-deep" style={{ left: `${progress}%`, transform: "translateX(-50%) translateY(-50%)" }} />
            </div>
            <div className="flex justify-between mt-1.5">
              <span className="text-text-secondary/40 text-[9px] font-body tracking-wide">{fmtDate(cycle.started)}</span>
              <span className="text-amber-sun/60 text-[9px] font-body tracking-wide">Peak {fmtDate(cycle.peak)}</span>
              <span className="text-text-secondary/40 text-[9px] font-body tracking-wide">{fmtDate(cycle.ends)}</span>
            </div>
          </div>

          {/* First sentence + phase badge always visible */}
          {firstSentence && (
            <p className="text-text-secondary text-[13px] font-body leading-snug">{firstSentence}</p>
          )}
          <div className="flex items-center gap-2 mt-3">
            <span className={`text-[9px] font-body tracking-widest uppercase px-2 py-0.5 rounded-full border ${cycle.phase === "applying" ? "border-amber-sun/40 text-amber-sun/70" : "border-forest-border text-text-secondary/40"}`}>
              {cycle.phase}
            </span>
            <span className="text-text-secondary/30 text-[9px] font-body">orb {cycle.orb}°</span>
          </div>
        </div>
      </div>

      {/* Expanded reading — forest green panel below photo */}
      {expanded && rest && (
        <div style={{ background: "#0a1f12", padding: "16px 20px", borderTop: "1px solid rgba(26,48,32,0.8)" }}>
          <p className="text-text-secondary/80 text-[13px] font-body leading-relaxed">{rest}</p>
        </div>
      )}
    </div>
  );
}

function UpcomingCycleCard({ cycle }: { cycle: UpcomingCycle }) {
  const [expanded, setExpanded] = useState(false);
  const router = useRouter();
  const summary = cycle.summary || "";
  const [upFirstSentence, upRest] = splitFirstSentence(summary);

  const handleGoDeeper = (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      sessionStorage.setItem("solray_chat_prompt", JSON.stringify({
        topic: cycle.title,
        question: `I want to go deeper on this cycle: "${cycle.title}". ${summary ? `Here's what I know: ${summary.slice(0, 200)}. ` : ""}What does this mean for me specifically and how should I work with this energy?`,
      }));
    } catch (_) {}
    router.push("/chat");
  };

  return (
    <div
      className="border border-forest-border/40 rounded-xl px-4 py-4 cursor-pointer transition-all duration-200 hover:border-amber-sun/20 active:scale-[0.99]"
      style={{ background: "rgba(15, 28, 18, 0.6)" }}
      onClick={() => setExpanded((v) => !v)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <h4
              className="font-heading text-text-primary leading-tight"
              style={{ fontSize: "1rem", fontWeight: 400 }}
            >
              {humanizeCycleTitle(cycle.title)}
            </h4>
            <span
              className="text-[9px] font-body tracking-widest uppercase px-2 py-0.5 rounded-full border border-amber-sun/20 text-amber-sun/50 shrink-0"
            >
              {cycle.days_until_orb >= 60
                  ? `in ${Math.round(cycle.days_until_orb / 30)} months`
                  : `in ${cycle.days_until_orb} days`}
            </span>
          </div>
          <p className="text-text-secondary/60 text-[11px] font-body leading-snug">
            Enters orb {fmtDateLong(cycle.enters_orb)}
          </p>
        </div>
        <span
          className="text-text-secondary/40 text-[11px] font-body shrink-0 mt-0.5 transition-transform duration-200"
          style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}
        >
          ▾
        </span>
      </div>

      {/* Always show first sentence */}
      {upFirstSentence && (
        <p className="text-text-secondary/70 text-[13px] font-body leading-snug mt-3">
          {upFirstSentence}
        </p>
      )}

      {/* Expanded: rest of summary + Go Deeper */}
      {expanded && (
        <>
          {upRest && (
            <p className="text-text-secondary/60 text-[13px] font-body leading-snug mt-2">
              {upRest}
            </p>
          )}
          <div className="mt-3 flex justify-end">
            <button
              onClick={handleGoDeeper}
              className="text-[11px] font-body tracking-wider text-amber-sun/70 hover:text-amber-sun transition-colors"
            >
              Go Deeper →
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function CycleCardSkeleton() {
  return (
    <div className="bg-forest-card border border-forest-border/40 rounded-2xl p-4 animate-pulse">
      <div className="h-5 w-48 bg-forest-border/60 rounded mb-3" />
      <div className="h-1.5 bg-forest-border/60 rounded-full mb-3" />
      <div className="h-3.5 w-full bg-forest-border/40 rounded mb-1.5" />
      <div className="h-3.5 w-3/4 bg-forest-border/30 rounded" />
    </div>
  );
}

interface CurrentCyclesProps {
  token: string | null;
}

export default function CurrentCycles({ token }: CurrentCyclesProps) {
  const [cycles, setCycles] = useState<Cycle[] | null>(null);
  const [upcoming, setUpcoming] = useState<UpcomingCycle[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!token) return;

    const monthKey = new Date().toISOString().slice(0, 7); // YYYY-MM
    const cacheKey = `solray_cycles_${monthKey}`;

    // Try cache first
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const data: CyclesResponse = JSON.parse(cached);
        setCycles(data.cycles || []);
        setUpcoming(data.upcoming || []);
        setLoading(false);
        return; // Don't re-fetch for monthly cache
      }
    } catch (_) {}

    // Fetch from API
    apiFetch("/transits/long-range", {}, token)
      .then((data: CyclesResponse) => {
        const cycleList = data.cycles || [];
        const upcomingList = data.upcoming || [];
        setCycles(cycleList);
        setUpcoming(upcomingList);
        // Cache monthly
        try {
          localStorage.setItem(cacheKey, JSON.stringify(data));
        } catch (_) {}
      })
      .catch(() => {
        setCycles([]);
        setUpcoming([]);
      })
      .finally(() => setLoading(false));
  }, [token]);

  const displayCycles = cycles ? cycles.slice(0, 6) : [];
  const total = displayCycles.length;

  if (!loading && total === 0 && upcoming.length === 0) return null;

  const handlePrev = () => setActiveIndex((i) => Math.max(0, i - 1));
  const handleNext = () => setActiveIndex((i) => Math.min(total - 1, i + 1));

  return (
    <div className="mb-8">
      {/* Section header with pagination */}
      <div className="flex items-center justify-between mb-4">
        <p className="font-body text-text-secondary text-[10px] tracking-[0.22em] uppercase">
          Current Cycles
        </p>
        {!loading && total > 1 && (
          <div className="flex items-center gap-3">
            <button
              onClick={handlePrev}
              disabled={activeIndex === 0}
              className="text-text-secondary/60 hover:text-amber-sun transition-colors disabled:opacity-30"
              style={{ fontSize: "1.1rem", lineHeight: 1 }}
            >
              ‹
            </button>
            <span className="font-body text-text-secondary/50" style={{ fontSize: "0.7rem", letterSpacing: "0.1em" }}>
              {activeIndex + 1} / {total}
            </span>
            <button
              onClick={handleNext}
              disabled={activeIndex === total - 1}
              className="text-text-secondary/60 hover:text-amber-sun transition-colors disabled:opacity-30"
              style={{ fontSize: "1.1rem", lineHeight: 1 }}
            >
              ›
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex flex-col gap-3">
          <CycleCardSkeleton />
        </div>
      ) : (
        <>
          {/* Active cycles carousel */}
          {total > 0 && (
            <div>
              <CycleCard key={`${displayCycles[activeIndex]?.transit_planet}-${activeIndex}`} cycle={displayCycles[activeIndex]} />
              {/* Dot indicators */}
              {total > 1 && (
                <div className="flex justify-center gap-1.5 mt-3">
                  {displayCycles.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setActiveIndex(i)}
                      className="rounded-full transition-all"
                      style={{
                        width: i === activeIndex ? 16 : 6,
                        height: 6,
                        background: i === activeIndex ? "#f39230" : "#1a3020",
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Upcoming cycles section */}
          {upcoming.length > 0 && (
            <div className={total > 0 ? "mt-6" : ""}>
              {/* Section label */}
              <div className="flex items-center gap-3 mb-3">
                <p className="font-body text-text-secondary text-[10px] tracking-[0.22em] uppercase">
                  Coming Up
                </p>
                <div className="flex-1 h-px bg-forest-border/30" />
              </div>

              <div className="flex flex-col gap-2">
                {upcoming.map((cycle, i) => (
                  <UpcomingCycleCard key={`${cycle.transit_planet}-${cycle.natal_point}-${i}`} cycle={cycle} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
