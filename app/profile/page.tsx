"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import AstroGeography from "@/components/AstroGeography";
import NatalWheel from "@/components/NatalWheel";
import BodyGraph from "@/components/BodyGraph";
import { planetText, GLYPH_FONT_FAMILY } from "@/components/AstroGlyphs";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";

// Types

interface RadarValues {
  fire: number;
  earth: number;
  air: number;
  water: number;
  cardinal: number;
  fixed: number;
  mutable: number;
}

interface NatalAspect {
  planet1: string;
  planet2: string;
  aspect: string;
  orb: number;
}

interface ProfileData {
  name: string;
  handle: string;
  sunSign: string;
  moonSign: string;
  risingSign: string;
  hdType: string;
  hdProfile: string;
  authority: string;
  incarnationCross: string;
  lifesWorkGate: number;
  lifesWorkGift: string;
  lifesWorkShadow: string;
  evolutionGate: number;
  evolutionGift: string;
  evolutionShadow: string;
  radar: RadarValues;        // proportional percentages — for bar legend
  radarDisplay: RadarValues; // max-normalized per group — for spider shape
  aspects: NatalAspect[];
}

// Sign sets

const FIRE_SIGNS = new Set(["Aries", "Leo", "Sagittarius"]);
const EARTH_SIGNS = new Set(["Taurus", "Virgo", "Capricorn"]);
const AIR_SIGNS = new Set(["Gemini", "Libra", "Aquarius"]);
const WATER_SIGNS = new Set(["Cancer", "Scorpio", "Pisces"]);
const CARDINAL_SIGNS = new Set(["Aries", "Cancer", "Libra", "Capricorn"]);
const FIXED_SIGNS = new Set(["Taurus", "Leo", "Scorpio", "Aquarius"]);
const MUTABLE_SIGNS = new Set(["Gemini", "Virgo", "Sagittarius", "Pisces"]);

function clamp(v: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, v));
}

const POINTS_PER_PLANET = 14;
const POINTS_PER_ANGLE = 20;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function computeRadar(blueprint: any): RadarValues {
  const natal = blueprint?.astrology?.natal ?? {};
  const planets = natal?.planets ?? {};

  // Element + modality counting (raw points)
  const counts = { fire: 0, earth: 0, air: 0, water: 0, cardinal: 0, fixed: 0, mutable: 0 };

  function addSign(sign: string, weight: number) {
    if (FIRE_SIGNS.has(sign)) counts.fire += weight;
    else if (EARTH_SIGNS.has(sign)) counts.earth += weight;
    else if (AIR_SIGNS.has(sign)) counts.air += weight;
    else if (WATER_SIGNS.has(sign)) counts.water += weight;
    if (CARDINAL_SIGNS.has(sign)) counts.cardinal += weight;
    else if (FIXED_SIGNS.has(sign)) counts.fixed += weight;
    else if (MUTABLE_SIGNS.has(sign)) counts.mutable += weight;
  }

  // Regular planets
  Object.values(planets as Record<string, { sign?: string }>).forEach((p) => {
    addSign(p?.sign ?? "", POINTS_PER_PLANET);
  });

  // ASC and MC (higher weight)
  const ascSign = (natal?.ascendant as Record<string, string> | undefined)?.sign ?? "";
  const mcSign = (natal?.mc as Record<string, string> | undefined)?.sign ?? "";
  if (ascSign) addSign(ascSign, POINTS_PER_ANGLE);
  if (mcSign) addSign(mcSign, POINTS_PER_ANGLE);

  // Proportional partition: elements share 100% of the element total,
  // modalities share 100% of the modality total. No single element can
  // be 100% unless it literally accounts for every point in the chart.
  const totalElement = counts.fire + counts.earth + counts.air + counts.water || 1;
  const totalModality = counts.cardinal + counts.fixed + counts.mutable || 1;

  return {
    fire: clamp(Math.round((counts.fire / totalElement) * 100)),
    earth: clamp(Math.round((counts.earth / totalElement) * 100)),
    air: clamp(Math.round((counts.air / totalElement) * 100)),
    water: clamp(Math.round((counts.water / totalElement) * 100)),
    cardinal: clamp(Math.round((counts.cardinal / totalModality) * 100)),
    fixed: clamp(Math.round((counts.fixed / totalModality) * 100)),
    mutable: clamp(Math.round((counts.mutable / totalModality) * 100)),
  };
}

