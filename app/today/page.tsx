"use client";

import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import CurrentCycles from "@/components/CurrentCycles";
import { useAuth } from "@/lib/auth-context";
import { apiFetch, ApiError } from "@/lib/api";
import LunarPhaseCard from "@/components/LunarPhaseCard";
import DepthSlides from "@/components/DepthSlides";
import { ShareCardOffscreen, ShareOffscreenWrapper, EnergyBarsCard } from "@/components/ShareCard";
import { useT } from "@/lib/i18n";
import { NIGHT_SURFACE } from "@/lib/night";

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
  _pending?: false;
}

// Discriminated union for the "AI not ready yet but transits ARE live"
// case. The previous version of this file shipped a hardcoded
// MOCK_FORECAST and showed it whenever the AI fields were missing or
// the network failed. That is fictional content presented as a real
// reading. Removed in May 2026 after a cross-agent review surfaced it.
// The honest pattern is: when AI is pending, show the live planet
// data with explicit "your reading is being written" copy; when the
// network fails entirely, show an error state, never invented copy.
interface PreparingForecast {
  _pending: true;
  planets: Planet[];
}

type ForecastView = ForecastData | PreparingForecast;

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

// Extended palette, aged pigments. Label stays in text.secondary;
// color does the categorizing, not the type.
const ENERGY_COLORS: Record<string, string> = {
  Mental:    "#9babb9", // mist
  Emotional: "var(--ember)", // ember
  Physical:  "#8a9e66", // moss
  Intuitive: "var(--wisteria)", // wisteria
};

// Prompts seeded into chat when a bar is tapped. Phrased as the user
// asking their Higher Self, keeps the question in first-person voice.
const ENERGY_PROMPTS: Record<string, (pct: number) => string> = {
  Mental:    (p) => `My mental energy is at ${p}% today. What's shaping it, and how should I work with it?`,
  Emotional: (p) => `My emotional energy is at ${p}% today. What's underneath this, and what does it need from me?`,
  Physical:  (p) => `My physical energy is at ${p}% today. How should I move, rest, or pace myself?`,
  Intuitive: (p) => `My intuitive energy is at ${p}% today. What is my gut trying to tell me I'm not listening to?`,
};

