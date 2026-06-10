"use client";

/**
 * BodyGraph: Human Design bodygraph. June 2026 redesign (Bob-approved mockup
 * solray_chart_redesign.html).
 *
 * Shows the 9 centers with their traditional shapes, colored in the Solray
 * aged palette when defined and hollow when undefined. Defined channels are
 * drawn as full-bodied amber lines between the two centers they connect.
 *
 * Two upgrades over the prior clean version:
 *   1. Defined centers carry a soft same-color glow so they lift off the
 *      field (filter #bgGlow), matching the wheel's glyph treatment.
 *   2. Activated gate numbers now show on each defined center, placed at the
 *      edge of the center pointing toward the partner it channels to (the
 *      gate's real position), derived from the user's actual definedChannels
 *      rather than a static list. Numbers sit on the filled center in dark
 *      ink so they read cleanly. A small perpendicular nudge resolves the
 *      rare case where two gates on one center face the same direction.
 *
 * Center labels live OUTSIDE the shapes in the surrounding whitespace so
 * they never collide with gate numbers, fit inside the small G diamond,
 * or crowd a narrow Heart triangle. The viewBox is extended to give the
 * labels breathing room on all sides.
 *
 * Center coordinates are a standard bodygraph layout tuned to a 260x340
 * canvas; the viewBox is expanded to -10,-4,340,348 to make room for the
 * external labels.
 */

import { useTheme } from "@/lib/theme-context";

type CenterKey = "Head" | "Ajna" | "Throat" | "G" | "Heart" | "Sacral" | "Spleen" | "SolarPlexus" | "Root";

// Gate -> center lookup (canonical HD system)
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

// Accent colors per center, Solray aged-pigment palette. Values track the
// bodygraph "proposed" spec in solray-contrast-compare.html so categorical
// coding (throat / heart / sacral read as warm fire, spleen as moss, root
// as slate) survives desaturation and harmonises with the forest field.
const CENTER_COLOR: Record<CenterKey, string> = {
  Head:        "#9b86a0", // wisteria
  Ajna:        "#9babb9", // mist
  Throat:      "#d47a52", // ember
  G:           "#ece4cf", // pearl
  Heart:       "#d47a52", // ember
  Sacral:      "#d47a52", // ember
  Spleen:      "#8a9e66", // moss
  SolarPlexus: "var(--wisteria)", // wisteria
  Root:        "#6a8692", // slate
};

// External label positions (outside the shape, in surrounding whitespace).
// Each entry is the x,y of the label anchor plus the SVG text-anchor.
// Tuned so labels never collide with gate numbers or shape edges.
const CENTER_LABEL_POS: Record<
  CenterKey,
  { x: number; y: number; anchor: "start" | "middle" | "end"; text: string }
> = {
  Head:        { x: 158, y: 24,  anchor: "start",  text: "HEAD" },
  Ajna:        { x: 158, y: 86,  anchor: "start",  text: "AJNA" },
  Throat:      { x: 158, y: 130, anchor: "start",  text: "THROAT" },
  G:           { x: 101, y: 180, anchor: "end",    text: "G" },
  Heart:       { x: 198, y: 168, anchor: "start",  text: "HEART" },
  Sacral:      { x: 130, y: 267, anchor: "middle", text: "SACRAL" },
  Spleen:      { x: 55,  y: 262, anchor: "middle", text: "SPLEEN" },
  SolarPlexus: { x: 230, y: 230, anchor: "start",  text: "SOLAR" },
  Root:        { x: 158, y: 300, anchor: "start",  text: "ROOT" },
};

interface BodyGraphProps {
  definedCenters: string[];
  definedChannels: Array<[number, number]>;
  size?: number;
}

