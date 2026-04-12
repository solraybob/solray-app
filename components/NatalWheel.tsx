"use client";

/**
 * NatalWheel — minimalist circular natal chart.
 *
 * Design philosophy: "Living By Design" / clean + minimalistic.
 * One outer zodiac ring, one thin inner house ring, planet glyphs at their
 * ecliptic longitude. No aspect lines by default. Element colors are drawn
 * from the Solray extended palette so it visually harmonizes with the rest
 * of the app: fire = ember, earth = moss, air = mist, water = slate.
 *
 * Convention: ASC is drawn at the 9 o'clock position (left), planets move
 * clockwise around the wheel as ecliptic longitude increases (standard
 * astrological wheel orientation).
 */

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
  houseCusps?: number[]; // 12 cusp longitudes; optional (falls back to whole-sign)
  aspects?: Aspect[];
  size?: number;
}

// Three-letter zodiac sign labels. No unicode glyphs, no emoji.
const SIGN_SYMBOLS = ["Ari", "Tau", "Gem", "Can", "Leo", "Vir", "Lib", "Sco", "Sag", "Cap", "Aqu", "Pis"];

// Major aspect colors (muted for wheel use)
const ASPECT_LINE: Record<string, { color: string; opacity: number }> = {
  conjunction: { color: "#e8821a", opacity: 0.55 }, // ember
  opposition:  { color: "#c85848", opacity: 0.55 }, // muted red
  trine:       { color: "#6b7d4a", opacity: 0.55 }, // moss
  square:      { color: "#b06a2a", opacity: 0.55 }, // burnt ochre
  sextile:     { color: "#7a8a9a", opacity: 0.5  }, // mist
};
const MAJOR_ASPECTS = new Set(Object.keys(ASPECT_LINE));
const ELEMENT_COLOR = [
  "#e8821a", // Aries — fire / ember
  "#6b7d4a", // Taurus — earth / moss
  "#7a8a9a", // Gemini — air / mist
  "#4a6670", // Cancer — water / slate
  "#e8821a", // Leo — fire
  "#6b7d4a", // Virgo — earth
  "#7a8a9a", // Libra — air
  "#4a6670", // Scorpio — water
  "#e8821a", // Sagittarius — fire
  "#6b7d4a", // Capricorn — earth
  "#7a8a9a", // Aquarius — air
  "#4a6670", // Pisces — water
];

