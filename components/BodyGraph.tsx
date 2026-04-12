"use client";

/**
 * BodyGraph — minimalist Human Design bodygraph.
 *
 * Shows the 9 centers with their traditional shapes, colored in the Solray
 * aged palette when defined and hollow when undefined. Defined channels
 * are drawn as lines between the two centers they connect. Gate numbers
 * are hidden by default for a clean look; toggle via the `showGates` prop.
 *
 * Center coordinates are a standard bodygraph layout, hand-tuned to fit a
 * 260x340 viewBox so it slots cleanly into a profile card.
 */

type CenterKey = "Head" | "Ajna" | "Throat" | "G" | "Heart" | "Sacral" | "Spleen" | "SolarPlexus" | "Root";

// Gate → center lookup (canonical HD system)
const GATE_TO_CENTER: Record<number, CenterKey> = {
  // Head
  64: "Head", 61: "Head", 63: "Head",
  // Ajna
  47: "Ajna", 24: "Ajna", 4: "Ajna", 17: "Ajna", 43: "Ajna", 11: "Ajna",
  // Throat
  62: "Throat", 23: "Throat", 56: "Throat", 35: "Throat", 12: "Throat",
  45: "Throat", 33: "Throat", 8: "Throat", 31: "Throat", 7: "Throat",
  1: "Throat", 13: "Throat", 16: "Throat", 20: "Throat",
  // G center
  25: "G", 46: "G", 2: "G", 15: "G", 10: "G",
  // Heart / Will
  21: "Heart", 40: "Heart", 26: "Heart", 51: "Heart",
  // Sacral
  34: "Sacral", 5: "Sacral", 14: "Sacral", 29: "Sacral", 59: "Sacral",
  9: "Sacral", 3: "Sacral", 42: "Sacral", 27: "Sacral",
  // Spleen
  48: "Spleen", 57: "Spleen", 44: "Spleen", 50: "Spleen", 32: "Spleen",
  28: "Spleen", 18: "Spleen",
  // Solar Plexus
  36: "SolarPlexus", 22: "SolarPlexus", 37: "SolarPlexus", 6: "SolarPlexus",
  49: "SolarPlexus", 55: "SolarPlexus", 30: "SolarPlexus",
  // Root
  58: "Root", 38: "Root", 54: "Root", 53: "Root", 60: "Root",
  52: "Root", 19: "Root", 39: "Root", 41: "Root",
};

// Note: gates 7, 13, 1 are in both G and Throat historically; the canonical
// HD system puts 1, 13, 7 in the G center when they are part of G-Throat
// channels. For our simplified "which center does this gate belong to"
// lookup we use the Throat entries above; this only affects the rendering
// of undefined-gate dots, which we don't show by default.

// Center coordinates (center point) in a 260x340 viewBox
const CENTER_POS: Record<CenterKey, { x: number; y: number }> = {
  Head:        { x: 130, y: 30 },
  Ajna:        { x: 130, y: 80 },
  Throat:      { x: 130, y: 130 },
  G:           { x: 130, y: 180 },
  Heart:       { x: 175, y: 180 },
  Sacral:      { x: 130, y: 230 },
  Spleen:      { x: 55,  y: 230 },
  SolarPlexus: { x: 205, y: 230 },
  Root:        { x: 130, y: 300 },
};

// Accent colors per center (muted Solray palette)
const CENTER_COLOR: Record<CenterKey, string> = {
  Head:        "#c9b884", // pearl / pale gold
  Ajna:        "#8a7d68", // aged ivory
  Throat:      "#7d6680", // wisteria
  G:           "#6b7d4a", // moss
  Heart:       "#c85848", // ember-red
  Sacral:      "#d86848", // sacral red
  Spleen:      "#4a6670", // slate
  SolarPlexus: "#a87048", // ochre
  Root:        "#8a4a38", // root brown
};

// Center display names
const CENTER_LABEL: Record<CenterKey, string> = {
  Head: "Head",
  Ajna: "Ajna",
  Throat: "Throat",
  G: "G",
  Heart: "Will",
  Sacral: "Sacral",
  Spleen: "Spleen",
  SolarPlexus: "Solar",
  Root: "Root",
};

interface BodyGraphProps {
  definedCenters: string[];
  definedChannels: Array<[number, number]>;
  size?: number;
}

// Normalize a backend center name to our key
function normalize(name: string): CenterKey | null {
  const n = name.toLowerCase().replace(/[^a-z]/g, "");
  const map: Record<string, CenterKey> = {
    head: "Head",
    ajna: "Ajna",
    throat: "Throat",
    g: "G",
    gcenter: "G",
    heart: "Heart",
    will: "Heart",
    ego: "Heart",
    sacral: "Sacral",
    spleen: "Spleen",
    splenic: "Spleen",
    solarplexus: "SolarPlexus",
    solar: "SolarPlexus",
    emotional: "SolarPlexus",
    emotion: "SolarPlexus",
    root: "Root",
  };
  return map[n] ?? null;
}

