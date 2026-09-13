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
  opposition:  { color: "rgb(var(--rgb-mist))", dash: "6 3" },
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
  Sun:       "rgb(var(--rgb-amber))",
  Moon:      "rgb(var(--rgb-text-primary))",
  Mercury:   "rgb(var(--rgb-mist))",
  Venus:     "rgb(var(--rgb-wisteria))",
  Mars:      "rgb(var(--rgb-ember))",
  Jupiter:   "rgb(var(--rgb-ember))",
  Saturn:    "rgb(var(--rgb-mist))",
  Uranus:    "rgb(var(--rgb-mist))",
  Neptune:   "rgb(var(--rgb-mist))",
  Pluto:     "rgb(var(--rgb-text-muted))",
  NorthNode: "rgb(var(--rgb-text-muted))",
  Chiron:    "rgb(var(--rgb-text-primary))",
  ASC:       "rgb(var(--rgb-text-primary))",
};

const SIGN_ELEMENT_COLOR = [
  "rgb(var(--rgb-ember))", "rgb(var(--rgb-ember))", "rgb(var(--rgb-mist))", "rgb(var(--rgb-mist))",
  "rgb(var(--rgb-ember))", "rgb(var(--rgb-ember))", "rgb(var(--rgb-mist))", "rgb(var(--rgb-mist))",
  "rgb(var(--rgb-ember))", "rgb(var(--rgb-ember))", "rgb(var(--rgb-mist))", "rgb(var(--rgb-mist))",
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
        <p className="font-body text-text-muted text-[15px] tracking-[0.15em] uppercase font-bold">
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
  // These were still the old forest values: light mode was drawing deep-green
  // ink on a 55% black disc, which is why the wheel punched a dark hole in the
  // pearl page and the legend under it came out at about 2:1. Both themes now
  // take the connector palette, so the wheel is the page's own card plane with
  // the page's own ink on it.
  const inkRGB     = isDark ? "245,240,230" : "34,32,28";
  const discFill   = isDark ? "url(#nwInner)" : "rgb(var(--rgb-card))";
  const centerFill = isDark ? "rgb(var(--rgb-bg-deep))" : "rgb(var(--rgb-bg-dark))";
  const haloFlood  = isDark ? "rgb(var(--rgb-bg-deep))" : "rgb(var(--rgb-card))";
  const haloOpacity = isDark ? 0.85 : 0.8;
  // Pale planet glyphs (cream) vanish on a white disc; darken them in light mode.
  const LIGHT_PLANET: Record<string, string> = { Moon: "rgb(var(--rgb-text-secondary))", Chiron: "rgb(var(--rgb-text-secondary))", ASC: "rgb(var(--rgb-ember))" };

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
    (!isDark && LIGHT_PLANET[name]) || PLANET_COLOR[name] || "rgb(var(--rgb-text-muted))";

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
            <stop offset="0%"   stopColor="rgb(var(--rgb-mist))" stopOpacity="0.08" />
            <stop offset="55%"  stopColor="rgb(var(--rgb-mist))" stopOpacity="0.04" />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>
          <radialGradient id="nwInner" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="rgb(var(--rgb-card))" stopOpacity="0.95" />
            <stop offset="100%" stopColor="rgb(var(--rgb-bg-deep))" stopOpacity="0.9" />
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
              fontSize={size * 0.055}
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
            fontSize={size * 0.038}
            fill={`rgba(${inkRGB},0.7)`}
            textAnchor="middle"
            dominantBaseline="central"
            style={{ fontFamily: "inherit", fontWeight: 500 }}
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
              fontSize={size * 0.036}
              fill="rgb(var(--rgb-amber))"
              textAnchor="middle"
              dominantBaseline="middle"
              style={{ fontFamily: "inherit", letterSpacing: "0.18em", fontWeight: 700 }}
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
          fill="rgb(var(--rgb-ember))"
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
                  fontSize={size * 0.035}
                  fill={`rgba(${inkRGB},0.8)`}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  style={{ fontFamily: "inherit", fontWeight: 700 }}
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
                fontSize={size * 0.056}
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
            fontSize: 11.5, fontWeight: 700,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "rgb(var(--rgb-text-muted))",
          }}
        >
          <LegendItem kind="dot"  color="rgb(var(--rgb-ember))" label="Trine" />
          <LegendItem kind="dot"  color="rgb(var(--rgb-mist))" label="Sextile" />
          <LegendItem kind="dash" color="rgb(var(--rgb-ember))" label="Square" />
          <LegendItem kind="dash" color="rgb(var(--rgb-mist))" label="Opposition" />
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
