"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useT } from "@/lib/i18n";

// Each transiting planet tints its own card, drawn from the orb. Photographs
// used to sit here; lettering over them had to be pinned to the night palette
// to survive, which is how it went invisible when the palette changed.
const PLANET_CYCLE_WASH: Record<string, string> = {
  Sun:     "radial-gradient(ellipse 80% 130% at 50% 0%, rgba(252,180,156,.26), transparent 74%)",
  Moon:    "radial-gradient(ellipse 80% 130% at 50% 0%, rgba(84,63,150,.20), transparent 74%)",
  Mercury: "radial-gradient(ellipse 80% 130% at 50% 0%, rgba(74,46,158,.18), transparent 74%)",
  Venus:   "radial-gradient(ellipse 80% 130% at 50% 0%, rgba(176,46,114,.20), transparent 74%)",
  Mars:    "radial-gradient(ellipse 80% 130% at 50% 0%, rgba(163,74,34,.22), transparent 74%)",
  Jupiter: "radial-gradient(ellipse 80% 130% at 50% 0%, rgba(230,141,94,.22), transparent 74%)",
  Saturn:  "radial-gradient(ellipse 80% 130% at 50% 0%, rgba(110,102,89,.22), transparent 74%)",
  Uranus:  "radial-gradient(ellipse 80% 130% at 50% 0%, rgba(90,49,174,.20), transparent 74%)",
  Neptune: "radial-gradient(ellipse 80% 130% at 50% 0%, rgba(74,46,158,.22), transparent 74%)",
  Pluto:   "radial-gradient(ellipse 80% 130% at 50% 0%, rgba(34,32,28,.18), transparent 74%)",
  default: "radial-gradient(ellipse 80% 130% at 50% 0%, rgba(84,63,150,.18), transparent 74%)",
};