// Max-normalized radar values — used only for the spider chart shape.
// Within each group (elements, modalities) the dominant axis reaches 100%,
// giving the polygon a full, readable shape regardless of how balanced the chart is.
function computeRadarDisplay(proportional: RadarValues): RadarValues {
  const maxE = Math.max(proportional.fire, proportional.earth, proportional.air, proportional.water, 1);
  const maxM = Math.max(proportional.cardinal, proportional.fixed, proportional.mutable, 1);
  return {
    fire:     clamp(Math.round((proportional.fire / maxE) * 100)),
    earth:    clamp(Math.round((proportional.earth / maxE) * 100)),
    air:      clamp(Math.round((proportional.air / maxE) * 100)),
    water:    clamp(Math.round((proportional.water / maxE) * 100)),
    cardinal: clamp(Math.round((proportional.cardinal / maxM) * 100)),
    fixed:    clamp(Math.round((proportional.fixed / maxM) * 100)),
    mutable:  clamp(Math.round((proportional.mutable / maxM) * 100)),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseProfile(blueprint: any): ProfileData {
  const natal = blueprint?.astrology?.natal ?? {};
  const hd = blueprint?.human_design ?? {};
  const gk = blueprint?.gene_keys ?? {};
  const user = blueprint?.user ?? {};
  // Name and username stored in cache with underscore prefix
  const _cachedName = blueprint?._name || "";
  const _cachedUsername = blueprint?._username || "";

  const sunSign = natal?.planets?.Sun?.sign ?? "";
  const moonSign = natal?.planets?.Moon?.sign ?? "";
  const risingSign = natal?.ascendant?.sign ?? "";

  let lifesWork = { gate: 64, gift: "Imagination", shadow: "Confusion" };
  let evolution = { gate: 63, gift: "Inquiry", shadow: "Doubt" };

  if (gk.lifes_work) {
    lifesWork = { gate: gk.lifes_work.gate ?? 64, gift: gk.lifes_work.gift ?? "", shadow: gk.lifes_work.shadow ?? "" };
  } else if (gk.natal_gene_keys) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vals = Object.values(gk.natal_gene_keys as Record<string, any>).sort((a: any, b: any) => a.gate - b.gate);
    if (vals[0]) lifesWork = { gate: vals[0].gate, gift: vals[0].gift ?? "", shadow: vals[0].shadow ?? "" };
    if (vals[1]) evolution = { gate: vals[1].gate, gift: vals[1].gift ?? "", shadow: vals[1].shadow ?? "" };
  }
  if (gk.evolution) {
    evolution = { gate: gk.evolution.gate ?? 63, gift: gk.evolution.gift ?? "", shadow: gk.evolution.shadow ?? "" };
  }

  const crossLabel = hd?.incarnation_cross?.name ?? hd?.incarnation_cross?.label ?? hd?.incarnation_cross ?? "";
  const name = _cachedName || user?.name || blueprint?.name || "Your Name";
  const handle = _cachedUsername || user?.handle || blueprint?.handle || user?.email?.split("@")[0] || "you";

  // Parse natal aspects with orb filtering
  const MAJOR_ASPECTS = new Set(["trine", "sextile", "conjunction", "opposition", "square"]);
  const rawAspects: NatalAspect[] = blueprint?.astrology?.natal?.aspects ?? [];
  const aspects = rawAspects.filter((a) => {
    const type = a.aspect?.toLowerCase() ?? "";
    if (MAJOR_ASPECTS.has(type)) return a.orb <= 8;
    if (type === "quincunx") return a.orb <= 3;
    return a.orb <= 2;
  });

  return {
    name,
    handle,
    sunSign,
    moonSign,
    risingSign,
    hdType: hd?.type ?? "",
    hdProfile: hd?.profile ?? "",
    authority: hd?.authority ?? "",
    incarnationCross: typeof crossLabel === "string" ? crossLabel : String(crossLabel),
    lifesWorkGate: lifesWork.gate,
    lifesWorkGift: lifesWork.gift,
    lifesWorkShadow: lifesWork.shadow,
    evolutionGate: evolution.gate,
    evolutionGift: evolution.gift,
    evolutionShadow: evolution.shadow,
    radar: computeRadar(blueprint),
    radarDisplay: computeRadarDisplay(computeRadar(blueprint)),
    aspects,
  };
}

// SVG Icons

function IconSignOut({ color = "currentColor" }: { color?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

// Subtle six-point star for the subscription entry. Line-only so it matches
// the rest of the profile footer rather than calling for the eye.
function IconStar({ color = "currentColor" }: { color?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v18" />
      <path d="M3 12h18" />
      <path d="M5.6 5.6l12.8 12.8" />
      <path d="M18.4 5.6L5.6 18.4" />
    </svg>
  );
}

// Soul Map Radar — 7 axes, heptagonal polygon

const SOUL_AXIS_KEYS: (keyof RadarValues)[] = ["fire", "earth", "air", "water", "cardinal", "fixed", "mutable"];
const SOUL_AXIS_LABELS = ["Fire", "Earth", "Air", "Water", "Cardinal", "Fixed", "Mutable"] as const;

function getPoint7(cx: number, cy: number, radius: number, index: number): [number, number] {
  const angle = (Math.PI * 2 * index) / 7 - Math.PI / 2;
  return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
}

function heptPolygonPoints(values: number[], cx: number, cy: number, maxR: number): string {
  const n = values.length;
  return values.map((v, i) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const r = (v / 100) * maxR;
    return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
  }).join(" ");
}

function heptGridPolygon(cx: number, cy: number, radius: number): string {
  return Array.from({ length: 7 }, (_, i) => {
    const [x, y] = getPoint7(cx, cy, radius, i);
    return `${x},${y}`;
  }).join(" ");
}

function useAnimatedProgress(delay: number): number {
  const [progress, setProgress] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const DURATION = 800;

  useEffect(() => {
    const timeout = setTimeout(() => {
      function animate(ts: number) {
        if (startRef.current === null) startRef.current = ts;
        const elapsed = ts - startRef.current;
        const t = Math.min(elapsed / DURATION, 1);
        setProgress(1 - Math.pow(1 - t, 3));
        if (t < 1) rafRef.current = requestAnimationFrame(animate);
      }
      rafRef.current = requestAnimationFrame(animate);
    }, 150 + delay);
    return () => {
      clearTimeout(timeout);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [delay]);

  return progress;
}

interface SoulMapRadarChartProps {
  radar: RadarValues;        // proportional % — drives bar legend
  radarDisplay: RadarValues; // max-normalized — drives spider shape
}

// Element color mapping for Soul Map
const ELEMENT_COLORS: Record<string, string> = {
  Fire:     "#d47a52", // ember-red
  Earth:    "#8a9e66", // moss
  Air:      "#9babb9", // mist
  Water:    "#6a8692", // slate
  Cardinal: "#f39230", // ember (initiating, outward)
  Fixed:    "#9b86a0", // wisteria (holding, inward)
  Mutable:  "#8a9e8d", // sage (adapting, fluid)
};

function SoulMapRadarChart({ radar, radarDisplay }: SoulMapRadarChartProps) {
  const progress = useAnimatedProgress(0);

  const OUTER = 112;
  const LABEL_PAD = 54;
  const TOTAL = OUTER * 2 + LABEL_PAD * 2;
  const cx = TOTAL / 2;
  const cy = TOTAL / 2;
  const gridLevels = [25, 50, 75, 100];

  // Spider uses max-normalized display values so the shape always fills the chart
  const displayValues = SOUL_AXIS_KEYS.map((key) => radarDisplay[key]);
  const animatedValues = displayValues.map((v) => v * progress);



  return (
    <svg
      width={TOTAL}
      height={TOTAL}
      viewBox={`0 0 ${TOTAL} ${TOTAL}`}
      className="w-full max-w-[360px] mx-auto"
      aria-label="Soul Map radar chart"
    >
      <defs>
        <radialGradient id="soulMapGlow" cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor="rgba(122, 138, 154,0.08)" />
          <stop offset="100%" stopColor="rgba(122, 138, 154,0)" />
        </radialGradient>
        {/* Moss green is the shared color for the Soul Map section */}
      </defs>

      {/* Radial gradient background glow */}
      <rect width={TOTAL} height={TOTAL} fill="url(#soulMapGlow)" />
      
      {/* Grid rings */}
      {gridLevels.map((level) => {
        const r = (level / 100) * OUTER;
        return (
          <polygon
            key={level}
            points={heptGridPolygon(cx, cy, r)}
            fill="none"
            stroke="#1a3020"
            strokeWidth={level === 50 ? 1.2 : 0.7}
            opacity={0.55}
          />
        );
      })}

      {/* Grid spokes */}
      {Array.from({ length: 7 }, (_, i) => {
        const [x2, y2] = getPoint7(cx, cy, OUTER, i);
        return (
          <line
            key={i}
            x1={cx} y1={cy}
            x2={x2} y2={y2}
            stroke="#1a3020"
            strokeWidth={0.7}
            opacity={0.4}
          />
        );
      })}

      {/* Reference dashed polygon at 50 (balance point) */}
      <polygon
        points={heptGridPolygon(cx, cy, (50 / 100) * OUTER)}
        fill="none"
        stroke="#8a9e8d"
        strokeWidth={1}
        strokeDasharray="4 3"
        opacity={0.30}
      />

      {/* Main moss polygon */}
      <polygon
        points={heptPolygonPoints(animatedValues, cx, cy, OUTER)}
        fill="#8a9e66"
        fillOpacity={0.22 * progress}
        stroke="#8a9e66"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeOpacity={progress}
      />

      {/* Vertex dots — positioned by display values (max-normalized) */}
      {SOUL_AXIS_KEYS.map((key, i) => {
        const r = (radarDisplay[key] / 100) * OUTER * progress;
        const [x, y] = getPoint7(cx, cy, r, i);
        return (
          <g key={key}>
            {/* Glow */}
            <circle
              cx={x}
              cy={y}
              r={5.5}
              fill="none"
              stroke="#8a9e66"
              strokeWidth={0.5}
              opacity={progress * 0.4}
            />
            {/* Main dot */}
            <circle
              cx={x}
              cy={y}
              r={3}
              fill="#8a9e66"
              opacity={progress * 0.9}
            />
          </g>
        );
      })}

      {/* Center dot */}
      <circle cx={cx} cy={cy} r={2} fill="#f39230" opacity={0.3} />

      {/* Axis labels — colored by element/modality */}
      {SOUL_AXIS_LABELS.map((label, i) => {
        const [lx, ly] = getPoint7(cx, cy, OUTER + 32, i);
        const color = ELEMENT_COLORS[label] || "#8a9e8d";
        return (
          <text
            key={label}
            x={lx}
            y={ly}
            textAnchor="middle"
            dominantBaseline="middle"
            fill={color}
            fontSize="9"
            fontFamily="Inter, system-ui, sans-serif"
            letterSpacing="0.12em"
            style={{ textTransform: "uppercase" }}
          >
            {label}
          </text>
        );
      })}
    </svg>
  );
}

// Natal Aspects

const ASPECT_CONFIG: Record<string, { symbol: string; label: string; color: string; major: boolean }> = {
  trine:          { symbol: "△",  label: "Trine",          color: "#2a9d8f", major: true },
  sextile:        { symbol: "⚹",  label: "Sextile",        color: "#8a9e8d", major: true },
  conjunction:    { symbol: "☌",  label: "Conjunction",    color: "#f39230", major: true },
  opposition:     { symbol: "☍",  label: "Opposition",     color: "#e05c5c", major: true },
  square:         { symbol: "□",  label: "Square",         color: "#d4813a", major: true },
  quincunx:       { symbol: "⚻",  label: "Quincunx",      color: "#7c6fcd", major: true },
  semi_sextile:   { symbol: "⚺",  label: "Semi-Sextile",  color: "#7a9e80", major: false },
  semi_square:    { symbol: "∠",  label: "Semi-Square",   color: "#a8b8ab", major: false },
  sesquiquadrate: { symbol: "⊼",  label: "Sesquiquadrate",color: "#a8b8ab", major: false },
  quintile:       { symbol: "Q",  label: "Quintile",       color: "#a8b8ab", major: false },
  bi_quintile:    { symbol: "bQ", label: "Bi-Quintile",    color: "#a8b8ab", major: false },
};

const MAJOR_ORDER = ["conjunction", "opposition", "trine", "square", "sextile", "quincunx"];

function NatalAspects({ aspects }: { aspects: NatalAspect[] }) {
  const [openAspects, setOpenAspects] = useState<Record<string, boolean>>({});
  const [minorOpen, setMinorOpen] = useState(false);
  const [sectionOpen, setSectionOpen] = useState(false);

  if (!aspects || aspects.length === 0) return null;

  const grouped: Record<string, NatalAspect[]> = {};
  for (const a of aspects) {
    const key = a.aspect?.toLowerCase() ?? "unknown";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(a);
  }

  const majorGroups = MAJOR_ORDER.filter((k) => grouped[k]?.length > 0);
  const minorGroups = Object.keys(grouped).filter((k) => !MAJOR_ORDER.includes(k) && grouped[k]?.length > 0);

  const toggleAspect = (key: string) => {
    setOpenAspects((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const renderPlanetPairs = (key: string, list: NatalAspect[]) => {
    const cfg = ASPECT_CONFIG[key] ?? { symbol: "·", color: "#a8b8ab" };
    return (
      <div className="mt-1 pl-6 space-y-1">
        {list.map((a, i) => (
          <div key={i} className="flex items-center justify-between py-0.5">
            <span className="font-body text-xs text-text-secondary">
              {a.planet1}{" "}
              <span style={{ color: cfg.color }}>{cfg.symbol}</span>{" "}
              {a.planet2}
            </span>
            <span className="font-body text-[10px] text-text-secondary/50 ml-4">
              {a.orb.toFixed(1)}°
            </span>
          </div>
        ))}
      </div>
    );
  };

  const renderAspectRow = (key: string, list: NatalAspect[]) => {
    const cfg = ASPECT_CONFIG[key] ?? { symbol: "·", label: key, color: "#a8b8ab", major: false };
    const isOpen = openAspects[key] ?? false;
    return (
      <div key={key}>
        <button
          onClick={() => toggleAspect(key)}
          className="w-full flex items-center gap-3 py-2.5 px-1 hover:bg-forest-card/30 rounded-lg transition-colors"
        >
          <span className="text-base w-6 text-center flex-shrink-0" style={{ color: cfg.color }}>
            {cfg.symbol}
          </span>
          <span className="font-body text-[13px] text-text-primary flex-1 text-left">
            {cfg.label}
          </span>
          <span className="font-body text-[10px] text-text-secondary/70 mr-2">
            {list.length}
          </span>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#8a9e8d"
            strokeWidth="2"
            className={`transition-transform duration-200 flex-shrink-0 ${isOpen ? "rotate-180" : ""}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        {isOpen && renderPlanetPairs(key, list)}
      </div>
    );
  };

  return (
    <div className="border border-forest-border rounded-2xl overflow-hidden mb-4">
      <button
        onClick={() => setSectionOpen(!sectionOpen)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-forest-card/50 transition-colors"
      >
        <h2 className="font-heading text-text-primary" style={{ fontSize: "1.05rem", fontWeight: 400 }}>Natal Aspects</h2>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#8a9e8d"
          strokeWidth="2"
          className={`transition-transform duration-200 ${sectionOpen ? "rotate-180" : ""}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {sectionOpen && (
        <div className="px-4 pb-4">
          <div className="space-y-0.5">
            {majorGroups.map((key) => renderAspectRow(key, grouped[key]))}
          </div>
          {minorGroups.length > 0 && (
            <div className="mt-1">
              <button
                onClick={() => setMinorOpen(!minorOpen)}
                className="w-full flex items-center gap-3 py-2.5 px-1 hover:bg-forest-card/30 rounded-lg transition-colors"
              >
                <span className="text-base w-6 text-center flex-shrink-0 text-text-secondary/50">·</span>
                <span className="font-body text-[13px] text-text-secondary flex-1 text-left">Minor Aspects</span>
                <span className="font-body text-[10px] text-text-secondary/70 mr-2">
                  {minorGroups.reduce((s, k) => s + grouped[k].length, 0)}
                </span>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#8a9e8d"
                  strokeWidth="2"
                  className={`transition-transform duration-200 flex-shrink-0 ${minorOpen ? "rotate-180" : ""}`}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {minorOpen && (
                <div className="mt-1 space-y-0.5">
                  {minorGroups.map((key) => renderAspectRow(key, grouped[key]))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Section accent colors, mapped to the Solray extended palette
const SECTION_ACCENTS: Record<string, string> = {
  "Natal Chart":     "#f39230", // ember
  "Astrocartography": "#9babb9", // mist
  "Human Design":    "#8a9e66", // moss
  "Numerology":      "#9b86a0", // wisteria
  "Gene Keys":       "#6a8692", // slate
};

function CollapsibleSection({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const accent = SECTION_ACCENTS[title] || "#8a9e8d";

  return (
    <div className="rounded-2xl border border-forest-border/50 bg-forest-card/20 overflow-hidden mb-4 transition-colors">
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-5 py-4 text-left hover:bg-forest-card/30 transition-colors"
      >
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span
              className="font-body text-[10px] tracking-[0.22em] uppercase mb-1"
              style={{ color: accent }}
            >
              {title}
            </span>
            <span className="font-body text-text-secondary/70 text-[11px]">
              {open ? "Tap to collapse" : "Tap to open"}
            </span>
          </div>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#8a9e8d"
            strokeWidth="2"
            className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </button>
      {open && <div className="px-5 pb-5">{children}</div>}
    </div>
  );
}

// Tags with colors

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-body px-3 py-1 rounded-full border border-forest-border/70 text-text-secondary/70 text-[10px] tracking-widest uppercase">
      {children}
    </span>
  );
}

function SunTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-body px-3 py-1 rounded-full border border-amber-sun/60 text-amber-sun text-[10px] tracking-[0.22em] uppercase">
      {children}
    </span>
  );
}

function HDTypeTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-body px-3 py-1 rounded-full border text-[10px] tracking-[0.22em] uppercase" style={{ color: "#9babb9", borderColor: "rgba(155,171,185,0.6)" }}>
      {children}
    </span>
  );
}

function ProfileTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-body px-3 py-1 rounded-full border text-[10px] tracking-[0.22em] uppercase" style={{ color: "#9b86a0", borderColor: "rgba(155,134,160,0.6)" }}>
      {children}
    </span>
  );
}

// Skeleton

function ProfileSkeleton() {
  return (
    <div className="max-w-lg mx-auto px-5 animate-pulse">
      <div className="pt-10 pb-8 flex flex-col items-center gap-3">
        <div className="w-20 h-20 rounded-full bg-forest-border/60" />
        <div className="h-3 w-24 bg-forest-border/60 rounded" />
        <div className="h-8 w-40 bg-forest-border/60 rounded" />
        <div className="flex gap-2 mt-2">
          <div className="h-6 w-20 bg-forest-border/60 rounded-full" />
          <div className="h-6 w-24 bg-forest-border/60 rounded-full" />
        </div>
      </div>
      <div className="flex justify-center mb-8">
        <div className="w-[280px] h-[280px] bg-forest-border/30 rounded-2xl" />
      </div>
      <div className="space-y-4">
        <div className="h-14 bg-forest-border/30 rounded-2xl" />
        <div className="h-14 bg-forest-border/30 rounded-2xl" />
      </div>
    </div>
  );
}

// Pencil icon
function IconPencil() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

// Camera icon
function IconCamera() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

// Main Page

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(false);
  const { token, logout } = useAuth();
  const router = useRouter();

  // Edit state
  const [editingName, setEditingName] = useState(false);
  const [editingHandle, setEditingHandle] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [handleInput, setHandleInput] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [savingHandle, setSavingHandle] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarSaving, setAvatarSaving] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!token) return;

    const BP_CACHE_KEY = "solray_blueprint";
    // Bump when blueprint schema changes. v4 adds _profile_photo to cache.
    const BP_CACHE_VERSION = 4;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function loadFromBlueprint(bp: any) {
      // Load avatar: prefer cache entry, fall back to solray_avatar key
      const photo = bp._profile_photo || (() => {
        try { return localStorage.getItem("solray_avatar"); } catch { return null; }
      })();
      if (photo) setAvatarUrl(photo);

      try {
        const p = parseProfile(bp);
        setProfile(p);
        setLoading(false);
        setTimeout(() => setVisible(true), 50);
      } catch {
        setLoading(false);
      }
    }

    // Try cache first — cheap path (no network call)
    try {
      const cached = localStorage.getItem(BP_CACHE_KEY);
      if (cached) {
        const bp = JSON.parse(cached);
        if ((bp._cache_version ?? 0) < BP_CACHE_VERSION) {
          localStorage.removeItem(BP_CACHE_KEY);
          // Fall through to fresh fetch below
        } else if (!bp._name) {
          apiFetch("/users/me", {}, token)
            .then((data) => {
              const bpWithUser = {
                ...bp,
                _name: data.profile?.name || data.name || "",
                _username: data.profile?.username || data.username || "",
                _profile_photo: data.profile?.profile_photo || bp._profile_photo || null,
              };
              try { localStorage.setItem(BP_CACHE_KEY, JSON.stringify(bpWithUser)); } catch (_) {}
              loadFromBlueprint(bpWithUser);
            })
            .catch(() => loadFromBlueprint(bp));
          return;
        } else {
          loadFromBlueprint(bp);
          return;
        }
      }
    } catch (_) {}

    // No cache — fetch full blueprint (first load or after cache bust)
    apiFetch("/users/me", {}, token)
      .then((data) => {
        if (data.blueprint) {
          const bpWithUser = {
            ...data.blueprint,
            _name: data.profile?.name || data.name || "",
            _username: data.profile?.username || data.username || "",
            _profile_photo: data.profile?.profile_photo || null,
            _cachedAt: Date.now(),
            _cache_version: BP_CACHE_VERSION,
          };
          try { localStorage.setItem(BP_CACHE_KEY, JSON.stringify(bpWithUser)); } catch (_) {}
          loadFromBlueprint(bpWithUser);
        } else {
          setLoading(false);
          setTimeout(() => setVisible(true), 50);
        }
      })
      .catch(() => {
        setLoading(false);
        setTimeout(() => setVisible(true), 50);
      });
  }, [token]);

  const handleSignOut = () => {
    logout();
    router.push("/login");
  };

  const initials = profile?.name ? profile.name.charAt(0).toUpperCase() : "S";

  // Save display name
  const handleSaveName = async () => {
    if (!nameInput.trim() || !token) return;
    setSavingName(true);
    setSaveError(null);
    try {
      const data = await apiFetch("/users/profile", { method: "PATCH", body: JSON.stringify({ name: nameInput.trim() }) }, token);
      setProfile((p) => p ? { ...p, name: data.name } : p);
      // Update localStorage cache so name persists
      try {
        const cached = localStorage.getItem("solray_blueprint");
        if (cached) {
          const bp = JSON.parse(cached);
          bp._name = data.name;
          localStorage.setItem("solray_blueprint", JSON.stringify(bp));
        }
      } catch (_) {}
      setEditingName(false);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "Couldn't reach the stars just now. Try again.");
    } finally {
      setSavingName(false);
    }
  };

  // Save username
  const handleSaveHandle = async () => {
    if (!handleInput.trim() || !token) return;
    setSavingHandle(true);
    setSaveError(null);
    try {
      const data = await apiFetch("/users/profile", { method: "PATCH", body: JSON.stringify({ username: handleInput.trim() }) }, token);
      setProfile((p) => p ? { ...p, handle: data.username } : p);
      // Update localStorage cache so username persists
      try {
        const cached = localStorage.getItem("solray_blueprint");
        if (cached) {
          const bp = JSON.parse(cached);
          bp._username = data.username;
          localStorage.setItem("solray_blueprint", JSON.stringify(bp));
        }
      } catch (_) {}
      setEditingHandle(false);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "Couldn't reach the stars just now. Try again.");
    } finally {
      setSavingHandle(false);
    }
  };

  // Handle avatar selection — resize to max 400px, save to server + localStorage
  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const rawBase64 = ev.target?.result as string;

      // Resize to max 400px on longest side before storing (keeps payload small)
      const img = new Image();
      img.onload = () => {
        const MAX = 400;
        const ratio = Math.min(MAX / img.width, MAX / img.height, 1);
        const canvas = document.createElement("canvas");
        canvas.width  = Math.round(img.width  * ratio);
        canvas.height = Math.round(img.height * ratio);
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const resized = canvas.toDataURL("image/jpeg", 0.82);

        // Show immediately
        setAvatarUrl(resized);
        try { localStorage.setItem("solray_avatar", resized); } catch (_) {}

        // Write photo into blueprint cache so other devices get it on next cache-bust
        try {
          const bpRaw = localStorage.getItem("solray_blueprint");
          if (bpRaw) {
            const bp = JSON.parse(bpRaw);
            localStorage.setItem("solray_blueprint", JSON.stringify({ ...bp, _profile_photo: resized }));
          }
        } catch (_) {}

        // Persist to server — read token fresh from localStorage to avoid stale closure
        const liveToken = token || (typeof localStorage !== "undefined" ? localStorage.getItem("solray_token") : null);
        if (liveToken) {
          setAvatarSaving("saving");
          apiFetch("/users/photo", { method: "PATCH", body: JSON.stringify({ photo: resized }) }, liveToken)
            .then(() => {
              setAvatarSaving("saved");
              setTimeout(() => setAvatarSaving("idle"), 3000);
            })
            .catch((err) => {
              console.error("[avatar upload] PATCH /users/photo failed:", err);
              setAvatarSaving("error");
              setTimeout(() => setAvatarSaving("idle"), 6000);
            });
        } else {
          console.warn("[avatar upload] no token available — photo saved locally only");
          setAvatarSaving("error");
          setTimeout(() => setAvatarSaving("idle"), 6000);
        }
      };
      img.src = rawBase64;
    };
    reader.readAsDataURL(file);
  };

  return (
    <ProtectedRoute>
      <div className="min-h-[100dvh] bg-forest-deep pb-28">
        {/* Header: Souls reference pattern. Tag left, SKYWALKER center, edit right. */}
        <div className="border-b border-forest-border/50">
          <div className="max-w-lg mx-auto px-5 pt-2 pb-3">
            <p className="font-body text-[10px] tracking-[0.18em] uppercase mb-1" style={{ color: "#8a9e66" }}>
              Profile
            </p>
            <div className="relative flex items-center justify-end" style={{ height: "26px" }}>
              <h1
                className="font-heading tracking-[0.15em] text-text-primary absolute left-1/2 -translate-x-1/2"
                style={{ fontWeight: 300, fontSize: "21px" }}
              >
                SKYWALKER
              </h1>
              <button
                className="text-text-secondary hover:text-amber-sun transition-colors flex items-center justify-center"
                title="Edit profile"
                aria-label="Edit profile"
                style={{ minWidth: "32px", minHeight: "32px" }}
                onClick={() => { setNameInput(profile?.name || ""); setHandleInput(profile?.handle || ""); setEditingName(true); setEditingHandle(true); setSaveError(null); }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <ProfileSkeleton />
        ) : (
          <div
            className="transition-all duration-700"
            style={{
              opacity: visible ? 1 : 0,
              transform: visible ? "translateY(0)" : "translateY(16px)",
            }}
          >
            <div className="max-w-lg mx-auto px-5">
              {/* Avatar + Identity */}
              <div className="pt-6 pb-5 flex flex-col items-center gap-2 relative overflow-hidden">
                {/* Contextual sun-sign planet image: very subtle ambient wash behind the avatar */}
                {profile?.sunSign && (() => {
                  const sunSignPlanetImages: Record<string, string> = {
                    // Fire signs
                    Aries:       "https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=800&q=60", // Mars — thunderhead
                    Leo:         "https://images.unsplash.com/photo-1506318137071-a8e063b4bec0?w=800&q=60", // Sun — warm light
                    Sagittarius: "https://images.unsplash.com/photo-1534088568595-a066f410bcda?w=800&q=60", // Jupiter — storm clouds
                    // Earth signs
                    Taurus:      "https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=800&q=60", // Venus — ocean
                    Virgo:       "https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=800&q=60", // Mercury — silver haze
                    Capricorn:   "https://images.unsplash.com/photo-1454789548928-9efd52dc4031?w=800&q=60", // Saturn — cold stars
                    // Air signs
                    Gemini:      "https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=800&q=60", // Mercury
                    Libra:       "https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=800&q=60", // Venus
                    Aquarius:    "https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=800&q=60", // Uranus — deep space
                    // Water signs
                    Cancer:      "https://images.unsplash.com/photo-1532693322450-2cb5c511067d?w=800&q=60", // Moon
                    Scorpio:     "https://images.unsplash.com/photo-1608178398319-48f814d0750c?w=800&q=60", // Pluto — dark cosmos
                    Pisces:      "https://images.unsplash.com/photo-1501854140801-50d01698950b?w=800&q=60", // Neptune — misty sea
                  };
                  const imgSrc = sunSignPlanetImages[profile.sunSign];
                  if (!imgSrc) return null;
                  return (
                    <div className="absolute inset-x-0 -top-6 h-48 pointer-events-none">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={imgSrc} alt="" aria-hidden="true" className="absolute inset-0 w-full h-full object-cover" style={{ opacity: 0.06 }} />
                      <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(5,15,8,0.55) 0%, rgba(5,15,8,1) 100%)" }} />
                    </div>
                  );
                })()}

                {/* Avatar with camera overlay */}
                <div className="relative mb-1 z-10">
                  {/* Soft single-tone ring, no gradient */}
                  <div
                    className="absolute -inset-[2px] rounded-full"
                    style={{ border: "1px solid rgba(243,146,48,0.35)", zIndex: -1 }}
                  />
                  <div
                    className="w-20 h-20 rounded-full flex items-center justify-center text-3xl font-heading text-forest-deep font-semibold overflow-hidden relative bg-forest-deep"
                  >
                    {avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      initials
                    )}
                  </div>
                  <button
                    onClick={() => avatarInputRef.current?.click()}
                    className="absolute bottom-0 right-0 w-7 h-7 rounded-full flex items-center justify-center border border-forest-border"
                    style={{ background: "#0a1f12", color: "#8a9e8d" }}
                    title="Change profile picture"
                  >
                    <IconCamera />
                  </button>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarChange}
                  />
                </div>
                {/* Upload status */}
                {avatarSaving === "saving" && (
                  <p className="font-body text-[10px] tracking-widest uppercase mt-2" style={{ color: "#8a9e8d" }}>saving...</p>
                )}
                {avatarSaving === "saved" && (
                  <p className="font-body text-[10px] tracking-widest uppercase mt-2" style={{ color: "#6b9a72" }}>saved</p>
                )}
                {avatarSaving === "error" && (
                  <p className="font-body text-[11px] tracking-widest uppercase mt-2" style={{ color: "#c87c6a", fontWeight: 600 }}>photo not saved. check connection.</p>
                )}

                {/* Handle (username) — with relative z positioning for gradient overlay */}
                <div className="relative z-10">
                {editingHandle ? (
                  <div className="flex items-center gap-2">
                    <span className="font-body text-text-secondary text-[10px] tracking-widest uppercase">@</span>
                    <input
                      className="bg-forest-card border border-forest-border rounded-lg px-2 py-1 font-body text-[13px] text-text-primary focus:outline-none focus:border-amber-sun/60"
                      value={handleInput}
                      onChange={(e) => setHandleInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleSaveHandle(); if (e.key === "Escape") setEditingHandle(false); }}
                      autoFocus
                    />
                    <button onClick={handleSaveHandle} disabled={savingHandle} className="font-body text-[10px] px-2 py-1 rounded border border-amber-sun/40 text-amber-sun/80">
                      {savingHandle ? "…" : "Save"}
                    </button>
                    <button onClick={() => setEditingHandle(false)} className="font-body text-[10px] text-text-secondary">Cancel</button>
                  </div>
                ) : (
                  profile?.handle && (
                    <p className="font-body text-text-secondary text-[10px] tracking-widest uppercase">
                      @{profile.handle}
                    </p>
                  )
                )}
                </div>

                {/* Display name */}
                <div className="relative z-10">
                {editingName ? (
                  <div className="flex items-center gap-2">
                    <input
                      className="bg-forest-card border border-forest-border rounded-lg px-3 py-1.5 font-heading text-text-primary focus:outline-none focus:border-amber-sun/60 text-center"
                      style={{ fontSize: "1.05rem", fontWeight: 400 }}
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleSaveName(); if (e.key === "Escape") setEditingName(false); }}
                      autoFocus
                    />
                    <button onClick={handleSaveName} disabled={savingName} className="font-body text-[10px] px-2 py-1 rounded border border-amber-sun/40 text-amber-sun/80">
                      {savingName ? "…" : "Save"}
                    </button>
                    <button onClick={() => setEditingName(false)} className="font-body text-[10px] text-text-secondary">Cancel</button>
                  </div>
                ) : (
                    <h1
                      className="font-heading text-text-primary leading-tight text-center"
                      style={{ fontSize: "1.05rem", fontWeight: 400, letterSpacing: "-0.01em" }}
                    >
                      {profile?.name || "Your Name"}
                    </h1>
                  )}

                  {saveError && (
                    <p className="font-body text-ember text-[10px]">{saveError}</p>
                  )}
                </div>

                {profile && (
                  <div className="flex flex-wrap justify-center gap-2 mt-2 relative z-10">
                    {profile.sunSign && <SunTag>{profile.sunSign} Sun</SunTag>}
                    {profile.hdType && <HDTypeTag>{profile.hdType}</HDTypeTag>}
                    {profile.hdProfile && <ProfileTag>{profile.hdProfile}</ProfileTag>}
                  </div>
                )}
              </div>

              {/* Greeting-style intro, same rhythm as chat + souls */}
              <div className="flex flex-col items-center text-center pt-2 pb-6">
                <p
                  className="font-heading text-text-primary/80 leading-relaxed max-w-[280px]"
                  style={{ fontSize: "1.15rem", fontWeight: 300, fontStyle: "italic", letterSpacing: "0.01em" }}
                >
                  Your whole blueprint, in one place. Open any section to go deeper.
                </p>
                <div className="mt-5 w-12 h-px bg-forest-border/60" />
              </div>

              {/* Soul Map */}
              <div className="mb-6">
                <p className="font-body text-text-secondary text-[10px] tracking-[0.22em] uppercase mb-4 text-center" style={{ color: "#8a9e66" }}>
                  Soul Map
                </p>

                {profile ? (
                  <div className="relative rounded-2xl overflow-hidden mb-4">
                    {/* Glow background layer */}
                    <div className="absolute inset-0 bg-forest-card/40" style={{ background: "radial-gradient(ellipse at center, rgba(122, 138, 154,0.12) 0%, rgba(125, 102, 128,0.06) 40%, transparent 70%)" }} />
                    {/* Content */}
                    <div className="relative border border-forest-border/50 rounded-2xl p-4 bg-forest-card/40 backdrop-blur-sm">
                    <SoulMapRadarChart radar={profile.radar} radarDisplay={profile.radarDisplay} />

                      {/* Quiet caption instead of a dev-style legend */}
                      <p className="mt-3 font-body text-text-secondary/60 text-[10px] tracking-[0.15em] uppercase text-center">
                        The dashed ring is balance
                      </p>

                      {/* Mini bar legend — all 7 dimensions with values and colored bars */}
                      <div className="mt-4 space-y-2 px-1">
                        {SOUL_AXIS_KEYS.map((key, i) => {
                          const val = profile.radar[key];
                          const label = SOUL_AXIS_LABELS[i];
                          const barColor = ELEMENT_COLORS[label] || "#8a9e8d";
                          return (
                            <div key={key} className="flex items-center gap-2">
                              <span className="font-body text-text-secondary/80 text-[10px] tracking-widest uppercase w-20 shrink-0" style={{ color: barColor }}>
                                {label}
                              </span>
                              <div className="flex-1 h-1.5 rounded-full bg-forest-border/40 overflow-hidden">
                                <div
                                  className="h-full rounded-full"
                                  style={{
                                    width: `${val}%`,
                                    background: `linear-gradient(to right, ${barColor}, transparent)`,
                                  }}
                                />
                              </div>
                              <span className="font-body text-text-secondary/70 text-[10px] w-7 text-right shrink-0">
                                {val}%
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-forest-card/40 border border-forest-border/50 rounded-2xl p-8 text-center">
                    <p className="font-body text-text-secondary text-[13px] leading-relaxed">
                      Complete your birth data to unlock your Soul Map
                    </p>
                  </div>
                )}
              </div>

              {/* Full Blueprint — merged from chart page */}
              {profile && <BlueprintSections token={token} aspects={profile.aspects} />}

              {/* Subscription + Sign Out: quiet, centered text links */}
              <div className="mt-6 mb-8 flex flex-col items-center gap-4">
                <button
                  onClick={() => router.push("/subscribe")}
                  className="font-body text-text-secondary/60 text-[10px] tracking-[0.22em] uppercase hover:text-text-secondary transition-colors flex items-center gap-2"
                >
                  <IconStar />
                  Subscription
                </button>
                <button
                  onClick={handleSignOut}
                  className="font-body text-text-secondary/60 text-[10px] tracking-[0.22em] uppercase hover:text-text-secondary transition-colors flex items-center gap-2"
                >
                  <IconSignOut />
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </ProtectedRoute>
  );
}

// ---------------------------------------------------------------------------
// Blueprint Sections (merged from chart page)
// ---------------------------------------------------------------------------

// Two-letter planet abbreviations, no unicode glyphs (those render as emoji
// on many platforms, which conflicts with Solray's no-emoji rule).
const PLANET_SYMBOLS: Record<string, string> = {
  Sun: "Su", Moon: "Mo", Mercury: "Me", Venus: "Ve", Mars: "Ma",
  Jupiter: "Ju", Saturn: "Sa", Uranus: "Ur", Neptune: "Ne", Pluto: "Pl",
  NorthNode: "Nd", Chiron: "Ch", Ceres: "Ce", ASC: "As",
};

function formatDegree(d: number): string {
  const deg = Math.floor(d);
  const min = Math.round((d - deg) * 60);
  return `${deg}°${String(min).padStart(2, "0")}'`;
}

const HD_TYPE_MEANINGS: Record<string, string> = {
  "Generator": "You're built to respond. Your energy is sustainable when you love what you do.",
  "Manifesting Generator": "You're built to respond and move fast. Multiple things at once is your nature.",
  "Projector": "You're built to guide. Wait for the invitation before sharing your wisdom.",
  "Manifestor": "You're built to initiate. Inform the people around you before you act.",
  "Reflector": "You're a mirror for your community. You need a full lunar cycle before major decisions.",
};

const HD_AUTHORITY_MEANINGS: Record<string, string> = {
  "Sacral": "Your gut knows before your mind does. The yes or no in your body is your truth.",
  "Emotional": "You need time. Never decide in the heat or the low. Clarity comes in waves.",
  "Solar Plexus": "You need time. Never decide in the heat or the low. Clarity comes in waves.",
  "Splenic": "A quiet whisper in the moment. It only speaks once. Trust the first feeling.",
  "Self-Projected": "Talk it through out loud. Your truth emerges in your own voice.",
  "Mental / Sounding Board": "Discuss it with people you trust. The answer comes through conversation.",
  "Ego": "You know what you want when you commit from the heart. Only commit when it's real.",
  "Lunar": "You reflect your environment. One full moon cycle before any major decision.",
};

const HD_PROFILE_MEANINGS: Record<string, string> = {
  "1/3": "Investigator / Martyr. You learn by researching and by trial and error.",
  "1/4": "Investigator / Opportunist. You build through deep foundations and trusted networks.",
  "2/4": "Hermit / Opportunist. You need solitude to develop mastery, then your network calls you out.",
  "2/5": "Hermit / Heretic. You need alone time but people project practical solutions onto you.",
  "3/5": "Martyr / Heretic. You learn through experience and are seen as a practical problem-solver.",
  "3/6": "Martyr / Role Model. First half of life: trial and error. Second half: becoming the example.",
  "4/6": "Opportunist / Role Model. Your network is everything. You become a trusted authority.",
  "5/1": "Heretic / Investigator. People project savior qualities onto you.",
  "5/2": "Heretic / Hermit. Called out of solitude to solve others' problems.",
  "6/2": "Role Model / Hermit. Three life phases: trial, retreat, role model.",
  "6/3": "Role Model / Martyr. Experience-driven. You live it before you teach it.",
};

function normaliseCentreName(key: string): string {
  const MAP: Record<string, string> = {
    G: "G Centre", SolarPlexus: "Solar Plexus", Head: "Head", Ajna: "Ajna",
    Throat: "Throat", Heart: "Heart / Ego", Sacral: "Sacral", Spleen: "Spleen", Root: "Root",
  };
  return MAP[key] ?? key;
}

function HDRow({ label, value, meaning }: { label: string; value: string; meaning?: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="font-body text-text-secondary text-[10px] tracking-widest uppercase w-24 shrink-0 pt-0.5">{label}</span>
      <div className="flex-1">
        <span className="font-body text-text-primary text-[13px]">{value}</span>
        {meaning && <p className="font-body text-text-secondary/50 text-[10px] leading-snug mt-0.5">{meaning}</p>}
      </div>
    </div>
  );
}

function GKPill({ label, value, color, style }: { label: string; value: string; color: string; style?: React.CSSProperties }) {
  return (
    <div className="text-center">
      <p className="font-body text-text-secondary text-[10px] tracking-widest uppercase mb-1">{label}</p>
      <p className={`font-heading ${color}`} style={{ fontSize: "1.05rem", fontWeight: 400, ...style }}>{value}</p>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseBlueprintForChart(blueprint: any) {
  const natal = blueprint?.astrology?.natal;
  const hd = blueprint?.human_design;
  const gk = blueprint?.gene_keys;
  const numRaw = blueprint?.numerology;

  const planetsRaw: { planet: string; symbol: string; sign: string; degree: string; longitude: number; house: number; retrograde?: boolean }[] = [];
  if (natal?.planets) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const [name, data] of Object.entries(natal.planets as Record<string, any>)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = data as any;
      if (!d.sign || d.sign === 'Unknown' || d.longitude === null) continue;
      planetsRaw.push({ planet: name, symbol: PLANET_SYMBOLS[name] ?? "●", sign: d.sign, degree: formatDegree(d.degree), longitude: d.longitude, house: d.house, retrograde: d.retrograde });
    }
  }
  if (natal?.ascendant) {
    planetsRaw.push({ planet: "ASC", symbol: "↑", sign: natal.ascendant.sign, degree: formatDegree(natal.ascendant.degree), longitude: natal.ascendant.longitude, house: 1 });
  }

  const ascLongitude: number | null = natal?.ascendant?.longitude ?? null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const houseCusps: number[] = Array.isArray(natal?.house_cusps)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? (natal.house_cusps as any[]).map((h) => (typeof h === "number" ? h : h?.longitude)).filter((n) => typeof n === "number")
    : [];

  const keyChannels: string[] = hd?.defined_channels
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? (hd.defined_channels as Array<any>).map((ch: any) => {
        if (Array.isArray(ch)) return `Channel ${ch[0]}-${ch[1]}: ${ch[2]}`;
        if (ch && typeof ch === 'object') return `Channel ${ch.gate_a}-${ch.gate_b}: ${ch.name}`;
        return String(ch);
      })
    : [];

  let definedCentres: string[] = [];
  let undefinedCentres: string[] = [];
  if (hd?.defined_centres) {
    if (Array.isArray(hd.defined_centres)) {
      definedCentres = hd.defined_centres.map(normaliseCentreName);
    } else if (typeof hd.defined_centres === 'object') {
      definedCentres = Object.entries(hd.defined_centres).filter(([,v]) => v).map(([k]) => normaliseCentreName(k));
      undefinedCentres = Object.entries(hd.defined_centres).filter(([,v]) => !v).map(([k]) => normaliseCentreName(k));
    }
  }

  const PROFILE_NAMES: Record<string, string> = {
    "1/3": "Investigator / Martyr", "1/4": "Investigator / Opportunist",
    "2/4": "Hermit / Opportunist", "2/5": "Hermit / Heretic",
    "3/5": "Martyr / Heretic", "3/6": "Martyr / Role Model",
    "4/1": "Opportunist / Investigator", "4/6": "Opportunist / Role Model",
    "5/1": "Heretic / Investigator", "5/2": "Heretic / Hermit",
    "6/2": "Role Model / Hermit", "6/3": "Role Model / Martyr",
  };
  const rawProfile = hd?.profile ?? "";
  const profileDisplay = rawProfile && PROFILE_NAMES[rawProfile] ? `${rawProfile}: ${PROFILE_NAMES[rawProfile]}` : rawProfile;
  const crossLabel = hd?.incarnation_cross?.name ?? hd?.incarnation_cross?.label ?? hd?.incarnation_cross ?? "";

  const humanDesign = {
    type: hd?.type ?? "",
    strategy: hd?.strategy ?? "",
    authority: hd?.authority ?? "",
    profile: profileDisplay,
    incarnation_cross: typeof crossLabel === "string" ? crossLabel : String(crossLabel),
    defined_centres: definedCentres,
    undefined_centres: undefinedCentres,
    key_channels: keyChannels,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gkBuild = (name: string, data: any) => data ? { name, gate: data.gate ?? 0, shadow: data.shadow ?? "", gift: data.gift ?? "", siddhi: data.siddhi ?? "" } : undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let geneKeys: Record<string, any> = {};
  if (gk?.lifes_work || gk?.evolution) {
    geneKeys = {
      lifes_work: gkBuild("Life's Work", gk.lifes_work),
      evolution:  gkBuild("Evolution",   gk.evolution),
      radiance:   gkBuild("Radiance",    gk.radiance),
      purpose:    gkBuild("Purpose",     gk.purpose),
      attraction: gkBuild("Attraction",  gk.attraction),
      iq:         gkBuild("IQ",          gk.iq),
      eq:         gkBuild("EQ",          gk.eq),
    };
  } else if (gk?.natal_gene_keys) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const natalGK = gk.natal_gene_keys as Record<string, any>;
    const cc = hd?.conscious_chart || {};
    const uc = hd?.unconscious_chart || {};
    const profileMap = [
      { name: "Life's Work", gateKey: String(cc.Sun?.gate || 64) },
      { name: "Evolution", gateKey: String(cc.Earth?.gate || 63) },
      { name: "Radiance",   gateKey: String(uc.Sun?.gate       || 35) },
      { name: "Purpose",    gateKey: String(uc.Earth?.gate     || 5)  },
      { name: "Attraction", gateKey: String(cc.Venus?.gate     || 32) },
      { name: "IQ",         gateKey: String(cc.SouthNode?.gate || 29) },
      { name: "EQ",         gateKey: String(cc.Moon?.gate      || 28) },
    ];
    profileMap.forEach(({ name, gateKey }) => {
      const entry = natalGK[gateKey];
      if (entry) {
        const key = name.toLowerCase().replace(/[' ]/g, '_');
        geneKeys[key] = { name, gate: entry.gate, shadow: entry.shadow ?? "", gift: entry.gift ?? "", siddhi: entry.siddhi ?? "" };
      }
    });
  }

  const numerology = numRaw ? {
    life_path: numRaw.life_path ?? 0,
    expression: numRaw.expression ?? 0,
    soul_urge: numRaw.soul_urge ?? 0,
    personal_year: numRaw.personal_year ?? 0,
    current_year: numRaw.current_year ?? new Date().getFullYear(),
    short_meanings: numRaw.short_meanings ?? {},
  } : null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hdGates: number[] = Array.isArray((hd as any)?.defined_gates)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? ((hd as any).defined_gates as any[]).map((g) => (typeof g === "number" ? g : parseInt(g, 10))).filter((n) => Number.isFinite(n))
    : [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hdChannels: Array<[number, number]> = Array.isArray((hd as any)?.defined_channels)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? ((hd as any).defined_channels as any[]).map((ch) => {
        if (Array.isArray(ch)) return [Number(ch[0]), Number(ch[1])] as [number, number];
        if (ch && typeof ch === "object") return [Number(ch.gate_a), Number(ch.gate_b)] as [number, number];
        return [0, 0] as [number, number];
      }).filter(([a, b]) => a > 0 && b > 0)
    : [];

  return {
    natal: planetsRaw,
    ascLongitude,
    houseCusps,
    human_design: humanDesign,
    hd_gates: hdGates,
    hd_channels: hdChannels,
    numerology,
    gene_keys: geneKeys,
  };
}

// Ask button — opens chat with a pre-set question about a profile element.
// Uses router.push so React state and auth context are preserved (avoids the
// full page reload that window.location.href would cause).
function AskButton({ topic, question }: { topic: string; question: string }) {
  const router = useRouter();
  const handleClick = () => {
    try {
      sessionStorage.setItem("solray_chat_prompt", JSON.stringify({ topic, question }));
    } catch (_) {}
    router.push("/chat");
  };
  return (
    <button
      onClick={handleClick}
      className="font-body text-[10px] tracking-[0.22em] uppercase text-amber-sun/60 hover:text-amber-sun transition-colors border border-amber-sun/20 hover:border-amber-sun/50 px-2 py-0.5 rounded-full"
    >
      Ask →
    </button>
  );
}

function BlueprintSections({ token, aspects }: { token: string | null; aspects: NatalAspect[] }) {
  // token is passed through to AstroGeography
  const [chart, setChart] = useState<ReturnType<typeof parseBlueprintForChart> | null>(null);
  const [chartReady, setChartReady] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!token) return;
    // The parent ProfilePage already writes solray_blueprint to localStorage
    // before we mount. We re-read it here to parse the chart shape for these
    // sections. If the cache isn't there yet (race on first load), we retry
    // once on the next tick rather than silently rendering nothing.
    let cancelled = false;
    const tryLoad = () => {
      try {
        const cached = localStorage.getItem("solray_blueprint");
        if (cached) {
          const bp = JSON.parse(cached);
          if (!cancelled) {
            setChart(parseBlueprintForChart(bp));
            setChartReady(true);
          }
          return true;
        }
      } catch (_) {}
      return false;
    };
    if (!tryLoad()) {
      const t = setTimeout(() => {
        if (!tryLoad() && !cancelled) setChartReady(true);
      }, 200);
      return () => { cancelled = true; clearTimeout(t); };
    }
    return () => { cancelled = true; };
  }, [token]);

  if (!chartReady) {
    // Quiet placeholder — better than blank
    return (
      <div className="space-y-3 mb-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-14 rounded-2xl border border-forest-border/40 bg-forest-card/20 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!chart) {
    return (
      <div className="mb-4 rounded-2xl border border-forest-border/50 bg-forest-card/30 px-5 py-6 text-center">
        <p className="font-body text-text-secondary text-[13px] leading-relaxed">
          Your blueprint is still being woven. Refresh in a moment.
        </p>
      </div>
    );
  }

  const corePlanets = ["Sun", "Moon", "ASC"];
  const core = chart.natal.filter((p) => corePlanets.includes(p.planet));
  const rest = chart.natal.filter((p) => !corePlanets.includes(p.planet));

  return (
    <>
      {/* Natal Chart */}
      <CollapsibleSection title="Natal Chart" defaultOpen={false}>
        <div className="mt-2">
          {/* Wheel */}
          <div className="mb-5">
            <NatalWheel
              planets={chart.natal.map((p) => ({ planet: p.planet, symbol: p.symbol, longitude: p.longitude, retrograde: p.retrograde }))}
              ascLongitude={chart.ascLongitude}
              houseCusps={chart.houseCusps}
              aspects={aspects}
              size={320}
              showLegend
            />
          </div>
          {/* Core trio */}
          <div className="space-y-4 mb-6">
            {core.map((p) => {
              const label = p.planet === "ASC" ? "Rising" : p.planet;
              const subtitles: Record<string, string> = {
                Sun: "Your core identity, how you shine",
                Moon: "Your emotional nature, how you feel",
                Rising: "Your outer mask, how the world sees you",
              };
              const questions: Record<string, string> = {
                Sun: `What does my ${p.sign} Sun mean for my identity and life path?`,
                Moon: `What does my ${p.sign} Moon reveal about my emotional nature and inner world?`,
                Rising: `What does my ${p.sign} Rising sign mean for how I show up in the world?`,
              };
              return (
                <div key={p.planet} className="flex items-center gap-4 py-3 border-b border-forest-border/40 last:border-0">
                  <span
                    className="shrink-0 inline-flex items-center justify-center"
                    style={{
                      width: 32,
                      height: 32,
                      fontFamily: GLYPH_FONT_FAMILY,
                      fontSize: 26,
                      color: "#f2ecd8",
                      opacity: 0.9,
                      lineHeight: 1,
                    }}
                    aria-hidden="true"
                  >
                    {planetText(p.planet)}
                  </span>
                  <div className="flex-1">
                    <p className="font-body text-text-secondary text-[10px] tracking-widest uppercase">{label}</p>
                    <p className="font-body text-text-secondary/50 text-[10px]">{subtitles[label]}</p>
                  </div>
                  <div className="text-right flex flex-col items-end gap-1">
                    <p className="font-heading text-amber-sun leading-tight" style={{ fontSize: "1.05rem", fontWeight: 400 }}>{p.sign}</p>
                    <p className="font-body text-text-secondary/60 text-[10px]">{p.degree}</p>
                    {questions[label] && <AskButton topic={`${label} in ${p.sign}`} question={questions[label]} />}
                  </div>
                </div>
              );
            })}
          </div>
          {/* All planets */}
          <button
            onClick={() => setShowAll(!showAll)}
            className="flex items-center gap-2 font-body text-text-secondary text-[10px] tracking-widest uppercase mb-3 hover:text-text-primary transition-colors"
          >
            <span>{showAll ? "Hide planets" : "See all planets"}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition-transform duration-200 ${showAll ? "rotate-180" : ""}`}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {showAll && (
            <div className="space-y-1">
              {rest.map((p) => (
                <div key={p.planet} className="flex items-center gap-3 py-1.5 border-b border-forest-border/50 last:border-0">
                  <span
                    className="shrink-0 inline-flex items-center justify-center"
                    style={{
                      width: 22,
                      height: 22,
                      fontFamily: GLYPH_FONT_FAMILY,
                      fontSize: 18,
                      color: "#f2ecd8",
                      opacity: 0.8,
                      lineHeight: 1,
                    }}
                    aria-hidden="true"
                  >
                    {planetText(p.planet)}
                  </span>
                  <span className="font-body text-text-primary text-[13px] flex-1">{p.planet}</span>
                  <span className="font-body text-text-secondary text-[13px]">{p.sign}</span>
                  <span className="font-body text-text-secondary text-[10px]">{p.degree}</span>
                  {p.retrograde && <span className="font-body text-amber-sun/70 text-[10px] font-semibold">Rx</span>}
                  <span className="font-body text-text-secondary text-[10px]">H{p.house}</span>
                </div>
              ))}
            </div>
          )}

          {/* Natal Aspects — inside Natal Chart */}
          {aspects.length > 0 && (
            <div className="mt-4 pt-4 border-t border-forest-border/40">
              <NatalAspects aspects={aspects} />
            </div>
          )}
        </div>
      </CollapsibleSection>

      {/* Human Design */}
      <CollapsibleSection title="Human Design" defaultOpen={false}>
        <div className="space-y-4 mt-2">
          {/* Bodygraph */}
          <div className="mb-2">
            <BodyGraph
              definedCenters={chart.human_design.defined_centres}
              definedChannels={chart.hd_channels}
              size={280}
            />
          </div>
          {chart.human_design.type && (
            <div className="pb-4 mb-1 border-b border-forest-border/40">
              <div className="flex items-center justify-between mb-1">
                <p className="text-text-secondary text-[10px] font-body tracking-[0.22em] uppercase">Type</p>
                <AskButton topic={`${chart.human_design.type} type`} question={`I'm a ${chart.human_design.type}. What does this mean for how I use my energy and make decisions?`} />
              </div>
              <p className="font-heading leading-tight" style={{ color: "#8a9e66", fontSize: "1.4rem", fontWeight: 300, letterSpacing: "0.04em" }}>{chart.human_design.type}</p>
              {HD_TYPE_MEANINGS[chart.human_design.type] && (
                <p className="text-text-secondary/60 text-[12px] font-body leading-snug mt-1">{HD_TYPE_MEANINGS[chart.human_design.type]}</p>
              )}
            </div>
          )}
          <div className="flex items-center justify-between">
            <div className="flex-1"><HDRow label="Strategy" value={chart.human_design.strategy} /></div>
            <AskButton topic="Strategy" question={`My Human Design strategy is: ${chart.human_design.strategy}. How do I live this in practice?`} />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex-1"><HDRow label="Authority" value={chart.human_design.authority} meaning={HD_AUTHORITY_MEANINGS[chart.human_design.authority]} /></div>
            <AskButton topic="Authority" question={`My inner authority is ${chart.human_design.authority}. How do I use this to make better decisions?`} />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex-1"><HDRow label="Profile" value={chart.human_design.profile} meaning={(() => { const n = chart.human_design.profile.match(/^(\d\/\d)/)?.[1]; return n ? HD_PROFILE_MEANINGS[n] : undefined; })()} /></div>
            <AskButton topic="Profile" question={`My Human Design profile is ${chart.human_design.profile}. What does this reveal about my life's purpose and way of being?`} />
          </div>
          {chart.human_design.incarnation_cross && (
            <div className="flex items-center justify-between">
              <div className="flex-1"><HDRow label="Cross" value={chart.human_design.incarnation_cross} /></div>
              <AskButton topic="Incarnation Cross" question={`My Incarnation Cross is ${chart.human_design.incarnation_cross}. What is my life purpose according to this?`} />
            </div>
          )}
          <div>
            <p className="text-text-secondary text-[10px] font-body tracking-[0.22em] uppercase mb-2">Defined Centres</p>
            <div className="flex flex-wrap gap-2">
              {chart.human_design.defined_centres.map((c) => (
                <span
                  key={c}
                  className="px-2.5 py-1 rounded-full text-[11px] font-body tracking-[0.05em]"
                  style={{ color: "#8a9e66", borderWidth: 1, borderStyle: "solid", borderColor: "rgba(138,158,102,0.45)", background: "rgba(138,158,102,0.06)" }}
                >
                  {c}
                </span>
              ))}
            </div>
          </div>
          {chart.human_design.undefined_centres.length > 0 && (
            <div>
              <p className="text-text-secondary text-xs font-body tracking-wider uppercase mb-2">Undefined Centres</p>
              <div className="flex flex-wrap gap-2">
                {chart.human_design.undefined_centres.map((c) => (
                  <span key={c} className="px-2.5 py-1 bg-forest-card border border-forest-border rounded-full text-text-secondary text-xs font-body">{c}</span>
                ))}
              </div>
            </div>
          )}
          {chart.human_design.key_channels.length > 0 && (
            <div>
              <p className="text-text-secondary text-xs font-body tracking-wider uppercase mb-2">Key Channels</p>
              <div className="space-y-1">
                {chart.human_design.key_channels.map((ch) => (
                  <p key={ch} className="text-text-primary text-sm font-body">· {ch}</p>
                ))}
              </div>
            </div>
          )}
        </div>
      </CollapsibleSection>

      {/* Gene Keys */}
      <CollapsibleSection title="Gene Keys" defaultOpen={false}>
        <div className="space-y-5 mt-2">
          {Object.values(chart.gene_keys).filter(Boolean).map((gk) => (
            <div key={gk!.name} className="rounded-2xl p-4" style={{ background: "rgba(106,134,146,0.08)", border: "1px solid rgba(106,134,146,0.28)" }}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-body tracking-wider uppercase" style={{ color: "#9babb9" }}>{gk!.name}</span>
                  <span className="text-text-secondary text-xs font-body">· Gate {gk!.gate}</span>
                </div>
                <AskButton topic={`Gene Key ${gk!.gate}`} question={`My ${gk!.name} Gene Key is Gate ${gk!.gate}, with a shadow of ${gk!.shadow} and a gift of ${gk!.gift}. How do I work with this in my life?`} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <GKPill label="Shadow" value={gk!.shadow} color="" style={{ color: "rgba(220,80,60,0.8)" }} />
                <GKPill label="Gift" value={gk!.gift} color="" style={{ color: "#9babb9" }} />
                <GKPill label="Siddhi" value={gk!.siddhi} color="" style={{ background: "linear-gradient(135deg, #9b86a0, #9babb9)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }} />
              </div>
            </div>
          ))}
        </div>
      </CollapsibleSection>

      {/* Numerology */}
      {chart.numerology && (
        <CollapsibleSection title="Numerology" defaultOpen={false}>
          <div className="mt-3 space-y-3">
            {[
              {
                label: "Life Path",
                sub: "your core direction",
                value: chart.numerology.life_path,
                q: `My Life Path number is ${chart.numerology.life_path}. What does this reveal about my destiny and core purpose?`,
              },
              {
                label: "Expression",
                sub: "your natural talents",
                value: chart.numerology.expression,
                q: `My Expression number is ${chart.numerology.expression}. What does this say about my natural talents?`,
              },
              {
                label: "Soul Urge",
                sub: "what your heart wants",
                value: chart.numerology.soul_urge,
                q: `My Soul Urge number is ${chart.numerology.soul_urge}. What does my heart truly desire?`,
              },
              {
                label: `Personal Year`,
                sub: `${chart.numerology.current_year} energy`,
                value: chart.numerology.personal_year,
                q: `I'm in a Personal Year ${chart.numerology.personal_year} in ${chart.numerology.current_year}. What themes and opportunities should I focus on?`,
              },
            ].map(({ label, sub, value, q }) => {
              const meaning = chart.numerology!.short_meanings[String(value)] || "";
              return (
                <div
                  key={label}
                  className="relative rounded-2xl border border-forest-border/40 bg-forest-card/25 overflow-hidden px-5 py-4"
                >
                  <div className="flex items-center gap-5">
                    {/* Big number with decorative ring around it */}
                    <div className="relative w-[88px] h-[88px] shrink-0 flex items-center justify-center">
                      <svg
                        width="88" height="88"
                        viewBox="0 0 88 88"
                        className="absolute inset-0 pointer-events-none"
                        aria-hidden="true"
                      >
                        <circle cx={44} cy={44} r={38} fill="none" stroke="#9b86a0" strokeWidth={0.8} opacity={0.22} />
                        <circle cx={44} cy={44} r={32} fill="none" stroke="#9b86a0" strokeWidth={0.4} strokeDasharray="3 5" opacity={0.18} />
                      </svg>
                      <span
                        className="font-heading leading-none select-none relative"
                        style={{
                          fontSize: value >= 10 ? "2.8rem" : "3.5rem",
                          fontWeight: 300,
                          color: "#9b86a0",
                          letterSpacing: "-0.02em",
                          textShadow: "0 0 24px rgba(155,134,160,0.35)",
                        }}
                      >
                        {value}
                      </span>
                    </div>

                    {/* Label + meaning */}
                    <div className="flex-1 min-w-0">
                      <p className="font-body text-[10px] tracking-[0.22em] uppercase mb-0.5" style={{ color: "#9b86a0" }}>
                        {label}
                      </p>
                      <p className="font-body text-text-secondary/50 text-[10px] tracking-[0.12em] uppercase mb-2">
                        {sub}
                      </p>
                      {meaning && (
                        <p
                          className="font-heading text-text-primary/75 leading-snug"
                          style={{ fontSize: "0.95rem", fontWeight: 300, fontStyle: "italic", letterSpacing: "0.01em" }}
                        >
                          {meaning}
                        </p>
                      )}
                    </div>

                    {/* Ask button */}
                    <div className="shrink-0 self-start">
                      <AskButton topic={`${label} ${value}`} question={q} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CollapsibleSection>
      )}

      {/* Astrocartography */}
      <CollapsibleSection title="Astrocartography" defaultOpen={false}>
        <div className="mt-2">
          <p className="text-text-secondary text-xs font-body leading-relaxed mb-4">
            Where in the world your planetary energies are strongest. Each line marks where a planet was rising, setting, or at its peak at your birth moment.
          </p>
          <AstroGeography token={token} />
        </div>
      </CollapsibleSection>
    </>
  );
}
