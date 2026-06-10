"use client";

/**
 * NatalWheel: natal chart wheel. June 2026 redesign (Bob-approved mockup
 * solray_chart_redesign.html).
 *
 * Layer order (outside in):
 *   1. House ring, OUTERMOST: numbers 1-12 between rHouseOuter/rHouseInner,
 *      cusp lines radiating center -> outer edge (angular cusps bolder).
 *   2. Element-coloured zodiac ring, 12 sectors with serif sign glyphs.
 *   3. Degree ticks every 5 degrees on the zodiac ring's inner edge.
 *   4. Planet band, glyphs glow softly, collision-spread when clustered.
 *   5. Full aspect web, EVERY major aspect, weighted by exactness:
 *      tight orbs draw bold and bright, wide orbs fade thin. This shows the
 *      whole web without becoming a hairball.
 *   6. Center disk with the Sun glyph.
 *
 * Sign and planet glyphs are typographic (Unicode + U+FE0E text-presentation
 * via AstroGlyphs signText/planetText), so they render as drawn serif
 * characters, never as color emoji.
 */

import { signText, planetText, GLYPH_FONT_FAMILY } from "./AstroGlyphs";
import { useTheme } from "@/lib/theme-context";

type Planet = {
  planet: string;
  symbol: string;
  longitude: number;
  retrograde?: boolean;
};

type Aspect = {
  planet1: string;
  planet2: string;
  aspect: string;
  orb: number;
};

interface NatalWheelProps {
  planets: Planet[];
  ascLongitude: number | null;
  houseCusps?: number[];
  aspects?: Aspect[];
  size?: number;
  showLegend?: boolean;
}

const ASPECT_LINE: Record<string, { color: string; dash?: string }> = {
  conjunction: { color: "var(--amber)" },
  opposition:  { color: "#6a8692", dash: "6 3" },
  trine:       { color: "var(--moss)" },
  square:      { color: "var(--ember)", dash: "3 3" },
  sextile:     { color: "var(--mist)" },
};
const MAJOR_ASPECTS = new Set(Object.keys(ASPECT_LINE));

// Widest orb we render; beyond this an aspect is too loose to draw.
const MAX_ORB = 6;
// Sanity cap so a pathological chart cannot draw an unreadable web.
const MAX_LINES = 24;

const PLANET_COLOR: Record<string, string> = {
  Sun:       "#f39230",
  Moon:      "#ece4cf",
  Mercury:   "#9babb9",
  Venus:     "#9b86a0",
  Mars:      "#d47a52",
  Jupiter:   "#8a9e66",
  Saturn:    "#6a8692",
  Uranus:    "#9babb9",
  Neptune:   "#6a8692",
  Pluto:     "#8a9e8d",
  NorthNode: "#8a9e8d",
  Chiron:    "#ece4cf",
  ASC:       "#f0dcc0",
};

const SIGN_ELEMENT_COLOR = [
  "#d47a52", "#8a9e66", "#9babb9", "#6a8692",
  "#d47a52", "#8a9e66", "#9babb9", "#6a8692",
  "#d47a52", "#8a9e66", "#9babb9", "#6a8692",
];

