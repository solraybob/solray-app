"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import dynamic from "next/dynamic";
import NatalWheel from "@/components/NatalWheel";
import BodyGraph from "@/components/BodyGraph";
import { planetText, GLYPH_FONT_FAMILY } from "@/components/AstroGlyphs";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { tx, ES_HD_TYPE_MEANINGS, ES_HD_AUTHORITY_MEANINGS, ES_HD_PROFILE_MEANINGS, ES_CORE_SUBTITLES } from "@/lib/astro-i18n";
import { Wordmark } from "@/components/Wordmark";

// Astrocartography ships a ~60KB world-path module plus mapping libs. It lives
// inside a collapsed section that rarely opens, so code-split it into its own
// chunk that loads on demand instead of bloating the profile route bundle.

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
  radar: RadarValues;        // proportional percentages, for bar legend
  radarDisplay: RadarValues; // max-normalized per group, for spider shape
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

// Max-normalized radar values, used only for the spider chart shape.
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

  // Honest defaults: zero gate, empty gift/shadow when data is missing.
  // Previous version hardcoded { gate: 64, gift: "Imagination", shadow:
  // "Confusion" } and { gate: 63, gift: "Inquiry", shadow: "Doubt" } as
  // initial values, which would render to the user as if those were
  // their actual Gene Keys whenever the blueprint failed to load. The
  // user pays for personalised data, so any unknown field stays empty
  // and the UI hides what it cannot honestly fill.
  let lifesWork: { gate: number; gift: string; shadow: string } = { gate: 0, gift: "", shadow: "" };
  let evolution: { gate: number; gift: string; shadow: string } = { gate: 0, gift: "", shadow: "" };

  if (gk.lifes_work) {
    lifesWork = { gate: gk.lifes_work.gate ?? 0, gift: gk.lifes_work.gift ?? "", shadow: gk.lifes_work.shadow ?? "" };
  } else if (gk.natal_gene_keys) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vals = Object.values(gk.natal_gene_keys as Record<string, any>).sort((a: any, b: any) => a.gate - b.gate);
    if (vals[0]) lifesWork = { gate: vals[0].gate, gift: vals[0].gift ?? "", shadow: vals[0].shadow ?? "" };
    if (vals[1]) evolution = { gate: vals[1].gate, gift: vals[1].gift ?? "", shadow: vals[1].shadow ?? "" };
  }
  if (gk.evolution) {
    evolution = { gate: gk.evolution.gate ?? 0, gift: gk.evolution.gift ?? "", shadow: gk.evolution.shadow ?? "" };
  }

  const crossLabel = hd?.incarnation_cross?.name ?? hd?.incarnation_cross?.label ?? hd?.incarnation_cross ?? "";
  // Honest empty when name/handle is missing. UI is responsible for
  // hiding or placeholdering empty strings. Previous defaults of
  // "Your Name" and "you" rendered prominently as if they were the
  // user's actual identity when the blueprint or profile failed to
  // load.
  const name = _cachedName || user?.name || blueprint?.name || "";
  const handle = _cachedUsername || user?.handle || blueprint?.handle || user?.email?.split("@")[0] || "";

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

// Soul Map Radar, 7 axes, heptagonal polygon

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
  radar: RadarValues;        // proportional %, drives bar legend
  radarDisplay: RadarValues; // max-normalized, drives spider shape
}