function getCycleWash(planet: string): string {
  return PLANET_CYCLE_WASH[planet] || PLANET_CYCLE_WASH.default;
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

// Locale for date rendering: English keeps the en-GB day-month order the
// design was tuned on; any other app language formats natively (e.g. "ene 2026").
function dateLocale(lang: string): string {
  return lang === "en" ? "en-GB" : lang;
}

// Format date like "Jan 2026"
function fmtDate(dateStr: string, lang: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T12:00:00Z");
  return d.toLocaleDateString(dateLocale(lang), { month: "short", year: "numeric" });
}

// Format date like "May 31, 2026"
function fmtDateLong(dateStr: string, lang: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T12:00:00Z");
  return d.toLocaleDateString(dateLocale(lang), { day: "numeric", month: "long", year: "numeric" });
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
  const { t, lang } = useT();
  const [expanded, setExpanded] = useState(false);
  const progress = calcProgress(cycle.started, cycle.peak, cycle.ends);
  const peakPos = calcPeakPos(cycle.started, cycle.peak, cycle.ends);

  const duration = `${fmtDate(cycle.started, lang)}, ${fmtDate(cycle.ends, lang)}`;
  const summary = cycle.summary || "";
  const [firstSentence, rest] = splitFirstSentence(summary);

  return (
    <div
      className="rounded-2xl cursor-pointer transition-all duration-300 active:scale-[0.99] overflow-hidden"
      style={{ border: "1px solid rgb(var(--rgb-border))" }}
      onClick={() => setExpanded((v) => !v)}
    >
      {/* Header, locked height, never grows. */}
      <div className="relative" style={{ minHeight: "160px", background: `${getCycleWash(cycle.transit_planet)}, rgb(var(--rgb-card))` }}>

        {/* Content over image */}
        <div className="relative z-10 p-5">
          {/* Title row */}
          <div className="flex items-start justify-between gap-2 mb-3">
            <h3 className="font-heading text-text-primary leading-tight" style={{ fontSize: "1.08rem", fontWeight: 900, letterSpacing: "-.03em" }}>
              {humanizeCycleTitle(cycle.title)}
            </h3>
            <span
              className="text-text-muted text-[15px] font-body shrink-0 mt-0.5 transition-transform duration-200"
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
              <span className="text-text-muted text-[13px] font-body tracking-wide">{fmtDate(cycle.started, lang)}</span>
              <span className="text-amber-sun text-[13px] font-body tracking-wide">{t("cycles.peak")} {fmtDate(cycle.peak, lang)}</span>
              <span className="text-text-muted text-[13px] font-body tracking-wide">{fmtDate(cycle.ends, lang)}</span>
            </div>
          </div>

          {/* First sentence + phase badge always visible */}
          {firstSentence && (
            <p className="text-text-secondary text-[17px] font-body leading-snug">{firstSentence}</p>
          )}
          <div className="flex items-center gap-2 mt-3">
            <span className={`text-[13px] font-body tracking-widest uppercase px-2 py-0.5 rounded-full border ${cycle.phase === "applying" ? "border-amber-sun/40 text-amber-sun" : "border-forest-border text-text-muted"} font-bold`}>
              {cycle.phase === "applying" ? t("cycles.applying") : cycle.phase === "separating" ? t("cycles.separating") : cycle.phase}
            </span>
            <span className="text-text-muted text-[13px] font-body">{t("cycles.orb")} {cycle.orb}°</span>
          </div>
        </div>
      </div>

      {/* Expanded reading, forest green panel below photo */}
      {expanded && rest && (
        <div style={{ background: "rgb(var(--rgb-card))", padding: "16px 20px", borderTop: "1px solid rgb(var(--rgb-border) / 0.8)" }}>
          <p className="text-text-secondary text-[17px] font-body leading-relaxed">{rest}</p>
        </div>
      )}
    </div>
  );
}

function UpcomingCycleCard({ cycle }: { cycle: UpcomingCycle }) {
  const { t, lang } = useT();
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
      style={{ background: "rgb(var(--rgb-card) / 0.6)" }}
      onClick={() => setExpanded((v) => !v)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <h4
              className="font-heading text-text-primary leading-tight"
              style={{ fontSize: "1rem", fontWeight: 700 }}
            >
              {humanizeCycleTitle(cycle.title)}
            </h4>
            <span
              className="text-[13px] font-body tracking-widest uppercase px-2 py-0.5 rounded-full border border-amber-sun/20 text-amber-sun shrink-0 font-bold"
            >
              {cycle.days_until_orb >= 60
                  ? t("cycles.in_months").replace("{n}", String(Math.round(cycle.days_until_orb / 30)))
                  : t("cycles.in_days").replace("{n}", String(cycle.days_until_orb))}
            </span>
          </div>
          <p className="text-text-muted text-[15px] font-body leading-snug">
            {t("cycles.enters_orb")} {fmtDateLong(cycle.enters_orb, lang)}
          </p>
        </div>
        <span
          className="text-text-muted text-[15px] font-body shrink-0 mt-0.5 transition-transform duration-200"
          style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}
        >
          ▾
        </span>
      </div>

      {/* Always show first sentence */}
      {upFirstSentence && (
        <p className="text-text-secondary text-[17px] font-body leading-snug mt-3">
          {upFirstSentence}
        </p>
      )}

      {/* Expanded: rest of summary + Go Deeper */}
      {expanded && (
        <>
          {upRest && (
            <p className="text-text-muted text-[17px] font-body leading-snug mt-2">
              {upRest}
            </p>
          )}
          <div className="mt-3 flex justify-end">
            <button
              onClick={handleGoDeeper}
              className="text-[15px] font-body tracking-wider text-amber-sun hover:text-amber-sun transition-colors"
            >
              {t("cycles.go_deeper")}
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
  const { t, lang } = useT();
  const [cycles, setCycles] = useState<Cycle[] | null>(null);
  const [upcoming, setUpcoming] = useState<UpcomingCycle[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!token) return;

    // Cache key includes the language: the summaries and titles are
    // language-specific server content, so switching language must refetch
    // rather than serve last month's cached English for four weeks.
    const monthKey = new Date().toISOString().slice(0, 7); // YYYY-MM
    // Cache VERSION (v2): a monthly cache with no revalidation meant a bad value
    // (e.g. a stale "Saturn Return" from an earlier response) could stick for up
    // to a month. Bumping the version invalidates every stale client cache once,
    // and we now revalidate in the background instead of early-returning, so the
    // displayed cycles self-heal on the next load even within the same month.
    const cacheKey = `solray_cycles_v2_${monthKey}_${lang}`;

    let servedFromCache = false;
    // Drop any pre-v2 cached cycles so the old stale title cannot linger.
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith("solray_cycles_") && !k.startsWith("solray_cycles_v2_"))
        .forEach((k) => localStorage.removeItem(k));
    } catch (_) {}

    // Show cache immediately if present, but DO NOT stop there: still refetch
    // below to refresh it (stale-while-revalidate).
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const data: CyclesResponse = JSON.parse(cached);
        setCycles(data.cycles || []);
        setUpcoming(data.upcoming || []);
        setLoading(false);
        servedFromCache = true;
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
        // If we already painted from cache, keep it; only clear when we have
        // nothing to show, so a failed background revalidation never blanks
        // the cards the user is looking at.
        if (!servedFromCache) {
          setCycles([]);
          setUpcoming([]);
        }
      })
      .finally(() => setLoading(false));
  }, [token, lang]);

  const displayCycles = cycles ? cycles.slice(0, 6) : [];
  const total = displayCycles.length;

  if (!loading && total === 0 && upcoming.length === 0) return null;

  const handlePrev = () => setActiveIndex((i) => Math.max(0, i - 1));
  const handleNext = () => setActiveIndex((i) => Math.min(total - 1, i + 1));

  return (
    <div className="mb-8">
      {/* Section header with pagination */}
      <div className="flex items-center justify-between mb-4">
        <p className="font-body text-text-secondary text-[14px] tracking-[0.22em] uppercase font-bold">
          {t("cycles.current_cycles")}
        </p>
        {!loading && total > 1 && (
          <div className="flex items-center gap-3">
            <button
              onClick={handlePrev}
              disabled={activeIndex === 0}
              className="text-text-muted hover:text-amber-sun transition-colors disabled:opacity-30"
              style={{ fontSize: "1.1rem", lineHeight: 1 }}
            >
              ‹
            </button>
            <span className="font-body text-text-muted" style={{ fontSize: "0.85rem", letterSpacing: "0.1em" }}>
              {activeIndex + 1} / {total}
            </span>
            <button
              onClick={handleNext}
              disabled={activeIndex === total - 1}
              className="text-text-muted hover:text-amber-sun transition-colors disabled:opacity-30"
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
                        background: i === activeIndex ? "rgb(var(--rgb-amber))" : "rgb(var(--rgb-border))",
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
                <p className="font-body text-text-secondary text-[14px] tracking-[0.22em] uppercase font-bold">
                  {t("cycles.coming_up")}
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