// Display-layer transform: remap the 1-10 score onto a 12-93% visual range.
// The previous mapping (50 + score*4.5) compressed every real day into a
// 54-95% band, so a heavy Saturn-square day and a flowing trine day looked
// nearly identical. Verified against 200 production charts: scores genuinely
// span 1-10 in the wild, so the bar now uses the full height. score*9 + 3
// puts a neutral 6 at 57% (calm, present), a hard 3 at 30%, a charged 9 at
// 84%. Per-point visual distance doubles (9pts vs 4.5). Display only, the
// underlying astrology is untouched.
function toDisplayPct(value: number): number {
  const clamped = Math.max(1, Math.min(10, value));
  return Math.round(clamped * 9 + 3);
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
  const { t } = useT();
  const color = ENERGY_COLORS[label] || "#f39230";
  const pct = toDisplayPct(value);
  const displayLabel = t(`today.${label.toLowerCase()}`);

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
      aria-label={`${displayLabel} ${pct}%`}
      className="group block w-full text-left focus:outline-none focus-visible:ring-1 focus-visible:ring-amber-sun/40 rounded-sm"
    >
      {/* Label row, fades in as a unit, no per-row stagger here. */}
      <div
        className="flex items-baseline justify-between mb-2"
        style={{
          animation: `solrayLabelFade ${labelFadeMs}ms cubic-bezier(0.22, 0.8, 0.36, 1) both`,
        }}
      >
        <span className="font-body text-[12px] font-normal tracking-[0.22em] uppercase text-text-secondary">
          {displayLabel}
        </span>
        <span
          className="font-heading text-[17px] text-text-secondary/70"
          style={{ fontFeatureSettings: '"lnum"' }}
        >
          {pct}
        </span>
      </div>

      {/* Track, matches MoonCycleBar grammar (h-1.5, rounded-full). No dot;
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
//      wait, Pluto is paired with Saturn below, not Mars. See below.
//   Jupiter       → moss        (expansion, growth, abundance)
//   Saturn ~ Pluto → indigo     (structure, depth, dark cool)
const PLANET_COLORS: Record<string, string> = {
  Sun:     "#f39230",  // amber-sun, hero
  Moon:    "#9babb9",  // mist
  Mercury: "var(--pearl)",  // pearl
  Venus:   "#9b86a0",  // wisteria
  Mars:    "#d47a52",  // ember
  Jupiter: "var(--moss)",  // moss
  Saturn:  "#6a8692",  // indigo
  Uranus:  "#9babb9",  // mist (paired with Moon)
  Neptune: "var(--wisteria)",  // wisteria (paired with Venus)
  Pluto:   "#6a8692",  // indigo (paired with Saturn)
};

function PlanetCard({ planet }: { planet: Planet }) {
  const { t } = useT();
  const color = PLANET_COLORS[planet.name] || "#8a9e8d";
  const planetLabel = t(`planets.${planet.name.toLowerCase()}`);
  const signLabel = t(`signs.${planet.sign.toLowerCase()}`);
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
          <span className="text-[12px] font-body leading-none mt-0.5" style={{ color }}>℞</span>
        )}
      </div>
      <span className="font-body text-text-secondary/80 text-[12px] tracking-widest uppercase mt-0.5">
        {planetLabel}
      </span>
      <span className="font-body text-text-primary text-[15px] font-medium">
        {signLabel}
      </span>
      <span className="font-body text-text-secondary/70 text-[12px]">{planet.degree}</span>
    </div>
  );
}

// Skeleton components for instant perceived loading
function SkeletonToday() {
  const { t } = useT();
  return (
    <div>
      {/* Honest loading copy. Each label is true: the planets ARE
          actually being read, the chart IS being matched, the reading
          IS being written. Replaces a silent skeleton with a small
          breath of intention so waiting feels considered, not blank.
          Codex UX hook 8. */}
      <div className="max-w-lg lg:max-w-3xl mx-auto px-5 pt-6 pb-1 text-center">
        <p
          className="font-body text-[12px] tracking-[0.3em] uppercase"
          style={{ color: "var(--amber)", opacity: 0.7 }}
        >
          {t("today.reading_sky")}
        </p>
      </div>

      {/* Hero skeleton, matches real hero: padded, rounded-2xl, 160px */}
      <div className="max-w-lg lg:max-w-3xl mx-auto px-5 pt-3">
        <div className="w-full h-[160px] bg-forest-card skeleton-shimmer rounded-2xl" />
      </div>

      <div className="max-w-lg lg:max-w-3xl mx-auto px-5">
        {/* Energy bars skeleton */}
        <div className="mb-8 mt-8 space-y-4">
          {["Mental", "Emotional", "Physical", "Intuitive"].map((label) => (
            <div key={label} className="flex items-center gap-3">
              <span className="text-text-secondary text-xs font-body w-20 shrink-0 tracking-wider uppercase opacity-40">
                {t(`today.${label.toLowerCase()}`)}
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

        {/* Reading skeleton, 4 lines */}
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
  const { t, lang } = useT();
  const [open, setOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const shareCardRef = useRef<HTMLDivElement | null>(null);

  // Build the date label once per render: "Saturday, 3 May"
  const dateLabel = new Date().toLocaleDateString(lang === "en" ? "en-GB" : lang, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation(); // don't toggle the open/close on share tap
    if (sharing) return;
    if (!shareCardRef.current) return;
    setSharing(true);
    try {
      const { shareOrDownloadCard } = await import("@/lib/share-card");
      await shareOrDownloadCard({
        node: shareCardRef.current,
        filename: `solray-${dateLabel.replace(/[, ]+/g, "-").toLowerCase()}.png`,
        title: "Solray",
        text: dayTitle,
      });
    } catch (err) {
      console.warn("[share] failed", err);
    } finally {
      setSharing(false);
    }
  };

  return (
    <div
      className="rounded-2xl overflow-hidden relative"
      style={{ border: "1px solid rgba(26,48,32,0.6)" }}
    >
      {/* Image + toggle area. The onClick toggles open/close on the
          hero. The share button below is a SIBLING of this div, not a
          descendant, so its click cannot bubble up to the toggle. The
          previous version had the button nested inside this div and
          relied on e.stopPropagation, which was unreliable across
          touch environments because the streaming-tick rate could
          interfere and iOS sometimes fires both touchend and click
          on different elements. Sibling structure removes the race. */}
      <div
        className="relative w-full h-[160px] cursor-pointer"
        style={NIGHT_SURFACE}
        onClick={() => setOpen(v => !v)}
      >
        <Image
          src={imageSrc}
          alt={dayTitle}
          fill
          className="object-cover"
          priority
          unoptimized
          onLoad={() => setImgLoaded(true)}
          style={{
            // Gentle fade-in instead of a pop when the hero lands. The dark
            // card and gradient are already in place, so the image breathes
            // in over them.
            opacity: imgLoaded ? 1 : 0,
            transition: "opacity 0.45s ease",
          }}
        />
        <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.12) 0%, rgba(0,0,0,0.55) 42%, rgba(0,0,0,0.78) 100%)" }} />

        {/* Day title centered */}
        <div className="absolute inset-0 flex flex-col items-center justify-center px-6 pointer-events-none">
          <h1
            className="font-heading text-[26px] leading-[1.22] text-center"
            style={{ color: "var(--text-primary)", fontWeight: 400, fontStyle: "italic", letterSpacing: "-0.01em", textShadow: "0 2px 14px rgba(0,0,0,0.85), 0 1px 5px rgba(0,0,0,0.95)" }}
          >
            {dayTitle}
          </h1>
        </div>

        {/* Today's Weather label + arrow */}
        <div className="absolute bottom-0 w-full flex flex-col items-center pb-3 gap-1 pointer-events-none">
          <p className="font-body text-[13px] tracking-[0.18em] uppercase" style={{ color: "rgba(242,236,216,0.85)", fontWeight: 500 }}>
            {t("today.weather")}
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

      {/* Share button. Sibling of the click-toggling div, absolutely
          positioned over the hero's top-right corner. The outer card
          wrapper is now `position: relative` so this absolute lands
          where it should. Cannot bubble to a parent onClick because
          there is no parent onClick. Codex UX hook 6. */}
      <button
        onClick={handleShare}
        aria-label={t("today.share")}
        disabled={sharing}
        className="absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center transition-all hover:opacity-90 active:scale-95 disabled:opacity-50 z-10"
        style={{
          ...NIGHT_SURFACE,
          background: "rgba(5,15,8,0.55)",
          border: "1px solid rgba(243,146,48,0.35)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
        }}
      >
        {sharing ? (
          <span
            className="inline-block w-3.5 h-3.5 border-2 rounded-full animate-spin"
            style={{ borderColor: "rgba(243,146,48,0.35)", borderTopColor: "var(--amber)" }}
          />
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--amber)" }}>
            <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-7" />
            <polyline points="16 6 12 2 8 6" />
            <line x1="12" y1="2" x2="12" y2="15" />
          </svg>
        )}
      </button>

      {/* Off-screen share-card render target. Ships only the DOM
          when the parent hero is mounted; html2canvas captures it
          on demand. Position fixed at -99999px keeps it invisible
          but renders so html2canvas can measure. */}
      <ShareCardOffscreen
        data={{ dayTitle, imageSrc, dateLabel }}
        containerRef={shareCardRef}
      />

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
              className={`font-body text-text-secondary text-[15px] leading-relaxed ${i > 0 ? "mt-5" : ""}`}
            >
              {para.trim()}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

// Symbol lookup, shared between the two extraction paths.
const PLANET_SYMBOLS: Record<string, string> = {
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
};

// Honest "your daily reading is being prepared" state. Renders the
// live sky (real planet positions) plus a quiet card explaining the
// reading is still being written. Never shows invented tags, energy,
// or a fake day title. Replaces the previous MOCK_FORECAST fallback.
function PendingTodayState({ planets }: { planets: Planet[] }) {
  const { t } = useT();
  return (
    <div className="max-w-lg lg:max-w-3xl mx-auto px-5 pt-12">
      <div
        className="rounded-sm p-7 mb-8"
        style={{
          background: "rgba(10, 31, 18, 0.6)",
          border: "1px solid rgba(243, 146, 48, 0.14)",
        }}
      >
        <p
          className="font-body text-[12px] tracking-[0.3em] uppercase mb-5"
          style={{ color: "var(--amber, #f39230)", opacity: 0.85 }}
        >
          {t("today.your_reading")}
        </p>
        <p
          className="font-heading text-text-primary mb-3"
          style={{ fontWeight: 300, fontSize: "1.4rem", lineHeight: 1.3 }}
        >
          {t("today.pending_title")}
        </p>
        <p className="font-body text-text-secondary text-[15px] leading-relaxed">
          {t("today.pending_body")}
        </p>
      </div>

      <p className="font-body text-text-secondary text-[12px] tracking-[0.22em] uppercase mb-3">
        {t("today.sky_now")}
      </p>
      <div
        className="-mx-5 px-5 overflow-x-auto"
        style={{ WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}
        // Mouse-wheel users on desktop can't scroll horizontal strips by
        // default. Convert vertical wheel deltas into horizontal scroll
        // when the cursor is over this strip. Touch and trackpad pan
        // gestures still work natively because deltaX is non-zero on
        // those, and we only intercept when deltaX is zero.
        onWheel={(e) => {
          if (e.deltaY !== 0 && e.deltaX === 0) {
            const el = e.currentTarget as HTMLDivElement;
            // Only hijack if there's somewhere to scroll horizontally.
            if (el.scrollWidth > el.clientWidth) {
              el.scrollLeft += e.deltaY;
            }
          }
        }}
      >
        <div className="flex gap-2.5 pb-3" style={{ width: "max-content" }}>
          {planets.map((planet) => (
            <PlanetCard key={planet.name} planet={planet} />
          ))}
        </div>
      </div>
    </div>
  );
}

function extractPlanets(data: any): Planet[] {
  if (data.planets && Array.isArray(data.planets)) {
    return data.planets;
  }
  return Object.entries(data.transits || {})
    .slice(0, 10)
    .map(([name, p]: [string, any]) => ({
      name,
      symbol: PLANET_SYMBOLS[name] || "✦",
      sign: p.sign,
      degree: `${Math.floor(p.degree)}°`,
      retrograde: p.retrograde,
    }));
}

// Parse raw forecast API response. Returns the full ForecastData when
// the AI fields are ready; returns a PreparingForecast (live planets
// only, no AI commentary) when the daily reading has not been generated
// yet. Never returns invented content under any circumstance.
function parseForecastData(data: any): ForecastView {
  const planets = extractPlanets(data);
  if (data.day_title && data.reading && data.tags && data.energy) {
    return {
      ...data,
      planets,
      tag_details: data.tag_details ?? undefined,
      lunar_event: data.lunar_event ?? undefined,
      _pending: false,
    };
  }
  return { _pending: true, planets };
}

type PendingInsight = { id: string; title: string; body: string; confidence: number };

// The breakthrough she reached on her own while the user was away. It does
// not sit in the feed; it rises in front of everything as the Breakthrough of
// the Day, a single moment to meet before the day begins. Surfaced once (the
// server marks it surfaced on fetch), and the chat Oracle still carries it via
// get_recent_insight, so a dismissed moment is never a lost insight.
function BreakthroughModal({ insight, onAsk, onClose }: { insight: PendingInsight; onAsk: () => void; onClose: () => void }) {
  const { t } = useT();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    // Lock background scroll so nothing slides behind the moment.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  // Portal to the page body so the overlay escapes any transformed ancestor
  // on Today and pins to the real viewport instead of the document flow.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, height: "100dvh", zIndex: 9999, display: "flex",
        alignItems: "flex-start", justifyContent: "center",
        padding: "calc(env(safe-area-inset-top, 0px) + 7vh) 22px 40px",
        overflowY: "auto", WebkitOverflowScrolling: "touch",
        background: "rgba(4,11,7,0.86)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
        animation: "bkFade .4s ease both",
      }}
    >
      <style>{`
        @keyframes bkFade{from{opacity:0}to{opacity:1}}
        @keyframes bkRise{from{opacity:0;transform:translateY(16px) scale(.97)}to{opacity:1;transform:none}}
        @keyframes bkBeat{0%,100%{transform:scale(1)}14%{transform:scale(1.13)}28%{transform:scale(1)}42%{transform:scale(1.06)}55%{transform:scale(1)}}
        @keyframes bkPulse{0%{transform:translate(-50%,-50%) scale(.7);opacity:.5}100%{transform:translate(-50%,-50%) scale(2.4);opacity:0}}
      `}</style>
      <div
        onClick={(e) => e.stopPropagation()}
        className="rounded-[28px]"
        style={{
          maxWidth: 430, width: "100%", position: "relative", textAlign: "center",
          padding: "40px 28px 26px",
          background: "radial-gradient(125% 90% at 50% 0%, #0d2114 0%, #071510 60%, #050f08 100%)",
          border: "1px solid rgba(243,146,48,0.34)",
          boxShadow: "0 0 70px rgba(243,146,48,0.14), 0 30px 90px rgba(0,0,0,0.55)",
          animation: "bkRise .55s cubic-bezier(.2,.75,.2,1) both",
        }}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute"
          style={{ top: 14, right: 16, width: 30, height: 30, borderRadius: 999, border: "1px solid rgba(168,184,171,0.3)", color: "var(--text-secondary)", background: "transparent", fontSize: 16, lineHeight: 1 }}
        >×</button>

        {/* the real Solray sun, beating */}
        <div style={{ position: "relative", width: 64, height: 64, margin: "0 auto 18px" }}>
          <span style={{ position: "absolute", left: "50%", top: "50%", width: 64, height: 64, borderRadius: "50%", border: "1px solid rgba(243,146,48,0.5)", animation: "bkPulse 2.6s ease-out infinite" }} />
          <Image
            src="/solray-sun.png"
            alt="Solray"
            width={64}
            height={64}
            unoptimized
            style={{ position: "relative", width: 64, height: 64, objectFit: "contain", animation: "bkBeat 1.25s ease-in-out infinite", filter: "drop-shadow(0 0 18px rgba(243,146,48,0.5))" }}
          />
        </div>

        <p className="font-body" style={{ fontSize: 11, letterSpacing: "0.28em", textTransform: "uppercase", color: "var(--amber)", marginBottom: 14 }}>
          {t("insight.of_the_day")}
        </p>
        <h2 className="font-heading text-text-primary" style={{ fontSize: "1.75rem", lineHeight: 1.2, fontWeight: 300, fontStyle: "italic", letterSpacing: "0.01em", marginBottom: 14 }}>
          {insight.title}
        </h2>
        <p className="font-body text-text-secondary" style={{ fontSize: 15.5, lineHeight: 1.62, maxWidth: 340, margin: "0 auto" }}>
          {insight.body}
        </p>

        {/* divider in the Oracle's wisteria, hinting where Go deeper leads */}
        <div style={{ width: 36, height: 1, background: "rgba(155,134,160,0.45)", margin: "24px auto 22px" }} />

        <button
          onClick={onAsk}
          className="w-full rounded-full transition-all active:scale-[0.98]"
          style={{ background: "linear-gradient(135deg, #9b86a0, #5a4a5e)", color: "#f5f0f6", padding: "14px", fontSize: 12, letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 600, boxShadow: "0 6px 24px rgba(155,134,160,0.25)" }}
        >
          {t("insight.go_deeper")}
        </button>
        <button
          onClick={onClose}
          className="font-body"
          style={{ marginTop: 14, fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--text-muted)", background: "transparent" }}
        >
          {t("insight.dismiss")}
        </button>
      </div>
    </div>,
    document.body
  );
}

export default function TodayPage() {
  const [forecast, setForecast] = useState<ForecastView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [visibleSections, setVisibleSections] = useState(0);
  const [insight, setInsight] = useState<PendingInsight | null>(null);
  const [showBreakthrough, setShowBreakthrough] = useState(false);
  const insightFetched = useRef(false);
  const { token } = useAuth();
  const { t, lang } = useT();
  const dateLocale = lang === "en" ? "en-GB" : lang;
  const router = useRouter();
  const backgroundFetchDone = useRef(false);

  // Refs and state for the Energy Bars share card. The card itself
  // renders into a hidden off-screen container via
  // ShareOffscreenWrapper at the bottom of this page; html2canvas
  // captures it on demand when the user taps the share icon next to
  // "Today's Vibe."
  const energyShareRef = useRef<HTMLDivElement | null>(null);
  const [energySharing, setEnergySharing] = useState(false);

  const todayDateLabel = new Date().toLocaleDateString(dateLocale, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const handleEnergyShare = async () => {
    if (energySharing) return;
    if (!energyShareRef.current) return;
    setEnergySharing(true);
    try {
      const { shareOrDownloadCard } = await import("@/lib/share-card");
      await shareOrDownloadCard({
        node: energyShareRef.current,
        filename: `solray-vibe-${todayDateLabel.replace(/[, ]+/g, "-").toLowerCase()}.png`,
        title: "Solray, Today's Vibe",
        text: "Today's energy",
      });
    } catch (err) {
      console.warn("[share] energy bars failed", err);
    } finally {
      setEnergySharing(false);
    }
  };

  // The Conscious Oracle's breakthrough: fetch once per mount. The endpoint
  // returns the most recent unsurfaced insight and marks it surfaced, so it
  // shows a single time. Silent on failure; the chat Oracle still carries it.
  useEffect(() => {
    if (!token || insightFetched.current) return;
    insightFetched.current = true;
    (async () => {
      try {
        const data = await apiFetch("/insight/pending", {}, token) as { insight: PendingInsight | null };
        if (data && data.insight) { setInsight(data.insight); setShowBreakthrough(true); }
      } catch (_) { /* non-fatal */ }
    })();
  }, [token]);

  // Mark a breakthrough seen so it never resurfaces. Fire-and-forget.
  const markInsightSeen = (id: string) => {
    if (!token) return;
    apiFetch(`/insight/${id}/seen`, { method: "POST" }, token).catch(() => {});
  };

  const dismissBreakthrough = () => {
    if (insight) markInsightSeen(insight.id);
    setShowBreakthrough(false);
  };

  const openInsightInChat = () => {
    if (!insight) return;
    markInsightSeen(insight.id);
    try {
      sessionStorage.setItem("solray_chat_prompt", JSON.stringify({
        topic: insight.title,
        question: `You left me this while I was away: "${insight.title}". ${insight.body} I want to sit with it. What do you see?`,
      }));
    } catch (_) {}
    router.push("/chat");
  };

  // Funnel event: fires the first time a user reaches /today after signup.
  // Powers the "registration → first today view" conversion measurement.
  // trackOnce uses localStorage so this is per-device-per-user, fired
  // exactly once forever.
  useEffect(() => {
    if (!token) return;
    void (async () => {
      try {
        const { trackOnce } = await import("@/lib/analytics");
        await trackOnce("today_first_view", undefined, token);
      } catch { /* ignore */ }
    })();
  }, [token]);

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
      // ignore, navigation still works, just without the seeded prompt
    }
    router.push("/chat");
  };

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

    const _d = new Date();
    const dateKey = `${_d.getFullYear()}-${String(_d.getMonth() + 1).padStart(2, "0")}-${String(_d.getDate()).padStart(2, "0")}`;
    const cacheKey = `solray_forecast_${dateKey}`;

    async function fetchAndUpdate(isBackground: boolean) {
      try {
        // Run /forecast/today and /users/me in parallel
        const [forecastData] = await Promise.all([
          apiFetch("/forecast/today", {}, token),
          apiFetch("/users/me", {}, token).then((userData) => {
            if (cancelled) return;
            if (userData.blueprint) {
              try {
                const bpCacheKey = "solray_blueprint";
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

        const parsed = parseForecastData(forecastData);

        // Cache for next load, but ONLY a complete forecast. Caching a
        // `_pending` / partial reading (e.g. during a backend outage) pins a
        // broken Today that survives reloads and silent background-refresh
        // failures. A pending state must always re-fetch fresh next time.
        try {
          if (parsed && parsed._pending !== true) {
            localStorage.setItem(cacheKey, JSON.stringify(parsed));
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
        if (parsed && parsed._pending !== true) {
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
    fetchAndUpdate(false);
    return () => { cancelled = true; };
  }, [token]);

  // Pull-to-refresh: refetch today's forecast in place. No loading skeleton,
  // existing content stays visible until the new data replaces it (so the
  // pull never blanks the screen), and we signal the gesture when settled.
  useEffect(() => {
    const onRefresh = (e: Event) => {
      const done = (e as CustomEvent).detail?.done as (() => void) | undefined;
      if (!token) { done?.(); return; }
      const _d = new Date();
      const dateKey = `${_d.getFullYear()}-${String(_d.getMonth() + 1).padStart(2, "0")}-${String(_d.getDate()).padStart(2, "0")}`;
      const cacheKey = `solray_forecast_${dateKey}`;
      (async () => {
        try {
          const data = await apiFetch("/forecast/today", {}, token);
          const parsed = parseForecastData(data);
          try {
            if (parsed && parsed._pending !== true) localStorage.setItem(cacheKey, JSON.stringify(parsed));
          } catch (_) { /* ignore storage */ }
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
      {showBreakthrough && insight && (
        <BreakthroughModal
          insight={insight}
          onAsk={openInsightInChat}
          onClose={dismissBreakthrough}
        />
      )}
      <div
        className="min-h-[100dvh] bg-forest-deep"
        style={{ paddingBottom: "calc(160px + env(safe-area-inset-bottom, 16px))" }}
      >
        {/* Header, tag on top row, title + date on row below. Prevents overlap on small screens. */}
        <div className="border-b border-forest-border/50">
          <div className="max-w-lg lg:max-w-3xl mx-auto px-5 pt-2 pb-3">
            <p className="font-body text-[12px] tracking-[0.18em] uppercase mb-1" style={{ color: "var(--amber)" }}>
              {t("today.living_by_design")}
            </p>
            <div className="relative flex items-center justify-end" style={{ height: "26px" }}>
              <h1
                className="font-heading tracking-[0.15em] text-text-primary absolute left-1/2 -translate-x-1/2"
                style={{ fontWeight: 300, fontSize: "21px" }}
              >
                SOLRAY
              </h1>
              <span className="font-body text-text-secondary text-[12px]">{today}</span>
            </div>
          </div>
        </div>

        {loading ? (
          // Beautiful skeleton instead of spinner
          <SkeletonToday />
        ) : forecast && forecast._pending === true ? (
          // AI reading not yet generated for today, but the live sky IS
          // available. Honest "your reading is being written" state with
          // the real planet positions visible. Never shows invented
          // tags, energy, or reading copy.
          <PendingTodayState planets={forecast.planets} />
        ) : forecast ? (
          <>
            {/* HERO IMAGE CARD, card style, with padding like CurrentCycles */}
            <div
              className="max-w-lg lg:max-w-3xl mx-auto px-5 pt-3 transition-all duration-700"
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

            {/* MOON CYCLE BAR, below hero */}
            <div className="max-w-lg lg:max-w-3xl mx-auto px-5 mt-4">
              <MoonCycleBar planets={forecast.planets} />
            </div>

            {/* Below fold content */}
            <div className="max-w-lg lg:max-w-3xl mx-auto px-5">
              {/* Subtle offline/error notice */}
              {error && (
                <div className="mt-4 px-3 py-2 rounded-lg border border-forest-border/40 bg-forest-card/30">
                  <p className="text-text-secondary/60 text-[12px] font-body text-center">{t(error)}</p>
                </div>
              )}

              {/* ENERGY BARS, the daily ritual. Hairline ink-lines,
                  each row fades in on its own clock at 80ms stagger. */}
              <div className="mt-14 mb-12">
                {/* Parallel label to "Today's Weather" on the hero card,
                    with a quiet share icon at the right edge so the
                    energy reading is shareable as a Spotify-Wrapped
                    style card. */}
                <div
                  className="flex items-center justify-between mb-7 transition-opacity duration-700"
                  style={{ opacity: visibleSections >= 2 ? 0.85 : 0 }}
                >
                  <p className="font-body text-text-secondary text-[12px] tracking-[0.22em] uppercase">
                    {t("today.vibe")}
                  </p>
                  <button
                    onClick={handleEnergyShare}
                    aria-label={t("today.share_vibe")}
                    disabled={energySharing}
                    className="w-7 h-7 rounded-full flex items-center justify-center transition-all hover:opacity-90 active:scale-95 disabled:opacity-50"
                    style={{
                      background: "transparent",
                      border: "1px solid rgba(243,146,48,0.30)",
                    }}
                  >
                    {energySharing ? (
                      <span
                        className="inline-block w-3 h-3 border-2 rounded-full animate-spin"
                        style={{ borderColor: "rgba(243,146,48,0.30)", borderTopColor: "var(--amber)" }}
                      />
                    ) : (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--amber)", opacity: 0.85 }}>
                        <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-7" />
                        <polyline points="16 6 12 2 8 6" />
                        <line x1="12" y1="2" x2="12" y2="15" />
                      </svg>
                    )}
                  </button>
                </div>
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
                <p className="font-body text-text-secondary text-[12px] tracking-[0.22em] uppercase mb-4">
                  {t("today.dimensions")}
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

              {/* PLANET STRIP, live cosmic ticker */}
              <div
                className="mb-6 transition-all duration-700"
                style={{
                  opacity: visibleSections >= 5 ? 1 : 0,
                  transform: visibleSections >= 5 ? "translateY(0)" : "translateY(8px)",
                }}
              >
                <p className="font-body text-text-secondary text-[12px] tracking-[0.22em] uppercase mb-3">
                  {t("today.sky_now")}
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
          // Total fetch failure with no cache. Honest error state, no
          // invented forecast content. Refresh button kicks the user
          // back into the load path so they can retry without leaving.
          <div className="max-w-lg lg:max-w-3xl mx-auto px-5 pt-24 text-center">
            <p className="font-heading text-text-primary text-2xl mb-4" style={{ fontWeight: 300 }}>
              {t("today.sky_quiet")}
            </p>
            <p className="text-text-secondary font-body text-[15px] leading-relaxed mb-8">
              {error ? t(error) : t("today.error_no_reading")}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="inline-block px-8 py-3 rounded-full text-[11px] tracking-[0.3em] uppercase transition-all"
              style={{
                background: "var(--amber, #f39230)",
                color: "var(--bg-deep, #050f08)",
              }}
            >
              {t("common.retry")}
            </button>
          </div>
        )}

      </div>

      {/* Off-screen render of the Energy Bars share card. Mounts only
          when forecast data is loaded; html2canvas captures it on
          demand when the share button on the "Today's Vibe" header is
          tapped. Sibling of the page chrome so refs land cleanly. */}
      {forecast && forecast._pending !== true && (
        <ShareOffscreenWrapper containerRef={energyShareRef}>
          <EnergyBarsCard
            data={{
              dateLabel: todayDateLabel,
              energy: (forecast as ForecastData).energy,
            }}
          />
        </ShareOffscreenWrapper>
      )}
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
  const { t } = useT();
  const phase = getMoonPhaseValue();
  const moonSign = planets.find(p => p.name === "Moon")?.sign || "";
  const phaseLabelEn = getMoonPhaseLabel(phase);
  // Map the English phase label to a stable i18n key.
  const phaseKey = phaseLabelEn.toLowerCase().replace(/\s+/g, "_");
  const phaseLabel = t(`moon.phase_${phaseKey}`);
  const phaseEmoji = getMoonEmoji(phase);
  const illumination = Math.round(Math.sin(phase * Math.PI) * 100);
  const moonSignLabel = moonSign ? t(`signs.${moonSign.toLowerCase()}`) : "";

  return (
    <div className="bg-forest-card/40 border border-forest-border/50 rounded-2xl p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">{phaseEmoji}</span>
          <div>
            <p className="font-body text-text-primary text-[15px] font-medium">{phaseLabel}</p>
            {moonSign && (
              <p className="font-body text-text-secondary text-[12px]">{t("moon.moon_in")} {moonSignLabel}</p>
            )}
          </div>
        </div>
        <div className="text-right">
          <p className="font-heading text-amber-sun text-[15px]">{illumination}%</p>
          <p className="font-body text-text-secondary text-[12px]">{t("moon.illuminated")}</p>
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
          <span className="font-body text-text-secondary/60 text-[11px]">{t("moon.abbr_new")}</span>
          <span className="font-body text-text-secondary/60 text-[11px]">{t("moon.abbr_first_q")}</span>
          <span className="font-body text-text-secondary/60 text-[11px]">{t("moon.abbr_full")}</span>
          <span className="font-body text-text-secondary/60 text-[11px]">{t("moon.abbr_third_q")}</span>
          <span className="font-body text-text-secondary/60 text-[11px]">{t("moon.abbr_new")}</span>
        </div>
      </div>
    </div>
  );
}