function SoulMapRadarChart({ radar, radarDisplay }: SoulMapRadarChartProps) {
  const { lang } = useT();
  // The grid is the one hairline token, so there is no theme branch here.
  const gridStroke = "rgb(var(--rgb-border))";
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
            stroke={gridStroke}
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
            stroke={gridStroke}
            strokeWidth={0.7}
            opacity={0.4}
          />
        );
      })}

      {/* Reference dashed polygon at 50 (balance point) */}
      <polygon
        points={heptGridPolygon(cx, cy, (50 / 100) * OUTER)}
        fill="none"
        stroke="rgb(var(--rgb-text-muted))"
        strokeWidth={1}
        strokeDasharray="4 3"
        opacity={0.30}
      />

      {/* Main moss polygon */}
      <polygon
        points={heptPolygonPoints(animatedValues, cx, cy, OUTER)}
        fill="rgb(var(--rgb-ember))"
        fillOpacity={0.22 * progress}
        stroke="rgb(var(--rgb-ember))"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeOpacity={progress}
      />

      {/* Vertex dots, positioned by display values (max-normalized) */}
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
              stroke="rgb(var(--rgb-ember))"
              strokeWidth={0.5}
              opacity={progress * 0.4}
            />
            {/* Main dot */}
            <circle
              cx={x}
              cy={y}
              r={3}
              fill="rgb(var(--rgb-ember))"
              opacity={progress * 0.9}
            />
          </g>
        );
      })}

      {/* Center dot */}
      <circle cx={cx} cy={cy} r={2} fill="rgb(var(--rgb-amber))" opacity={0.3} />

      {/* Axis labels carry their own number, so the seven-bar legend that
          used to sit under the chart and repeat these exact values is gone.
          One object instead of two, nothing lost. */}
      {SOUL_AXIS_LABELS.map((label, i) => {
        const [lx, ly] = getPoint7(cx, cy, OUTER + 30, i);
        return (
          <g key={label}>
            <text
              x={lx}
              y={ly - 5}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="rgb(var(--rgb-text-muted))"
              fontSize="9"
              fontWeight="700"
              letterSpacing="0.16em"
              style={{ textTransform: "uppercase" }}
            >
              {tx(label, lang)}
            </text>
            <text
              x={lx}
              y={ly + 8}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="rgb(var(--rgb-text-primary))"
              fontSize="12"
              fontWeight="700"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {radar[SOUL_AXIS_KEYS[i]]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// Natal Aspects

const ASPECT_CONFIG: Record<string, { symbol: string; label: string; color: string; major: boolean }> = {
  trine:          { symbol: "△",  label: "Trine",          color: "rgb(var(--rgb-mist))", major: true },
  sextile:        { symbol: "⚹",  label: "Sextile",        color: "rgb(var(--rgb-mist))", major: true },
  conjunction:    { symbol: "☌",  label: "Conjunction",    color: "var(--amber)", major: true },
  opposition:     { symbol: "☍",  label: "Opposition",     color: "rgb(var(--rgb-ember))", major: true },
  square:         { symbol: "□",  label: "Square",         color: "rgb(var(--rgb-ember))", major: true },
  quincunx:       { symbol: "⚻",  label: "Quincunx",      color: "rgb(var(--rgb-wisteria))", major: true },
  semi_sextile:   { symbol: "⚺",  label: "Semi-Sextile",  color: "rgb(var(--rgb-text-muted))", major: false },
  semi_square:    { symbol: "∠",  label: "Semi-Square",   color: "var(--text-secondary)", major: false },
  sesquiquadrate: { symbol: "⊼",  label: "Sesquiquadrate",color: "var(--text-secondary)", major: false },
  quintile:       { symbol: "Q",  label: "Quintile",       color: "var(--text-secondary)", major: false },
  bi_quintile:    { symbol: "bQ", label: "Bi-Quintile",    color: "var(--text-secondary)", major: false },
  septile:        { symbol: "Sp", label: "Septile",        color: "var(--text-secondary)", major: false },
  bi_septile:     { symbol: "bSp",label: "Bi-Septile",     color: "var(--text-secondary)", major: false },
  tri_septile:    { symbol: "tSp",label: "Tri-Septile",    color: "var(--text-secondary)", major: false },
};

const MAJOR_ORDER = ["conjunction", "opposition", "trine", "square", "sextile", "quincunx"];

function NatalAspects({ aspects }: { aspects: NatalAspect[] }) {
  const { t, lang } = useT();
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
    const cfg = ASPECT_CONFIG[key] ?? { symbol: "·", color: "var(--text-secondary)" };
    return (
      <div className="mt-1 pl-6 space-y-1">
        {list.map((a, i) => (
          <div key={i} className="flex items-center justify-between py-0.5">
            <span className="font-body text-xs text-text-secondary">
              {tx(a.planet1, lang)}{" "}
              <span style={{ color: cfg.color }}>{cfg.symbol}</span>{" "}
              {tx(a.planet2, lang)}
            </span>
            <span className="font-body text-[14px] text-text-muted ml-4">
              {a.orb.toFixed(1)}°
            </span>
          </div>
        ))}
      </div>
    );
  };

  const renderAspectRow = (key: string, list: NatalAspect[]) => {
    const cfg = ASPECT_CONFIG[key] ?? { symbol: "·", label: key, color: "var(--text-secondary)", major: false };
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
          <span className="font-body text-[17px] text-text-primary flex-1 text-left">
            {tx(cfg.label, lang)}
          </span>
          <span className="font-body text-[14px] text-text-secondary mr-2">
            {list.length}
          </span>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="rgb(var(--rgb-text-muted))"
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
        <h2 className="font-heading text-text-primary" style={{ fontSize: "1.05rem", fontWeight: 700 }}>{t("profile.natal_aspects")}</h2>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="rgb(var(--rgb-text-muted))"
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
                <span className="text-base w-6 text-center flex-shrink-0 text-text-muted">·</span>
                <span className="font-body text-[17px] text-text-secondary flex-1 text-left">{t("profile.minor_aspects")}</span>
                <span className="font-body text-[14px] text-text-secondary mr-2">
                  {minorGroups.reduce((s, k) => s + grouped[k].length, 0)}
                </span>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="rgb(var(--rgb-text-muted))"
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

function CollapsibleSection({
  title,
  children,
  open,
  onToggle,
}: {
  title: string;
  children: React.ReactNode;
  open: boolean;
  onToggle: (title: string) => void;
}) {
  const { t } = useT();
  const sectionTitleKey: Record<string, string> = {
    "Soul Map": "profile.soul_map",
    "Natal Chart": "profile.natal_chart",
    "Human Design": "profile.human_design",
    "Gene Keys": "profile.gene_keys",
  };
  const displayTitle = sectionTitleKey[title] ? t(sectionTitleKey[title]) : title;

  // The same fold the rest of the app uses: a quiet label over a hairline, the
  // content underneath only when it is asked for. These were four bordered
  // cards, each with an accent colour of its own and a "tap to open" line
  // under the title, which made four objects out of one list.
  //
  // Open state is owned by the page, not by each fold, so exactly one of the
  // four can be open. With four independent folds the page could become a
  // single scroll of everything, which is the opposite of what a fold is for.
  return (
    <div style={{ borderTop: "1px solid rgb(var(--rgb-border))" }}>
      <button
        type="button"
        onClick={() => onToggle(title)}
        aria-expanded={open}
        className="w-full text-left flex items-center justify-between gap-4 font-body uppercase"
        style={{
          paddingBlock: 16,
          background: "transparent",
          fontSize: 11.5,
          fontWeight: 700,
          letterSpacing: "0.2em",
          color: "rgb(var(--rgb-text-muted))",
        }}
      >
        {displayTitle}
        <span
          aria-hidden
          style={{ fontSize: 12, lineHeight: 1, transform: open ? "rotate(180deg)" : "none", transition: "transform .3s ease" }}
        >
          ▾
        </span>
      </button>
      {open && <div style={{ paddingBottom: 24 }}>{children}</div>}
    </div>
  );
}

// Tags with colors

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-body px-3 py-1 rounded-full border border-forest-border/70 text-text-secondary text-[14px] tracking-widest uppercase font-bold">
      {children}
    </span>
  );
}




// Skeleton

function ProfileSkeleton() {
  return (
    <div className="max-w-lg lg:max-w-3xl mx-auto px-5 animate-pulse">
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
  const { t, lang } = useT();
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
  const soulMapRef = useRef<HTMLDivElement | null>(null);
  // One section at a time. Soul Map is the one that opens on arrival.
  const [openSection, setOpenSection] = useState<string | null>("Soul Map");
  const toggleSection = (title: string) =>
    setOpenSection((cur) => (cur === title ? null : title));
  const [soulMapSharing, setSoulMapSharing] = useState(false);

  const handleSoulMapShare = async () => {
    if (soulMapSharing || !soulMapRef.current) return;
    setSoulMapSharing(true);
    try {
      const { shareOrDownloadCard } = await import("@/lib/share-card");
      await shareOrDownloadCard({
        node: soulMapRef.current,
        filename: "solray-soul-map.png",
        title: "My Soul Map, Solray",
        text: "My Soul Map on Solray. solray.ai",
        naturalSize: true,      // capture the card exactly as it appears, not a screen
        background: "rgb(var(--rgb-card))",  // the card plane behind the translucent layer
      });
    } catch (err) {
      console.warn("[share] soul map failed", err);
    } finally {
      setSoulMapSharing(false);
    }
  };

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

    // Try cache first, cheap path (no network call)
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

    // No cache, fetch full blueprint (first load or after cache bust)
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
      setSaveError(e instanceof Error ? e.message : t("profile.error_save"));
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
      setSaveError(e instanceof Error ? e.message : t("profile.error_save"));
    } finally {
      setSavingHandle(false);
    }
  };

  // Handle avatar selection, resize to max 400px, save to server + localStorage
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

        // Persist to server, read token fresh from localStorage to avoid stale closure
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
          console.warn("[avatar upload] no token available, photo saved locally only");
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
      <div
        className="min-h-[100dvh] bg-forest-deep"
        style={{ paddingBottom: "calc(96px + var(--sab, 0px))" }}
      >
        {/* mundane's .head, the one the Mirror and Now already use: the mark
            on the left, the actions as 17px line glyphs on the right, one rule
            under it, then the small label line. The accent eyebrow and the
            centred title were a second and a third header on one screen. */}
        <div className="w-full max-w-lg lg:max-w-3xl mx-auto px-5 pt-3">
          <div className="flex items-center justify-between lg:justify-end" style={{ minHeight: 34 }}>
            {/* The fixed DesktopHeader carries the mark from lg up, so this
                one steps aside there rather than printing solray twice. */}
            <Wordmark size={17} className="text-text-primary lg:hidden" style={{ letterSpacing: "-.045em" }} />
            <span className="flex items-center" style={{ marginRight: -8 }}>
              <button
                className="sol-ico"
                title={t("common.settings")}
                aria-label={t("common.settings")}
                onClick={() => router.push("/profile/settings")}
              >
                {/* Sliders, not a cog: a circle ringed with spokes reads as a
                    sun on a page that already has a sun, and the app has a
                    theme toggle that looks exactly like one. */}
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6.5h9M15.5 6.5H17M3 13.5h4.5M11 13.5H17" />
                  <circle cx="13.6" cy="6.5" r="1.9" />
                  <circle cx="9.1" cy="13.5" r="1.9" />
                </svg>
              </button>
            </span>
          </div>
          <div style={{ height: 1, background: "rgb(var(--rgb-border))", marginTop: 12 }} />
          <p
            className="font-body uppercase"
            style={{ fontSize: 11, letterSpacing: "0.3em", color: "rgb(var(--rgb-text-muted))", marginTop: 12 }}
          >
            {t("nav.profile")}
          </p>
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
            <div className="max-w-lg lg:max-w-3xl mx-auto px-5">
              {/* mundane's .who: the avatar on the left, the name and handle
                  beside it, the photo link under them. It was centred, with a
                  ring, a camera badge and three status lines stacked below.
                    .who{display:flex;align-items:center;gap:16px}
                    .ava{width:76px;height:76px;border-radius:50%;
                      box-shadow:0 8px 20px rgba(70,45,20,.09),
                        inset 0 0 0 1px rgba(34,32,28,.05);font-size:23px;font-weight:700}
                    .whotxt b{font-size:21px;font-weight:700;letter-spacing:-.02em}
                    .whotxt em{font-size:14.5px;color:var(--ink2);margin-top:3px}
                    .phlink{font-size:13px;color:var(--ink3);text-decoration:underline;
                      text-underline-offset:3px} */}
              <div style={{ paddingTop: 18, paddingBottom: 24 }}>
                <div className="flex items-center" style={{ gap: 16 }}>
                  <button
                    onClick={() => avatarInputRef.current?.click()}
                    title={t("profile.change_picture")}
                    className="font-heading overflow-hidden"
                    style={{
                      width: 76, height: 76, borderRadius: "50%", border: "none", flex: "0 0 auto",
                      background: "rgb(var(--rgb-card))", backgroundSize: "cover", backgroundPosition: "center",
                      boxShadow: "0 8px 20px rgb(var(--rgb-scrim) / .09), inset 0 0 0 1px rgb(var(--rgb-text-primary) / .05)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 23, fontWeight: 700, letterSpacing: ".02em", color: "rgb(var(--rgb-text-muted))",
                    }}
                  >
                    {avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      initials
                    )}
                  </button>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarChange}
                  />

                  <div style={{ minWidth: 0 }}>
                    {editingName ? (
                      <div className="flex items-center gap-2">
                        <input
                          className="bg-forest-card border border-forest-border rounded-lg px-3 py-1.5 font-heading text-text-primary focus:outline-none"
                          style={{ fontSize: 19, fontWeight: 700, minWidth: 0 }}
                          value={nameInput}
                          onChange={(e) => setNameInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") handleSaveName(); if (e.key === "Escape") setEditingName(false); }}
                          autoFocus
                        />
                        <button onClick={handleSaveName} disabled={savingName} className="font-body text-[14px] text-text-primary font-bold">
                          {savingName ? "…" : t("common.save")}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setEditingName(true)}
                        className="font-heading text-text-primary text-left block"
                        style={{ fontSize: 21, fontWeight: 700, letterSpacing: "-.02em", background: "none" }}
                      >
                        {profile?.name || (
                          <span style={{ color: "rgb(var(--rgb-text-muted))" }}>{t("profile.add_name")}</span>
                        )}
                      </button>
                    )}

                    {profile?.handle && !editingHandle && (
                      <button
                        onClick={() => setEditingHandle(true)}
                        className="font-body text-left block"
                        style={{ fontSize: 14.5, color: "rgb(var(--rgb-text-secondary))", marginTop: 3, background: "none" }}
                      >
                        @{profile.handle}
                      </button>
                    )}
                    {editingHandle && (
                      <div className="flex items-center gap-2" style={{ marginTop: 4 }}>
                        <input
                          className="bg-forest-card border border-forest-border rounded-lg px-2 py-1 font-body text-[15px] text-text-primary focus:outline-none"
                          style={{ minWidth: 0 }}
                          value={handleInput}
                          onChange={(e) => setHandleInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") handleSaveHandle(); if (e.key === "Escape") setEditingHandle(false); }}
                          autoFocus
                        />
                        <button onClick={handleSaveHandle} disabled={savingHandle} className="font-body text-[14px] text-text-primary font-bold">
                          {savingHandle ? "…" : t("common.save")}
                        </button>
                      </div>
                    )}

                    <button
                      onClick={() => avatarInputRef.current?.click()}
                      className="font-body"
                      style={{
                        background: "none", border: "none", padding: "6px 0 0",
                        fontSize: 13, color: "rgb(var(--rgb-text-muted))",
                        textDecoration: "underline", textUnderlineOffset: 3,
                        textDecorationColor: "rgb(var(--rgb-text-primary) / .2)",
                      }}
                    >
                      {avatarSaving === "saving"
                        ? t("profile.photo_saving")
                        : avatarSaving === "error"
                        ? t("profile.photo_error")
                        : t("profile.change_picture")}
                    </button>
                    {saveError && (
                      <p className="font-body text-ember text-[14px]" style={{ marginTop: 4 }}>{saveError}</p>
                    )}
                  </div>
                </div>

                {profile && (() => {
                  // mundane keeps identity to one quiet line. Three coloured
                  // pills read as three competing objects; the same three facts
                  // separated by middots read as one sentence about a person.
                  const marks = [
                    profile.sunSign ? `${t(`signs.${profile.sunSign.toLowerCase()}`)} ${t("planets.sun")}` : null,
                    profile.hdType ? tx(profile.hdType, lang) : null,
                    profile.hdProfile || null,
                  ].filter(Boolean) as string[];
                  if (!marks.length) return null;
                  return (
                    <p
                      className="font-body"
                      style={{ fontSize: 14.5, lineHeight: 1.5, marginTop: 14,
                               color: "rgb(var(--rgb-text-secondary))" }}
                    >
                      {marks.join(" · ")}
                    </p>
                  );
                })()}

                <p
                  className="font-body"
                  style={{ fontSize: 15.5, lineHeight: 1.6, color: "rgb(var(--rgb-text-muted))", marginTop: 16, maxWidth: "28em" }}
                >
                  {t("profile.intro")}
                </p>
              </div>

              {/* Soul Map, the first of the folds rather than a card with a
                  glow layer, a second card inside it and a caption. The chart
                  labels its own axes with their values, so there is no second
                  legend repeating them underneath. */}
              {profile ? (
                <div style={{ marginTop: 26 }}>
                  <CollapsibleSection title="Soul Map" open={openSection === "Soul Map"} onToggle={toggleSection}>
                    <div ref={soulMapRef}>
                      <SoulMapRadarChart radar={profile.radar} radarDisplay={profile.radarDisplay} />

                      <button
                        onClick={handleSoulMapShare}
                        disabled={soulMapSharing}
                        className="font-body disabled:opacity-50"
                        style={{
                          background: "none", border: "none", padding: "18px 0 0",
                          fontSize: 13, color: "rgb(var(--rgb-text-muted))",
                          textDecoration: "underline", textUnderlineOffset: 3,
                          textDecorationColor: "rgb(var(--rgb-text-primary) / .2)",
                        }}
                      >
                        {t("profile.share_soul_map")}
                      </button>
                    </div>
                  </CollapsibleSection>
                </div>
              ) : (
                <p
                  className="font-body"
                  style={{ fontSize: 15, lineHeight: 1.6, color: "rgb(var(--rgb-text-secondary))", marginTop: 26, maxWidth: "26em" }}
                >
                  {t("profile.complete_birth_data")}
                </p>
              )}

              {/* Full Blueprint, merged from chart page */}
              {profile && <BlueprintSections token={token} aspects={profile.aspects} openSection={openSection} onToggleSection={toggleSection} />}

              {/* Subscription + Sign Out moved into /profile/settings (the gear
                  in the header is the single canonical entry point now). */}
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
  // The profile meaning opens by repeating the profile name, which the value
  // right above it has already said ("1/3: Investigator / Martyr" then
  // "Investigator / Martyr. You learn by..."). Drop the echo.
  let body = meaning;
  if (body) {
    const name = value.includes(":") ? value.split(":").slice(1).join(":").trim() : value.trim();
    if (name && body.toLowerCase().startsWith(name.toLowerCase())) {
      body = body.slice(name.length).replace(/^[.,:;\s]+/, "");
    }
  }
  return (
    <div className="flex items-start gap-3">
      <span
        className="font-body shrink-0"
        style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase",
                 color: "rgb(var(--rgb-text-muted))", width: 96, paddingTop: 4 }}
      >
        {label}
      </span>
      <div className="flex-1">
        <span className="font-body" style={{ fontSize: 17, color: "rgb(var(--rgb-text-primary))" }}>{value}</span>
        {body && (
          <p className="font-body" style={{ fontSize: 14.5, lineHeight: 1.5, marginTop: 3, color: "rgb(var(--rgb-text-muted))" }}>
            {body}
          </p>
        )}
      </div>
    </div>
  );
}