export default function NatalWheel({
  planets,
  ascLongitude,
  houseCusps,
  aspects = [],
  size = 320,
  showLegend = false,
}: NatalWheelProps) {
  const { theme } = useTheme();
  const isDark = theme !== "light";
  if (ascLongitude == null) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="font-body text-text-secondary/60 text-[13px] tracking-[0.15em] uppercase">
          Wheel unavailable
        </p>
      </div>
    );
  }

  const cx = size / 2;
  const cy = size / 2;

  // Theme-aware palette. In dark mode the original forest treatment; in light
  // mode a soft white field with deep-forest ink so the wheel sits in the
  // pearl theme instead of punching a dark hole in it.
  const inkRGB     = isDark ? "232,210,180" : "26,48,32";   // cream vs deep forest
  const discFill   = isDark ? "url(#nwInner)" : "rgba(255,255,255,0.55)";
  const centerFill = isDark ? "rgba(6,16,10,0.7)" : "rgba(255,255,255,0.62)";
  const haloFlood  = isDark ? "#000" : "#f7f3e9";
  const haloOpacity = isDark ? 0.85 : 0.7;
  // Pale planet glyphs (cream) vanish on a white disc; darken them in light mode.
  const LIGHT_PLANET: Record<string, string> = { Moon: "#6f7e72", Chiron: "#6f7e72", ASC: "#b58a3a" };

  // Redesigned radii: houses OUTERMOST, then signs, planets, aspects, center.
  const rHouseOuter = size * 0.487;
  const rHouseInner = size * 0.432;
  const rHouseBand  = (rHouseOuter + rHouseInner) / 2;
  const rZodInner   = size * 0.352;
  const rZodMid     = (rHouseInner + rZodInner) / 2;
  const rPlanet     = size * 0.301;
  const rAspect     = size * 0.188;
  const rCenter     = size * 0.112;

  const lonToXY = (lon: number, r: number) => {
    const deg = 180 + (lon - ascLongitude);
    const rad = (deg * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
  };

  const arcPath = (lon1: number, lon2: number, rA: number, rB: number) => {
    const p1 = lonToXY(lon1, rA);
    const p2 = lonToXY(lon2, rA);
    const p3 = lonToXY(lon2, rB);
    const p4 = lonToXY(lon1, rB);
    let span = ((lon2 - lon1) % 360 + 360) % 360;
    if (span === 0) span = 360;
    const large = span > 180 ? 1 : 0;
    return `M ${p1.x} ${p1.y} A ${rA} ${rA} 0 ${large} 0 ${p2.x} ${p2.y} L ${p3.x} ${p3.y} A ${rB} ${rB} 0 ${large} 1 ${p4.x} ${p4.y} Z`;
  };

  // Zodiac ring (now between rHouseInner and rZodInner).
  const signSectors = Array.from({ length: 12 }, (_, i) => ({
    i,
    path:     arcPath(i * 30, (i + 1) * 30, rHouseInner, rZodInner),
    labelPos: lonToXY(i * 30 + 15, rZodMid),
    color:    SIGN_ELEMENT_COLOR[i],
  }));

  // House cusps (equal-house fallback if real cusps absent).
  const cusps: number[] =
    houseCusps && houseCusps.length === 12
      ? houseCusps
      : Array.from({ length: 12 }, (_, i) => (ascLongitude + i * 30) % 360);

  // House numbers in the OUTER band, centered between consecutive cusps.
  const houseNumbers = Array.from({ length: 12 }, (_, i) => {
    const start = cusps[i];
    const end   = cusps[(i + 1) % 12];
    let span    = ((end - start) % 360 + 360) % 360;
    if (span === 0) span = 30;
    return { num: i + 1, pos: lonToXY(start + span / 2, rHouseBand) };
  });

  // Degree ticks every 5 degrees, longer at sign boundaries.
  const ticks = Array.from({ length: 72 }, (_, k) => {
    const d = k * 5;
    const major = d % 30 === 0;
    return { a: lonToXY(d, rZodInner), b: lonToXY(d, rZodInner - (major ? 9 : 4.5) * (size / 440)), major };
  });

  // Planet collision resolution.
  const placed = [...planets]
    .filter((p) => typeof p.longitude === "number")
    .sort((a, b) => a.longitude - b.longitude);

  const MIN_GAP = 7;
  const adjusted: { p: Planet; displayLon: number }[] = [];
  for (const p of placed) {
    let display = p.longitude;
    if (adjusted.length > 0) {
      const prev = adjusted[adjusted.length - 1].displayLon;
      if (display - prev < MIN_GAP) display = prev + MIN_GAP;
    }
    adjusted.push({ p, displayLon: display });
  }

  const planetColor = (name: string) =>
    (!isDark && LIGHT_PLANET[name]) || PLANET_COLOR[name] || "#8a9e8d";

  // Full aspect web: every major aspect inside MAX_ORB, tightest first,
  // weighted by exactness.
  const byName: Record<string, Planet> = {};
  for (const p of planets) byName[p.planet] = p;
  const majorLines = aspects
    .filter((a) => MAJOR_ASPECTS.has(a.aspect?.toLowerCase()))
    .filter((a) => byName[a.planet1] && byName[a.planet2])
    .filter((a) => a.orb <= MAX_ORB)
    .sort((a, b) => a.orb - b.orb)
    .slice(0, MAX_LINES);

  const ringStroke = `rgba(${inkRGB},0.32)`;
  const ringWidth  = 1.1;

  return (
    <div style={{ maxWidth: size, margin: "0 auto" }}>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        width="100%"
        style={{ display: "block" }}
        aria-label="Natal chart wheel"
      >
        <defs>
          <radialGradient id="nwGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="rgba(243,146,48,0.10)" />
            <stop offset="55%"  stopColor="rgba(106,134,146,0.06)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>
          <radialGradient id="nwInner" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="rgba(8,20,14,0.88)" />
            <stop offset="100%" stopColor="rgba(6,16,10,0.78)" />
          </radialGradient>
          {/* Soft halo behind glyphs so they lift off the busy field. */}
          <filter id="nwGlyph" x="-60%" y="-60%" width="220%" height="220%">
            <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor={haloFlood} floodOpacity={haloOpacity} />
          </filter>
        </defs>

        {/* Background glow */}
        <circle cx={cx} cy={cy} r={rHouseOuter + 3} fill="url(#nwGlow)" />

        {/* Inner disk: dark in dark mode, soft white in light mode */}
        <circle cx={cx} cy={cy} r={rZodInner} fill={discFill} />

        {/* Zodiac ring sectors + serif sign glyphs */}
        {signSectors.map((s) => (
          <g key={`sign-${s.i}`}>
            <path
              d={s.path}
              fill={s.color}
              fillOpacity={0.10}
              stroke={s.color}
              strokeOpacity={0.22}
              strokeWidth={0.5}
            />
            <text
              x={s.labelPos.x}
              y={s.labelPos.y}
              fill={s.color}
              fillOpacity={0.95}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={size * 0.048}
              style={{ fontFamily: GLYPH_FONT_FAMILY, fontWeight: 500 }}
            >
              {signText(s.i)}
            </text>
          </g>
        ))}

        {/* Degree ticks */}
        {ticks.map((t, i) => (
          <line
            key={`tick-${i}`}
            x1={t.a.x} y1={t.a.y}
            x2={t.b.x} y2={t.b.y}
            stroke={`rgba(${inkRGB},${t.major ? 0.5 : 0.26})`}
            strokeWidth={t.major ? 1.0 : 0.6}
          />
        ))}

        {/* Ring borders */}
        {[rHouseOuter, rHouseInner, rZodInner, rCenter].map((r) => (
          <circle key={`ring-${r}`} cx={cx} cy={cy} r={r} fill="none" stroke={ringStroke} strokeWidth={ringWidth} />
        ))}

        {/* House cusp lines, center to the outer edge. Angular cusps solid + bolder. */}
        {cusps.map((lon, idx) => {
          const inner = lonToXY(lon, rCenter);
          const outer = lonToXY(lon, rHouseOuter);
          const isAngle = idx === 0 || idx === 3 || idx === 6 || idx === 9;
          return (
            <line
              key={`cusp-${idx}`}
              x1={inner.x} y1={inner.y}
              x2={outer.x} y2={outer.y}
              stroke={`rgba(${inkRGB},1)`}
              strokeOpacity={isAngle ? 0.7 : 0.32}
              strokeWidth={isAngle ? 1.3 : 0.8}
              strokeDasharray={isAngle ? undefined : "2 3"}
            />
          );
        })}

        {/* House numbers in the outer band */}
        {houseNumbers.map(({ num, pos }) => (
          <text
            key={`hn-${num}`}
            x={pos.x} y={pos.y}
            fontSize={size * 0.032}
            fill={`rgba(${inkRGB},0.7)`}
            textAnchor="middle"
            dominantBaseline="central"
            style={{ fontFamily: "Inter, system-ui, sans-serif", fontWeight: 500 }}
          >
            {num}
          </text>
        ))}

        {/* ASC label */}
        {(() => {
          const pos = lonToXY(ascLongitude, rZodInner - 10);
          return (
            <text
              x={pos.x} y={pos.y}
              fontSize={size * 0.030}
              fill="#f39230"
              textAnchor="middle"
              dominantBaseline="middle"
              style={{ fontFamily: "Inter, system-ui, sans-serif", letterSpacing: "0.18em", fontWeight: 600 }}
            >
              ASC
            </text>
          );
        })()}

        {/* Full aspect web, weighted by exactness */}
        {majorLines.map((a, i) => {
          const p1  = byName[a.planet1];
          const p2  = byName[a.planet2];
          const c1  = lonToXY(p1.longitude, rAspect);
          const c2  = lonToXY(p2.longitude, rAspect);
          const cfg = ASPECT_LINE[a.aspect.toLowerCase()];
          if (!cfg) return null;
          const t = Math.max(0, Math.min(1, a.orb / MAX_ORB));
          const w  = 1.9 - 1.3 * t;
          const op = 0.95 - 0.68 * t;
          return (
            <line
              key={`asp-${i}`}
              x1={c1.x} y1={c1.y}
              x2={c2.x} y2={c2.y}
              stroke={cfg.color}
              strokeOpacity={op}
              strokeWidth={w}
              strokeLinecap="round"
              strokeDasharray={cfg.dash}
            />
          );
        })}

        {/* Center disk + Sun mark */}
        <circle cx={cx} cy={cy} r={rCenter} fill={centerFill} />
        <text
          x={cx} y={cy}
          fill="#e8913c"
          fillOpacity={0.85}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={size * 0.07}
          style={{ fontFamily: GLYPH_FONT_FAMILY, fontWeight: 500 }}
          filter="url(#nwGlyph)"
        >
          {planetText("Sun")}
        </text>

        {/* Planets */}
        {adjusted.map(({ p, displayLon }) => {
          if (p.planet === "ASC") return null;
          const pos    = lonToXY(displayLon, rPlanet);
          const tick1  = lonToXY(p.longitude, rZodInner);
          const tick2  = lonToXY(p.longitude, rZodInner - 7);
          const pColor = planetColor(p.planet);
          return (
            <g key={`pl-${p.planet}`}>
              <line
                x1={tick1.x} y1={tick1.y}
                x2={tick2.x} y2={tick2.y}
                stroke={pColor}
                strokeOpacity={0.9}
                strokeWidth={1.75}
                strokeLinecap="round"
              />
              {p.retrograde && (
                <text
                  x={pos.x + size * 0.020}
                  y={pos.y + size * 0.014}
                  fontSize={size * 0.028}
                  fill={`rgba(${inkRGB},0.8)`}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  style={{ fontFamily: "Inter, system-ui, sans-serif", fontWeight: 600 }}
                >
                  Rx
                </text>
              )}
              <text
                x={pos.x}
                y={pos.y}
                fill={pColor}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={size * 0.05}
                style={{ fontFamily: GLYPH_FONT_FAMILY, fontWeight: 500 }}
                filter="url(#nwGlyph)"
              >
                {planetText(p.planet)}
              </text>
            </g>
          );
        })}
      </svg>

      {showLegend && (
        <div
          className="flex flex-wrap justify-center"
          style={{
            gap: "10px 18px",
            marginTop: 18,
            fontSize: 10,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: `rgba(${inkRGB},0.6)`,
          }}
        >
          <LegendItem kind="dot"  color="#8a9e66" label="Trine" />
          <LegendItem kind="dot"  color="#9babb9" label="Sextile" />
          <LegendItem kind="dash" color="#d47a52" label="Square" />
          <LegendItem kind="dash" color="#6a8692" label="Opposition" />
        </div>
      )}
    </div>
  );
}

function LegendItem({
  kind,
  color,
  label,
}: {
  kind: "dot" | "dash";
  color: string;
  label: string;
}) {
  return (
    <span className="inline-flex items-center" style={{ gap: 8 }}>
      {kind === "dot" ? (
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: color, display: "inline-block" }} />
      ) : (
        <span style={{ width: 18, height: 2, background: color, display: "inline-block" }} />
      )}
      {label}
    </span>
  );
}
