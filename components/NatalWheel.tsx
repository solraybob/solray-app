"use client";

/**
 * NatalWheel — natal chart wheel with visible contrast and SVG line-art glyphs.
 *
 * Design intent: the wheel must be immediately legible on the dark forest
 * background. Approach: dark filled inner disk creates separation, element-
 * colored zodiac ring sectors at meaningful opacity, planet glyphs sized to
 * be readable, aspect lines bold enough to trace.
 */

import Glyph from "./AstroGlyphs";

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
}

const ASPECT_LINE: Record<string, { color: string; opacity: number; dash?: string }> = {
  conjunction: { color: "#e8821a", opacity: 0.70 },
  opposition:  { color: "#c05858", opacity: 0.65 },
  trine:       { color: "#6b7d4a", opacity: 0.70 },
  square:      { color: "#c4723a", opacity: 0.65 },
  sextile:     { color: "#7a8a9a", opacity: 0.60, dash: "4 3" },
};
const MAJOR_ASPECTS = new Set(Object.keys(ASPECT_LINE));

// Element colors per sign index (Aries=0 ... Pisces=11)
const SIGN_ELEMENT_COLOR = [
  "#c4623a", // Aries — fire
  "#6b7d4a", // Taurus — earth
  "#7a8a9a", // Gemini — air
  "#4a6670", // Cancer — water
  "#c4623a", // Leo — fire
  "#6b7d4a", // Virgo — earth
  "#7a8a9a", // Libra — air
  "#4a6670", // Scorpio — water
  "#c4623a", // Sagittarius — fire
  "#6b7d4a", // Capricorn — earth
  "#7a8a9a", // Aquarius — air
  "#4a6670", // Pisces — water
];