function GKStep({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p
        className="font-body"
        style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase",
                 color: "rgb(var(--rgb-text-muted))", marginBottom: 4 }}
      >
        {label}
      </p>
      <p className="font-heading" style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-.012em", color: "rgb(var(--rgb-text-primary))" }}>
        {value}
      </p>
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
    // If a chart point is missing, gateKey is null and the entry is
    // skipped. The previous version fell back to hardcoded gate
    // numbers (64, 63, 35, 5, 32, 29, 28) which, combined with the
    // natal_gene_keys lookup, would surface the wrong Gene Key as
    // the user's "Life's Work" or other sphere whenever the
    // conscious/unconscious chart had not loaded. Honest skip beats
    // fictional content.
    const profileMap: Array<{ name: string; gateKey: string | null }> = [
      { name: "Life's Work", gateKey: cc.Sun?.gate       != null ? String(cc.Sun.gate)       : null },
      { name: "Evolution",   gateKey: cc.Earth?.gate     != null ? String(cc.Earth.gate)     : null },
      { name: "Radiance",    gateKey: uc.Sun?.gate       != null ? String(uc.Sun.gate)       : null },
      { name: "Purpose",     gateKey: uc.Earth?.gate     != null ? String(uc.Earth.gate)     : null },
      { name: "Attraction",  gateKey: cc.Venus?.gate     != null ? String(cc.Venus.gate)     : null },
      { name: "IQ",          gateKey: cc.SouthNode?.gate != null ? String(cc.SouthNode.gate) : null },
      { name: "EQ",          gateKey: cc.Moon?.gate      != null ? String(cc.Moon.gate)      : null },
    ];
    profileMap.forEach(({ name, gateKey }) => {
      if (!gateKey) return;
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

// Ask button, opens chat with a pre-set question about a profile element.
// Uses router.push so React state and auth context are preserved (avoids the
// full page reload that window.location.href would cause).
function AskButton({ topic, question }: { topic: string; question: string }) {
  const { t } = useT();
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
      className="font-body"
      style={{
        // Same hairline ink pill as the deck's go-deeper button. It was an
        // amber pill, which made every planet row carry an accent.
        fontSize: 12, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase",
        color: "rgb(var(--rgb-text-primary))", background: "none",
        border: "1px solid rgb(var(--rgb-text-primary) / .28)",
        borderRadius: 999, padding: "4px 12px",
      }}
    >
      {t("profile.ask")}
    </button>
  );
}

function BlueprintSections({ token, aspects, openSection, onToggleSection }: { token: string | null; aspects: NatalAspect[]; openSection: string | null; onToggleSection: (title: string) => void }) {
  const { t, lang } = useT();
  const es = lang.startsWith("es");
  // token gates the cached-blueprint read below
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
      const retryTimer = setTimeout(() => {
        if (!tryLoad() && !cancelled) setChartReady(true);
      }, 200);
      return () => { cancelled = true; clearTimeout(retryTimer); };
    }
    return () => { cancelled = true; };
  }, [token]);

  if (!chartReady) {
    // Quiet placeholder, better than blank
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
        <p className="font-body text-text-secondary text-[17px] leading-relaxed">
          {t("profile.blueprint_weaving")}
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
      <CollapsibleSection title="Natal Chart" open={openSection === "Natal Chart"} onToggle={onToggleSection}>
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
              const signEs = tx(p.sign, lang);
              const subtitlesEn: Record<string, string> = {
                Sun: "Your core identity, how you shine",
                Moon: "Your emotional nature, how you feel",
                Rising: "Your outer mask, how the world sees you",
              };
              const subtitles = es ? ES_CORE_SUBTITLES : subtitlesEn;
              const questions: Record<string, string> = es
                ? {
                    Sun: `¿Qué significa mi Sol en ${signEs} para mi identidad y mi camino de vida?`,
                    Moon: `¿Qué revela mi Luna en ${signEs} sobre mi naturaleza emocional y mi mundo interior?`,
                    Rising: `¿Qué significa mi Ascendente en ${signEs} para cómo me muestro al mundo?`,
                  }
                : {
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
                      color: "var(--text-primary)",
                      opacity: 0.9,
                      lineHeight: 1,
                    }}
                    aria-hidden="true"
                  >
                    {planetText(p.planet)}
                  </span>
                  <div className="flex-1">
                    <p className="font-body text-text-secondary text-[14px] tracking-widest uppercase font-bold">{tx(label, lang)}</p>
                    <p className="font-body text-text-muted text-[14px]">{subtitles[label]}</p>
                  </div>
                  <div className="text-right flex flex-col items-end gap-1">
                    <p className="font-heading text-text-primary leading-tight" style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-.015em" }}>{signEs}</p>
                    <p className="font-body text-text-muted text-[14px]">{p.degree}</p>
                    {questions[label] && <AskButton topic={es ? `${tx(label, lang)} en ${signEs}` : `${label} in ${p.sign}`} question={questions[label]} />}
                  </div>
                </div>
              );
            })}
          </div>
          {/* All planets */}
          <button
            onClick={() => setShowAll(!showAll)}
            className="flex items-center gap-2 font-body text-text-secondary text-[14px] tracking-widest uppercase mb-3 hover:text-text-primary transition-colors font-bold"
          >
            <span>{showAll ? t("profile.hide_planets") : t("profile.see_all_planets")}</span>
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
                      color: "var(--text-primary)",
                      opacity: 0.8,
                      lineHeight: 1,
                    }}
                    aria-hidden="true"
                  >
                    {planetText(p.planet)}
                  </span>
                  <span className="font-body text-text-primary text-[17px] flex-1">{tx(p.planet, lang)}</span>
                  <span className="font-body text-text-secondary text-[17px]">{tx(p.sign, lang)}</span>
                  <span className="font-body text-text-secondary text-[14px]">{p.degree}</span>
                  {p.retrograde && <span className="font-body text-amber-sun text-[14px] font-semibold">Rx</span>}
                  <span className="font-body text-text-secondary text-[14px]">H{p.house}</span>
                </div>
              ))}
            </div>
          )}

          {/* Natal Aspects, inside Natal Chart */}
          {aspects.length > 0 && (
            <div className="mt-4 pt-4 border-t border-forest-border/40">
              <NatalAspects aspects={aspects} />
            </div>
          )}
        </div>
      </CollapsibleSection>

      {/* Human Design */}
      <CollapsibleSection title="Human Design" open={openSection === "Human Design"} onToggle={onToggleSection}>
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
                <p className="text-text-secondary text-[14px] font-body tracking-[0.22em] uppercase font-bold">{tx("Type", lang)}</p>
                <AskButton
                  topic={es ? `Tipo ${tx(chart.human_design.type, lang)}` : `${chart.human_design.type} type`}
                  question={es
                    ? `Soy ${tx(chart.human_design.type, lang)}. ¿Qué significa esto para cómo uso mi energía y tomo decisiones?`
                    : `I'm a ${chart.human_design.type}. What does this mean for how I use my energy and make decisions?`}
                />
              </div>
              <p className="font-heading leading-tight" style={{ color: "var(--moss)", fontSize: "1.4rem", fontWeight: 900, letterSpacing: "0.04em" }}>{tx(chart.human_design.type, lang)}</p>
              {(es ? ES_HD_TYPE_MEANINGS : HD_TYPE_MEANINGS)[chart.human_design.type] && (
                <p className="text-text-muted text-[15px] font-body leading-snug mt-1">{(es ? ES_HD_TYPE_MEANINGS : HD_TYPE_MEANINGS)[chart.human_design.type]}</p>
              )}
            </div>
          )}
          <div className="flex items-center justify-between">
            <div className="flex-1"><HDRow label={tx("Strategy", lang)} value={tx(chart.human_design.strategy, lang)} /></div>
            <AskButton
              topic={tx("Strategy", lang)}
              question={es
                ? `Mi estrategia de Diseño Humano es: ${tx(chart.human_design.strategy, lang)}. ¿Cómo la vivo en la práctica?`
                : `My Human Design strategy is: ${chart.human_design.strategy}. How do I live this in practice?`}
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex-1"><HDRow label={tx("Authority", lang)} value={tx(chart.human_design.authority, lang)} meaning={(es ? ES_HD_AUTHORITY_MEANINGS : HD_AUTHORITY_MEANINGS)[chart.human_design.authority]} /></div>
            <AskButton
              topic={tx("Authority", lang)}
              question={es
                ? `Mi autoridad interna es ${tx(chart.human_design.authority, lang)}. ¿Cómo la uso para tomar mejores decisiones?`
                : `My inner authority is ${chart.human_design.authority}. How do I use this to make better decisions?`}
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex-1"><HDRow label={tx("Profile", lang)} value={chart.human_design.profile} meaning={(() => { const n = chart.human_design.profile.match(/^(\d\/\d)/)?.[1]; return n ? (es ? ES_HD_PROFILE_MEANINGS : HD_PROFILE_MEANINGS)[n] : undefined; })()} /></div>
            <AskButton
              topic={tx("Profile", lang)}
              question={es
                ? `Mi perfil de Diseño Humano es ${chart.human_design.profile}. ¿Qué revela sobre el propósito de mi vida y mi forma de ser?`
                : `My Human Design profile is ${chart.human_design.profile}. What does this reveal about my life's purpose and way of being?`}
            />
          </div>
          {chart.human_design.incarnation_cross && (
            <div className="flex items-center justify-between">
              <div className="flex-1"><HDRow label={tx("Cross", lang)} value={chart.human_design.incarnation_cross} /></div>
              <AskButton
                topic={es ? "Cruz de Encarnación" : "Incarnation Cross"}
                question={es
                  ? `Mi Cruz de Encarnación es ${chart.human_design.incarnation_cross}. ¿Cuál es el propósito de mi vida según esto?`
                  : `My Incarnation Cross is ${chart.human_design.incarnation_cross}. What is my life purpose according to this?`}
              />
            </div>
          )}
          {/* The two rows of centre pills that sat here listed exactly what
              the bodygraph above already draws, filled for defined and
              outlined for undefined, in a sage green that is not in the
              palette. The graph is the canonical display. */}
          {chart.human_design.key_channels.length > 0 && (
            <div>
              <p className="font-body" style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgb(var(--rgb-text-muted))", marginBottom: 8 }}>
                {t("profile.key_channels")}
              </p>
              <div>
                {chart.human_design.key_channels.map((ch) => (
                  <p key={ch} className="font-body" style={{ fontSize: 15, lineHeight: 1.6, color: "rgb(var(--rgb-text-primary))" }}>{ch}</p>
                ))}
              </div>
            </div>
          )}
        </div>
      </CollapsibleSection>

      {/* Gene Keys */}
      <CollapsibleSection title="Gene Keys" open={openSection === "Gene Keys"} onToggle={onToggleSection}>
        {/* One hairline row per key, the same grammar as the folds that hold
            them. These were tinted lilac cards with a lilac border, a lilac
            eyebrow, and three words in three different colours, one of them a
            gradient clipped to the text. */}
        <div style={{ marginTop: 4 }}>
          {Object.values(chart.gene_keys).filter(Boolean).map((gk, gi) => (
            <div
              key={gk!.name}
              style={{ paddingBlock: 18, borderTop: gi === 0 ? "none" : "1px solid rgb(var(--rgb-border) / .6)" }}
            >
              <div className="flex items-center justify-between" style={{ gap: 12, marginBottom: 12 }}>
                <p className="font-body" style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgb(var(--rgb-text-muted))" }}>
                  {tx(gk!.name, lang)} · {tx("Gate", lang)} {gk!.gate}
                </p>
                <AskButton
                  topic={es ? `Llave Genética ${gk!.gate}` : `Gene Key ${gk!.gate}`}
                  question={es
                    ? `Mi Llave Genética de ${tx(gk!.name, lang)} es la Puerta ${gk!.gate}, con la sombra de ${tx(gk!.shadow, lang)} y el don de ${tx(gk!.gift, lang)}. ¿Cómo trabajo con esto en mi vida?`
                    : `My ${gk!.name} Gene Key is Gate ${gk!.gate}, with a shadow of ${gk!.shadow} and a gift of ${gk!.gift}. How do I work with this in my life?`}
                />
              </div>
              <div className="grid grid-cols-3" style={{ gap: 12 }}>
                <GKStep label={tx("Shadow", lang)} value={tx(gk!.shadow, lang)} />
                <GKStep label={tx("Gift", lang)} value={tx(gk!.gift, lang)} />
                <GKStep label={tx("Siddhi", lang)} value={tx(gk!.siddhi, lang)} />
              </div>
            </div>
          ))}
        </div>
      </CollapsibleSection>

    </>
  );
}
