"use client";

import { useEffect, useState, useRef } from "react";
import { useT } from "@/lib/i18n";
import { type RadarValues } from "../_lib/profile-data";

// Soul Map Radar, 7 axes, heptagonal polygon

const SOUL_AXIS_KEYS: (keyof RadarValues)[] = ["fire", "earth", "air", "water", "cardinal", "fixed", "mutable"];
// Plain names for the seven axes (9 Oct 2026). The values are the same
// element and modality balance as before; only the words changed.
const SOUL_AXIS_LABELS = ["Drive", "Grounding", "Thought", "Feeling", "Starting", "Holding", "Adapting"] as const;
const SOUL_AXIS_ES: Record<string, string> = {
  Drive: "Impulso", Grounding: "Arraigo", Thought: "Pensamiento", Feeling: "Sentimiento",
  Starting: "Iniciar", Holding: "Sostener", Adapting: "Adaptar",
};

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


export function SoulMapRadarChart({ radar, radarDisplay }: SoulMapRadarChartProps) {
  const { lang, t } = useT();
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
      role="img"
      aria-label={t("profile.soul_map")}
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
              {lang && lang.startsWith("es") ? SOUL_AXIS_ES[label] : label}
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