export default function NatalWheel({ planets, ascLongitude, houseCusps, aspects = [], size = 320 }: NatalWheelProps) {
  if (ascLongitude == null) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="font-body text-text-secondary/60 text-[11px] tracking-[0.15em] uppercase">Wheel unavailable</p>
      </div>
    );
  }

  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size * 0.47;       // outer edge of zodiac ring
  const rZodInner = size * 0.40;    // inner edge of zodiac ring / outer edge of house ring
  const rHouseInner = size * 0.30;  // inner edge of house ring
  const rPlanet = size * 0.35;      // where planet glyphs sit
  const rCenter = size * 0.28;      // edge of open center

  // Convert ecliptic longitude to SVG coords.
  // ASC at 180° (9 o'clock); planets move clockwise as longitude increases.
  const lonToXY = (lon: number, r: number) => {
    const chartAngleDeg = 180 + (lon - ascLongitude);
    const rad = (chartAngleDeg * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
  };

  // SVG arc path from lon1 to lon2 at radius r (drawn clockwise in chart terms).
  const arcPath = (lon1: number, lon2: number, rA: number, rB: number) => {
    const p1 = lonToXY(lon1, rA);
    const p2 = lonToXY(lon2, rA);
    const p3 = lonToXY(lon2, rB);
    const p4 = lonToXY(lon1, rB);
    // Determine which way to go. In our coord system, increasing lon
    // goes clockwise in astrological terms but counterclockwise in screen
    // terms (because we flipped y). SVG large-arc-flag is 1 for > 180°.
    let span = ((lon2 - lon1) % 360 + 360) % 360;
    if (span === 0) span = 360;
    const large = span > 180 ? 1 : 0;
    // Sweep flag: 0 because visually we want to go the "short way" in screen
    // space matching the angular span from lon1 to lon2.
    return `M ${p1.x} ${p1.y} A ${rA} ${rA} 0 ${large} 0 ${p2.x} ${p2.y} L ${p3.x} ${p3.y} A ${rB} ${rB} 0 ${large} 1 ${p4.x} ${p4.y} Z`;
  };

  // Zodiac ring: 12 sectors (one per sign)
  const signSectors = Array.from({ length: 12 }, (_, i) => {
    const startLon = i * 30;
    const endLon = (i + 1) * 30;
    const midLon = startLon + 15;
    const labelPos = lonToXY(midLon, (rOuter + rZodInner) / 2);
    return {
      i,
      path: arcPath(startLon, endLon, rOuter, rZodInner),
      labelPos,
      color: ELEMENT_COLOR[i],
      symbol: SIGN_SYMBOLS[i],
    };
  });

  // House cusps: use provided cusps if available, otherwise whole-sign from ASC.
  const cusps: number[] = (houseCusps && houseCusps.length === 12)
    ? houseCusps
    : Array.from({ length: 12 }, (_, i) => (ascLongitude + i * 30) % 360);

  // Resolve planet overlaps: if two planets are within ~5°, nudge them apart.
  const placed = [...planets]
    .filter((p) => typeof p.longitude === "number")
    .sort((a, b) => a.longitude - b.longitude);

  // Simple collision push: walk through sorted planets, if neighbor is within
  // 6° then push the later one forward until it's 6° clear. This is good
  // enough for visual legibility without doing iterative layout.
  const MIN_GAP = 6;
  const adjusted: { p: Planet; displayLon: number }[] = [];
  for (const p of placed) {
    let display = p.longitude;
    if (adjusted.length > 0) {
      const prev = adjusted[adjusted.length - 1].displayLon;
      if (display - prev < MIN_GAP) display = prev + MIN_GAP;
    }
    adjusted.push({ p, displayLon: display });
  }

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width="100%"
      style={{ maxWidth: size, display: "block", margin: "0 auto" }}
      aria-label="Natal chart wheel"
    >
      {/* Subtle radial glow behind the wheel */}
      <defs>
        <radialGradient id="wheelGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(232,130,26,0.08)" />
          <stop offset="60%" stopColor="rgba(125,102,128,0.04)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </radialGradient>
      </defs>
      <circle cx={cx} cy={cy} r={rOuter} fill="url(#wheelGlow)" />

      {/* Zodiac ring sectors */}
      {signSectors.map((s) => (
        <g key={`sign-${s.i}`}>
          <path d={s.path} fill={s.color} fillOpacity={0.06} stroke="rgba(255,255,255,0.06)" strokeWidth={0.5} />
          <text
            x={s.labelPos.x}
            y={s.labelPos.y}
            fontSize={size * 0.032}
            fill={s.color}
            fillOpacity={0.85}
            textAnchor="middle"
            dominantBaseline="central"
            style={{ fontFamily: "sans-serif", fontWeight: 400, letterSpacing: "0.08em", textTransform: "uppercase" }}
          >
            {s.symbol}
          </text>
        </g>
      ))}

      {/* Outer + inner zodiac ring lines */}
      <circle cx={cx} cy={cy} r={rOuter} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={0.8} />
      <circle cx={cx} cy={cy} r={rZodInner} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={0.6} />

      {/* House ring */}
      <circle cx={cx} cy={cy} r={rHouseInner} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={0.5} />

      {/* House cusp spokes. ASC + DSC (1st, 7th) and MC + IC (10th, 4th) are emphasized. */}
      {cusps.map((lon, idx) => {
        const inner = lonToXY(lon, rHouseInner);
        const outer = lonToXY(lon, rZodInner);
        const isAngle = idx === 0 || idx === 3 || idx === 6 || idx === 9;
        return (
          <line
            key={`cusp-${idx}`}
            x1={inner.x}
            y1={inner.y}
            x2={outer.x}
            y2={outer.y}
            stroke={isAngle ? "rgba(232,210,180,0.4)" : "rgba(255,255,255,0.09)"}
            strokeWidth={isAngle ? 1 : 0.5}
          />
        );
      })}

      {/* ASC arrow marker at the 9 o'clock position */}
      {(() => {
        const inner = lonToXY(ascLongitude, rCenter);
        const outer = lonToXY(ascLongitude, rHouseInner);
        return (
          <g>
            <line x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke="#e8d2b4" strokeWidth={1.2} strokeOpacity={0.5} />
            <text
              x={outer.x - 10}
              y={outer.y + 3}
              fontSize={size * 0.032}
              fill="#e8d2b4"
              fillOpacity={0.7}
              textAnchor="end"
              style={{ fontFamily: "serif", letterSpacing: "0.1em" }}
            >
              ASC
            </text>
          </g>
        );
      })()}

      {/* Aspect lines: five tightest major aspects, drawn inside the house ring */}
      {(() => {
        const byName: Record<string, Planet> = {};
        for (const p of planets) byName[p.planet] = p;
        const majors = aspects
          .filter((a) => MAJOR_ASPECTS.has(a.aspect?.toLowerCase()))
          .filter((a) => byName[a.planet1] && byName[a.planet2])
          .sort((a, b) => a.orb - b.orb)
          .slice(0, 5);
        return majors.map((a, i) => {
          const p1 = byName[a.planet1];
          const p2 = byName[a.planet2];
          const c1 = lonToXY(p1.longitude, rCenter);
          const c2 = lonToXY(p2.longitude, rCenter);
          const cfg = ASPECT_LINE[a.aspect.toLowerCase()];
          return (
            <line
              key={`asp-${i}`}
              x1={c1.x}
              y1={c1.y}
              x2={c2.x}
              y2={c2.y}
              stroke={cfg.color}
              strokeOpacity={cfg.opacity}
              strokeWidth={1}
            />
          );
        });
      })()}

      {/* Planets */}
      {adjusted.map(({ p, displayLon }) => {
        const pos = lonToXY(displayLon, rPlanet);
        const tick1 = lonToXY(p.longitude, rHouseInner);
        const tick2 = lonToXY(p.longitude, rHouseInner - 4);
        if (p.planet === "ASC") return null;
        return (
          <g key={`pl-${p.planet}`}>
            {/* Thin tick showing true longitude on the inner ring */}
            <line x1={tick1.x} y1={tick1.y} x2={tick2.x} y2={tick2.y} stroke="rgba(232,210,180,0.4)" strokeWidth={0.8} />
            <text
              x={pos.x}
              y={pos.y}
              fontSize={size * 0.038}
              fill="#f5f0e8"
              textAnchor="middle"
              dominantBaseline="central"
              style={{ fontFamily: "sans-serif", fontWeight: 400, letterSpacing: "0.04em" }}
            >
              {p.symbol}
            </text>
            {p.retrograde && (
              <text
                x={pos.x + size * 0.03}
                y={pos.y - size * 0.02}
                fontSize={size * 0.022}
                fill="#e8821a"
                fillOpacity={0.85}
                textAnchor="middle"
                style={{ fontFamily: "sans-serif" }}
              >
                R
              </text>
            )}
          </g>
        );
      })}

      {/* Central small dot */}
      <circle cx={cx} cy={cy} r={1.5} fill="rgba(232,210,180,0.5)" />
    </svg>
  );
}