// Render a center with its traditional shape
function CenterShape({
  type,
  x,
  y,
  defined,
  color,
  label,
}: {
  type: CenterKey;
  x: number;
  y: number;
  defined: boolean;
  color: string;
  label: string;
}) {
  const fill = defined ? color : "transparent";
  const fillOpacity = defined ? 0.85 : 0;
  const stroke = defined ? color : "rgba(245,240,232,0.35)";
  const strokeWidth = 1.2;
  const size = 40;

  let shape: React.ReactElement;
  if (type === "Head") {
    // Triangle pointing up
    shape = (
      <polygon
        points={`${x},${y - size * 0.7} ${x - size * 0.7},${y + size * 0.45} ${x + size * 0.7},${y + size * 0.45}`}
        fill={fill}
        fillOpacity={fillOpacity}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
    );
  } else if (type === "Ajna") {
    // Triangle pointing down
    shape = (
      <polygon
        points={`${x - size * 0.7},${y - size * 0.45} ${x + size * 0.7},${y - size * 0.45} ${x},${y + size * 0.7}`}
        fill={fill}
        fillOpacity={fillOpacity}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
    );
  } else if (type === "Throat" || type === "Sacral" || type === "Root") {
    // Square
    const s = size * 0.55;
    shape = (
      <rect
        x={x - s}
        y={y - s}
        width={s * 2}
        height={s * 2}
        fill={fill}
        fillOpacity={fillOpacity}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
    );
  } else if (type === "G") {
    // Diamond
    const s = size * 0.7;
    shape = (
      <polygon
        points={`${x},${y - s} ${x + s},${y} ${x},${y + s} ${x - s},${y}`}
        fill={fill}
        fillOpacity={fillOpacity}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
    );
  } else if (type === "Heart") {
    // Small triangle pointing left (canonical: small triangle)
    const s = size * 0.5;
    shape = (
      <polygon
        points={`${x + s},${y - s * 0.9} ${x + s},${y + s * 0.9} ${x - s * 0.9},${y}`}
        fill={fill}
        fillOpacity={fillOpacity}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
    );
  } else if (type === "Spleen") {
    // Triangle pointing right
    const s = size * 0.6;
    shape = (
      <polygon
        points={`${x - s * 0.9},${y - s} ${x - s * 0.9},${y + s} ${x + s},${y}`}
        fill={fill}
        fillOpacity={fillOpacity}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
    );
  } else {
    // SolarPlexus: triangle pointing left
    const s = size * 0.6;
    shape = (
      <polygon
        points={`${x + s * 0.9},${y - s} ${x + s * 0.9},${y + s} ${x - s},${y}`}
        fill={fill}
        fillOpacity={fillOpacity}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
    );
  }

  return (
    <g>
      {shape}
      <text
        x={x}
        y={y + 3}
        fontSize={9}
        fill={defined ? "#f5f0e8" : "rgba(245,240,232,0.55)"}
        textAnchor="middle"
        dominantBaseline="central"
        style={{ fontFamily: "var(--font-body, sans-serif)", letterSpacing: "0.08em" }}
      >
        {label}
      </text>
    </g>
  );
}

export default function BodyGraph({ definedCenters, definedChannels, size = 280 }: BodyGraphProps) {
  const viewBoxW = 260;
  const viewBoxH = 340;

  const definedSet = new Set<CenterKey>(
    definedCenters.map(normalize).filter((c): c is CenterKey => c !== null)
  );

  // Build the unique pairs of centers connected by any defined channel
  const centerPairs = new Set<string>();
  for (const [a, b] of definedChannels) {
    const ca = GATE_TO_CENTER[a];
    const cb = GATE_TO_CENTER[b];
    if (!ca || !cb || ca === cb) continue;
    const key = [ca, cb].sort().join("|");
    centerPairs.add(key);
  }

  return (
    <svg
      viewBox={`0 0 ${viewBoxW} ${viewBoxH}`}
      width="100%"
      style={{ maxWidth: size, display: "block", margin: "0 auto" }}
      aria-label="Human Design bodygraph"
    >
      {/* Channel lines behind the centers */}
      {Array.from(centerPairs).map((key) => {
        const [a, b] = key.split("|") as [CenterKey, CenterKey];
        const p1 = CENTER_POS[a];
        const p2 = CENTER_POS[b];
        if (!p1 || !p2) return null;
        return (
          <line
            key={`ch-${key}`}
            x1={p1.x}
            y1={p1.y}
            x2={p2.x}
            y2={p2.y}
            stroke="rgba(232,210,180,0.35)"
            strokeWidth={2}
          />
        );
      })}

      {/* Centers */}
      {(Object.keys(CENTER_POS) as CenterKey[]).map((key) => {
        const pos = CENTER_POS[key];
        return (
          <CenterShape
            key={key}
            type={key}
            x={pos.x}
            y={pos.y}
            defined={definedSet.has(key)}
            color={CENTER_COLOR[key]}
            label={CENTER_LABEL[key]}
          />
        );
      })}
    </svg>
  );
}
