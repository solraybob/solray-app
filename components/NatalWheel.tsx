"use client";

/**
 * NatalWheel: natal chart wheel.
 *
 * Layer order (outside in):
 *   1. Element-coloured zodiac ring, 12 sectors
 *   2. Sign glyphs, centered in each sector
 *   3. House / planet band, planets at rPlanet, tick marks at true longitude
 *   4. House number band, subtle Arabic numerals at rHouseNum
 *   5. Aspect web, top 8 tightest major aspects
 *   6. Center disk
 *
 * Five concentric ring circles (rOuter, rZodInner, rHouseInner, rNumInner,
 * rCenter) give the wheel its four-track structure. Ring strokes are
 * intentionally uniform so the eye reads the rings as a set, not a
 * hierarchy of importance.
 *
 * Retrograde marker is drawn before the planet glyph so the planet sits
 * on top and the Rx peeks through from behind in a muted secondary tone.
 *
 * Pass `showLegend` to render a compact legend beneath the wheel.
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
  showLegend?: boolean;
}

const ASPECT_LINE: Record<string, { color: string; opacity: number; dash?: string }> = {
  conjunction: { color: "#f39230", opacity: 0.62 },
  opposition:  { color: "#6a8692", opacity: 0.62, dash: "6 3" },
  trine:       { color: "#8a9e66", opacity: 0.62 },
  square:      { color: "#d47a52", opacity: 0.62, dash: "3 3" },
  sextile:     { color: "#9babb9", opacity: 0.62 },
};
const MAJOR_ASPECTS = new Set(Object.keys(ASPECT_LINE));

// Per-planet colours matching the Sky Now section on the Today page.
const PLANET_COLOR: Record<string, string> = {
  Sun:       "#f39230", // amber
  Moon:      "#ece4cf", // pearl
  Mercury:   "#9babb9", // mist
  Venus:     "#9b86a0", // wisteria
  Mars:      "#d47a52", // ember
  Jupiter:   "#8a9e66", // moss
  Saturn:    "#6a8692", // slate
  Uranus:    "#9babb9", // mist
  Neptune:   "#6a8692", // slate
  Pluto:     "#8a9e8d", // sage
  NorthNode: "#8a9e8d",
  Chiron:    "#ece4cf",
  ASC:       "#f0dcc0",
};

// Element color per sign index (Aries=0, Pisces=11).
const SIGN_ELEMENT_COLOR = [
  "#d47a52", // Aries, fire
  "#8a9e66", // Taurus, earth
  "#9babb9", // Gemini, air
  "#6a8692", // Cancer, water
  "#d47a52", // Leo, fire
  "#8a9e66", // Virgo, earth
  "#9babb9", // Libra, air
  "#6a8692", // Scorpio, water
  "#d47a52", // Sagittarius, fire
  "#8a9e66", // Capricorn, earth
  "#9babb9", // Aquarius, air
  "#6a8692", // Pisces, water
];

export default function NatalWheel({
  planets,
  ascLongitude,
  houseCusps,
  aspects = [],
  size = 320,
  showLegend = false,
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

  // Radii, in share of `size`, calibrated to the mockup:
  //   rOuter      = 149.5 / 320 = 0.467
  //   rZodInner   = 123.2 / 320 = 0.385
  //   rHouseInner =  97.6 / 320 = 0.305
  //   rNumInner   =  72.0 / 320 = 0.225
  //   rCenter     =  44.8 / 320 = 0.140
  const rOuter      = size * 0.467;
  const rZodInner   = size * 0.385;
  const rHouseInner = size * 0.305;
  const rPlanet     = size * 0.345; // planet glyph placement, between zodiac and house band
  const rHouseNum   = size * 0.262; // house number ring
  const rNumInner   = size * 0.225;
  const rAspect     = size * 0.205;
  const rCenter     = size * 0.140;

  // ASC sits at 9 o'clock; ecliptic longitude increases clockwise in chart space.
  const lonToXY = (lon: number, r: number) => {
    const deg = 180 + (lon - ascLongitude);
    const rad = (deg * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
  };

  // Wedge path between two concentric arcs.
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

  // Zodiac ring.
  const signSectors = Array.from({ length: 12 }, (_, i) => {
    const startLon = i * 30;
    const endLon   = (i + 1) * 30;
    const midLon   = startLon + 15;
    const labelR   = (rOuter + rZodInner) / 2;
    return {
      i,
      path:     arcPath(startLon, endLon, rOuter, rZodInner),
      labelPos: lonToXY(midLon, labelR),
      color:    SIGN_ELEMENT_COLOR[i],
    };
  });

  // House cusps (equal-house fallback if real cusps absent).
  const cusps: number[] =
    houseCusps && houseCusps.length === 12
      ? houseCusps
      : Array.from({ length: 12 }, (_, i) => (ascLongitude + i * 30) % 360);

  // House numbers, centered on the midpoint between consecutive cusps.
  const houseNumbers = Array.from({ length: 12 }, (_, i) => {
    const start = cusps[i];
    const end   = cusps[(i + 1) % 12];
    let span    = ((end - start) % 360 + 360) % 360;
    if (span === 0) span = 30;
    const midLon = start + span / 2;
    return { num: i + 1, pos: lonToXY(midLon, rHouseNum) };
  });

  // Planet collision resolution.
  const placed = [...planets]
    .filter((p) => typeof p.longitude === "number")
    .sort((a, b) => a.longitude - b.longitude);

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

  const planetColor = (name: string) => PLANET_COLOR[name] ?? "#8a9e8d";

  // Aspect lines, top 8 tightest majors.
  const byName: Record<string, Planet> = {};
  for (const p of planets) byName[p.planet] = p;
  const majorLines = aspects
    .filter((a) => MAJOR_ASPECTS.has(a.aspect?.toLowerCase()))
    .filter((a) => byName[a.planet1] && byName[a.planet2])
    .sort((a, b) => a.orb - b.orb)
    .slice(0, 8);

  // Uniform ring stroke per the mockup's .prop .nw-svg CSS.
  const ringStroke = "rgba(232,210,180,0.35)";
  const ringWidth  = 1.25;

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
        </defs>

        {/* Background glow */}
        <circle cx={cx} cy={cy} r={rOuter + 4} fill="url(#nwGlow)" />

        {/* Dark inner disk */}
        <circle cx={cx} cy={cy} r={rZodInner} fill="url(#nwInner)" />

        {/* Zodiac ring sectors */}
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
            <Glyph
              type="sign"
              id={s.i}
              x={s.labelPos.x}
              y={s.labelPos.y}
              size={size * 0.047}
              color={s.color}
              strokeWidth={1.35}
              opacity={0.92}
            />
          </g>
        ))}

        {/* Five ring borders, uniform stroke per the mockup */}
        <circle cx={cx} cy={cy} r={rOuter}      fill="none" stroke={ringStroke} strokeWidth={ringWidth} />
        <circle cx={cx} cy={cy} r={rZodInner}   fill="none" stroke={ringStroke} strokeWidth={ringWidth} />
        <circle cx={cx} cy={cy} r={rHouseInner} fill="none" stroke={ringStroke} strokeWidth={ringWidth} />
        <circle cx={cx} cy={cy} r={rNumInner}   fill="none" stroke={ringStroke} strokeWidth={ringWidth} />
        <circle cx={cx} cy={cy} r={rCenter}     fill="none" stroke={ringStroke} strokeWidth={ringWidth} />

        {/* House cusp lines. Angular cusps are solid; intermediate cusps are dashed. */}
        {cusps.map((lon, idx) => {
          const inner = lonToXY(lon, rNumInner);
          const outer = lonToXY(lon, rZodInner);
          const isAngle = idx === 0 || idx === 3 || idx === 6 || idx === 9;
          return (
            <line
              key={`cusp-${idx}`}
              x1={inner.x} y1={inner.y}
              x2={outer.x} y2={outer.y}
              stroke="rgba(232,210,180,0.72)"
              strokeOpacity={isAngle ? 0.72 : 0.42}
              strokeWidth={isAngle ? 1.25 : 1.0}
              strokeDasharray={isAngle ? undefined : "2 3"}
            />
          );
        })}

        {/* ASC label */}
        {(() => {
          const pos = lonToXY(ascLongitude, rZodInner - 10);
          return (
            <text
              x={pos.x} y={pos.y}
              fontSize={size * 0.034}
              fill="#f39230"
              textAnchor="middle"
              dominantBaseline="middle"
              style={{ fontFamily: "Inter, system-ui, sans-serif", letterSpacing: "0.22em", fontWeight: 600 }}
            >
              ASC
            </text>
          );
        })()}

        {/* House numbers 1-12 */}
        {houseNumbers.map(({ num, pos }) => (
          <text
            key={`hn-${num}`}
            x={pos.x} y={pos.y}
            fontSize={size * 0.034}
            fill="rgba(232,210,180,0.72)"
            textAnchor="middle"
            dominantBaseline="middle"
            style={{ fontFamily: "Inter, system-ui, sans-serif", fontWeight: 500 }}
          >
            {num}
          </text>
        ))}

        {/* Aspect lines */}
        {majorLines.map((a, i) => {
          const p1  = byName[a.planet1];
          const p2  = byName[a.planet2];
          const c1  = lonToXY(p1.longitude, rAspect);
          const c2  = lonToXY(p2.longitude, rAspect);
          const cfg = ASPECT_LINE[a.aspect.toLowerCase()];
          if (!cfg) return null;
          return (
            <line
              key={`asp-${i}`}
              x1={c1.x} y1={c1.y}
              x2={c2.x} y2={c2.y}
              stroke={cfg.color}
              strokeOpacity={cfg.opacity}
              strokeWidth={1.35}
              strokeLinecap="round"
              strokeDasharray={cfg.dash}
            />
          );
        })}

        {/* Center disk */}
        <circle cx={cx} cy={cy} r={rCenter} fill="rgba(6,16,10,0.65)" />

        {/* Planets */}
        {adjusted.map(({ p, displayLon }) => {
          if (p.planet === "ASC") return null;
          const pos    = lonToXY(displayLon, rPlanet);
          const tick1  = lonToXY(p.longitude, rZodInner);
          const tick2  = lonToXY(p.longitude, rZodInner - 6);
          const pColor = planetColor(p.planet);
          return (
            <g key={`pl-${p.planet}`}>
              {/* Tick at true ecliptic longitude, reaching into the zodiac ring */}
              <line
                x1={tick1.x} y1={tick1.y}
                x2={tick2.x} y2={tick2.y}
                stroke={pColor}
                strokeOpacity={0.9}
                strokeWidth={1.75}
                strokeLinecap="round"
              />

              {/* Retrograde marker, drawn before the planet so the planet sits on top */}
              {p.retrograde && (
                <text
                  x={pos.x + size * 0.020}
                  y={pos.y + size * 0.014}
                  fontSize={size * 0.028}
                  fill="rgba(232,210,180,0.8)"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  style={{ fontFamily: "Inter, system-ui, sans-serif", fontWeight: 600 }}
                >
                  Rx
                </text>
              )}

              {/* Planet glyph */}
              <Glyph
                type="planet"
                id={p.planet}
                x={pos.x}
                y={pos.y}
                size={size * 0.047}
                color={pColor}
                strokeWidth={1.45}
              />
            </g>
          );
        })}

        {/* Center dot */}
        <circle cx={cx} cy={cy} r={1.75} fill="rgba(232,210,180,0.45)" />
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
            color: "rgba(232,210,180,0.6)",
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