export default function NatalWheel({
  planets,
  ascLongitude,
  houseCusps,
  aspects = [],
  size = 320,
}: NatalWheelProps) {
  if (ascLongitude == null) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="font-body text-text-secondary/60 text-[11px] tracking-[0.15em] uppercase">
          Wheel unavailable
        </p>
      </div>
    );
  }

  const cx = size / 2;
  const cy = size / 2;

  // Radii — give each ring clear breathing room
  const rOuter     = size * 0.465; // outer zodiac ring edge
  const rZodInner  = size * 0.385; // zodiac / house ring boundary
  const rHouseOut  = size * 0.385; // same as zodiac inner
  const rHouseInner = size * 0.300; // inner edge of house band
  const rPlanet    = size * 0.340; // planet glyph radius
  const rAspect    = size * 0.295; // aspect lines start/end
  const rCenter    = size * 0.155; // open center disk

  // ASC at 9-o'clock; increasing ecliptic lon goes clockwise in chart space
  // but counterclockwise in screen space (y is flipped).
  const lonToXY = (lon: number, r: number) => {
    const deg = 180 + (lon - ascLongitude);
    const rad = (deg * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
  };

  // Wedge path between two concentric arcs
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

  // Zodiac ring sectors
  const signSectors = Array.from({ length: 12 }, (_, i) => {
    const startLon = i * 30;
    const endLon = (i + 1) * 30;
    const midLon = startLon + 15;
    const labelR = (rOuter + rZodInner) / 2;
    const labelPos = lonToXY(midLon, labelR);
    return {
      i,
      path: arcPath(startLon, endLon, rOuter, rZodInner),
      labelPos,
      color: SIGN_ELEMENT_COLOR[i],
    };
  });

  // House cusps
  const cusps: number[] = houseCusps && houseCusps.length === 12
    ? houseCusps
    : Array.from({ length: 12 }, (_, i) => (ascLongitude + i * 30) % 360);

  // Planet collision resolution (sort by lon, push crowded ones apart)
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

  // Pick planet color by the sign it occupies
  const planetColor = (lon: number) => {
    const signIdx = Math.floor(((lon % 360) + 360) % 360 / 30);
    return SIGN_ELEMENT_COLOR[signIdx];
  };

  // Aspect lines — top 8 tightest majors
  const byName: Record<string, Planet> = {};
  for (const p of planets) byName[p.planet] = p;
  const majorLines = aspects
    .filter((a) => MAJOR_ASPECTS.has(a.aspect?.toLowerCase()))
    .filter((a) => byName[a.planet1] && byName[a.planet2])
    .sort((a, b) => a.orb - b.orb)
    .slice(0, 8);

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width="100%"
      style={{ maxWidth: size, display: "block", margin: "0 auto" }}
      aria-label="Natal chart wheel"
    >
      <defs>
        {/* Soft radial glow behind wheel */}
        <radialGradient id="nwGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="rgba(232,130,26,0.10)" />
          <stop offset="55%"  stopColor="rgba(74,102,112,0.06)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </radialGradient>
        {/* Dark fill for inner chart area to create contrast */}
        <radialGradient id="nwInner" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="rgba(8,20,14,0.85)" />
          <stop offset="100%" stopColor="rgba(6,16,10,0.75)" />
        </radialGradient>
      </defs>

      {/* Background glow */}
      <circle cx={cx} cy={cy} r={rOuter + 4} fill="url(#nwGlow)" />

      {/* Dark inner disk — creates contrast for glyphs */}
      <circle cx={cx} cy={cy} r={rZodInner} fill="url(#nwInner)" />

      {/* Zodiac ring sectors — filled with element color */}
      {signSectors.map((s) => (
        <g key={`sign-${s.i}`}>
          <path
            d={s.path}
            fill={s.color}
            fillOpacity={0.16}
            stroke={s.color}
            strokeOpacity={0.25}
            strokeWidth={0.5}
          />
          <Glyph
            type="sign"
            id={s.i}
            x={s.labelPos.x}
            y={s.labelPos.y}
            size={size * 0.072}
            color={s.color}
            strokeWidth={1.2}
            opacity={1}
          />
        </g>
      ))}

      {/* Ring borders */}
      <circle cx={cx} cy={cy} r={rOuter}     fill="none" stroke="rgba(232,210,180,0.25)" strokeWidth={1} />
      <circle cx={cx} cy={cy} r={rZodInner}  fill="none" stroke="rgba(232,210,180,0.20)" strokeWidth={0.8} />
      <circle cx={cx} cy={cy} r={rHouseInner} fill="none" stroke="rgba(232,210,180,0.14}" strokeWidth={0.6} />

      {/* House cusp lines */}
      {cusps.map((lon, idx) => {
        const inner = lonToXY(lon, rHouseInner);
        const outer = lonToXY(lon, rZodInner);
        const isAngle = idx === 0 || idx === 3 || idx === 6 || idx === 9;
        return (
          <line
            key={`cusp-${idx}`}
            x1={inner.x} y1={inner.y}
            x2={outer.x} y2={outer.y}
            stroke={isAngle ? "rgba(232,210,180,0.55)" : "rgba(232,210,180,0.14)"}
            strokeWidth={isAngle ? 1.2 : 0.5}
          />
        );
      })}

      {/* ASC label */}
      {(() => {
        const outer = lonToXY(ascLongitude, rZodInner - 10);
        return (
          <text
            x={outer.x}
            y={outer.y}
            fontSize={size * 0.030}
            fill="#e8d2b4"
            fillOpacity={0.8}
            textAnchor="middle"
            dominantBaseline="middle"
            style={{ fontFamily: "serif", letterSpacing: "0.08em" }}
          >
            ASC
          </text>
        );
      })()}

      {/* Aspect lines drawn in the center zone */}
      {majorLines.map((a, i) => {
        const p1 = byName[a.planet1];
        const p2 = byName[a.planet2];
        const c1 = lonToXY(p1.longitude, rAspect);
        const c2 = lonToXY(p2.longitude, rAspect);
        const cfg = ASPECT_LINE[a.aspect.toLowerCase()];
        if (!cfg) return null;
        return (
          <line
            key={`asp-${i}`}
            x1={c1.x} y1={c1.y}
            x2={c2.x} y2={c2.y}
            stroke={cfg.color}
            strokeOpacity={cfg.opacity}
            strokeWidth={1.1}
            strokeDasharray={cfg.dash}
          />
        );
      })}

      {/* Inner center circle — visual anchor */}
      <circle cx={cx} cy={cy} r={rCenter} fill="rgba(6,16,10,0.6)" stroke="rgba(232,210,180,0.12)" strokeWidth={0.5} />

      {/* Planets */}
      {adjusted.map(({ p, displayLon }) => {
        if (p.planet === "ASC") return null;
        const pos  = lonToXY(displayLon, rPlanet);
        const tick1 = lonToXY(p.longitude, rHouseInner);
        const tick2 = lonToXY(p.longitude, rHouseInner - 6);
        const pColor = planetColor(p.longitude);
        return (
          <g key={`pl-${p.planet}`}>
            {/* Tick at true ecliptic position */}
            <line
              x1={tick1.x} y1={tick1.y}
              x2={tick2.x} y2={tick2.y}
              stroke={pColor}
              strokeOpacity={0.7}
              strokeWidth={1}
            />
            {/* Glyph colored by element of the occupied sign */}
            <Glyph
              type="planet"
              id={p.planet}
              x={pos.x}
              y={pos.y}
              size={size * 0.085}
              color={pColor}
              strokeWidth={1.3}
            />
            {p.retrograde && (
              <text
                x={pos.x + size * 0.038}
                y={pos.y - size * 0.032}
                fontSize={size * 0.024}
                fill="#e8821a"
                fillOpacity={0.9}
                textAnchor="middle"
                style={{ fontFamily: "sans-serif", fontStyle: "italic" }}
              >
                R
              </text>
            )}
          </g>
        );
      })}

      {/* Center dot */}
      <circle cx={cx} cy={cy} r={2} fill="rgba(232,210,180,0.5)" />
    </svg>
  );
}