// Normalize a backend center name to our key. Accepts the raw backend
// enum ("G", "SolarPlexus", "Heart") as well as the display-formatted
// variants produced by normaliseCentreName in app/profile/page.tsx
// ("G Centre", "Solar Plexus", "Heart / Ego"). Previously "gcentre" and
// "heartego" fell through as null and the bodygraph rendered those
// centres as undefined even when the backend said they were defined.
function normalize(name: string): CenterKey | null {
  const n = (name || "").toLowerCase().replace(/[^a-z]/g, "");
  if (!n) return null;
  const map: Record<string, CenterKey> = {
    head: "Head",
    ajna: "Ajna",
    throat: "Throat",
    g: "G",
    gcenter: "G",
    gcentre: "G",
    heart: "Heart",
    heartego: "Heart",
    egoheart: "Heart",
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

// Render a center with its traditional shape, no embedded label.
function CenterShape({
  type,
  x,
  y,
  defined,
  color,
}: {
  type: CenterKey;
  x: number;
  y: number;
  defined: boolean;
  color: string;
}) {
  const fill = defined ? color : "transparent";
  const fillOpacity = defined ? 0.94 : 0;
  const stroke = defined ? color : "rgba(168,184,171,0.55)";
  const strokeWidth = 1.3;
  const size = 40;
  const glow = defined ? "url(#bgGlow)" : undefined;

  if (type === "Head") {
    return (
      <polygon
        points={`${x},${y - size * 0.7} ${x - size * 0.7},${y + size * 0.45} ${x + size * 0.7},${y + size * 0.45}`}
        fill={fill}
        fillOpacity={fillOpacity}
        stroke={stroke}
        strokeWidth={strokeWidth}
        filter={glow}
      />
    );
  }
  if (type === "Ajna") {
    return (
      <polygon
        points={`${x - size * 0.7},${y - size * 0.45} ${x + size * 0.7},${y - size * 0.45} ${x},${y + size * 0.7}`}
        fill={fill}
        fillOpacity={fillOpacity}
        stroke={stroke}
        strokeWidth={strokeWidth}
        filter={glow}
      />
    );
  }
  if (type === "Throat" || type === "Sacral" || type === "Root") {
    const s = size * 0.55;
    return (
      <rect
        x={x - s}
        y={y - s}
        width={s * 2}
        height={s * 2}
        rx={3}
        fill={fill}
        fillOpacity={fillOpacity}
        stroke={stroke}
        strokeWidth={strokeWidth}
        filter={glow}
      />
    );
  }
  if (type === "G") {
    const s = size * 0.7;
    return (
      <polygon
        points={`${x},${y - s} ${x + s},${y} ${x},${y + s} ${x - s},${y}`}
        fill={fill}
        fillOpacity={fillOpacity}
        stroke={stroke}
        strokeWidth={strokeWidth}
        filter={glow}
      />
    );
  }
  if (type === "Heart") {
    const s = size * 0.5;
    return (
      <polygon
        points={`${x + s},${y - s * 0.9} ${x + s},${y + s * 0.9} ${x - s * 0.9},${y}`}
        fill={fill}
        fillOpacity={fillOpacity}
        stroke={stroke}
        strokeWidth={strokeWidth}
        filter={glow}
      />
    );
  }
  if (type === "Spleen") {
    const s = size * 0.6;
    return (
      <polygon
        points={`${x - s * 0.9},${y - s} ${x - s * 0.9},${y + s} ${x + s},${y}`}
        fill={fill}
        fillOpacity={fillOpacity}
        stroke={stroke}
        strokeWidth={strokeWidth}
        filter={glow}
      />
    );
  }
  // SolarPlexus: triangle pointing left
  const s = size * 0.6;
  return (
    <polygon
      points={`${x + s * 0.9},${y - s} ${x + s * 0.9},${y + s} ${x - s},${y}`}
      fill={fill}
      fillOpacity={fillOpacity}
      stroke={stroke}
      strokeWidth={strokeWidth}
      filter={glow}
    />
  );
}

export default function BodyGraph({ definedCenters, definedChannels, size = 280 }: BodyGraphProps) {
  const { theme } = useTheme();
  const isDark = theme !== "light";
  // Center labels: muted sage on the dark theme, deep forest-green on the light
  // theme so they read clearly against the pearl ground.
  const labelFill = isDark ? "#a8b8ab" : "#1f3a28";
  // Extended viewBox gives the external labels breathing room on all sides.
  const vbX = -10;
  const vbY = -4;
  const vbW = 340;
  const vbH = 348;

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

  // Place each activated gate number at the edge of its center, pointing
  // toward the partner center it channels to. A gate's true position is
  // where its channel leaves the center, so this reads like a real chart.
  const GATE_OFFSET = 16;
  const gateLabels: { gate: number; x: number; y: number }[] = [];
  for (const [gA, gB] of definedChannels) {
    const cA = GATE_TO_CENTER[gA];
    const cB = GATE_TO_CENTER[gB];
    if (!cA || !cB || cA === cB) continue;
    const pA = CENTER_POS[cA];
    const pB = CENTER_POS[cB];
    if (!pA || !pB) continue;
    if (!definedSet.has(cA) || !definedSet.has(cB)) continue;
    const dx = pB.x - pA.x;
    const dy = pB.y - pA.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    gateLabels.push({ gate: gA, x: pA.x + ux * GATE_OFFSET, y: pA.y + uy * GATE_OFFSET });
    gateLabels.push({ gate: gB, x: pB.x - ux * GATE_OFFSET, y: pB.y - uy * GATE_OFFSET });
  }
  // De-dupe identical gates and nudge any that collide.
  const seenGate = new Set<number>();
  const placedLabels: { gate: number; x: number; y: number }[] = [];
  for (const g of gateLabels) {
    if (seenGate.has(g.gate)) continue;
    seenGate.add(g.gate);
    let { x, y } = g;
    let guard = 0;
    while (placedLabels.some((p) => Math.hypot(p.x - x, p.y - y) < 11) && guard < 6) {
      x += 7;
      y += 4;
      guard++;
    }
    placedLabels.push({ gate: g.gate, x, y });
  }

  return (
    <svg
      viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
      width="100%"
      style={{ maxWidth: size, display: "block", margin: "0 auto" }}
      aria-label="Human Design bodygraph"
    >
      <defs>
        {/* Soft same-color halo so defined centers lift off the field. */}
        <filter id="bgGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3.5" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Channel lines behind the centers, full-bodied amber */}
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
            stroke="rgba(243,146,48,0.75)"
            strokeWidth={3}
            strokeLinecap="round"
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
          />
        );
      })}

      {/* Activated gate numbers, on the filled center in dark ink */}
      {placedLabels.map((g) => (
        <text
          key={`gate-${g.gate}`}
          x={g.x}
          y={g.y}
          textAnchor="middle"
          dominantBaseline="central"
          fill="#050f08"
          style={{
            fontFamily: "Inter, system-ui, sans-serif",
            fontSize: "10px",
            fontWeight: 600,
          }}
        >
          {g.gate}
        </text>
      ))}

      {/* External labels, placed in surrounding whitespace */}
      {(Object.keys(CENTER_LABEL_POS) as CenterKey[]).map((key) => {
        const lbl = CENTER_LABEL_POS[key];
        return (
          <text
            key={`lbl-${key}`}
            x={lbl.x}
            y={lbl.y}
            textAnchor={lbl.anchor as "start" | "middle" | "end"}
            dominantBaseline="middle"
            fill={labelFill}
            fillOpacity={0.92}
            style={{
              fontFamily: "Inter, system-ui, sans-serif",
              fontSize: "11.5px",
              fontWeight: 500,
              letterSpacing: "0.20em",
            }}
          >
            {lbl.text}
          </text>
        );
      })}
    </svg>
  );
}
