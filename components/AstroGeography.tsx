"use client";

import { useEffect, useState, useRef } from "react";
import { apiFetch } from "@/lib/api";

interface LinePoint {
  lat: number;
  lon: number;
}

interface AstroLine {
  planet: string;
  symbol: string;
  color: string;
  type: "MC" | "IC" | "ASC" | "DSC";
  points: LinePoint[];
  lon?: number;
  meaning?: string;
}

interface AstroData {
  lines: AstroLine[];
  birth_location: { lat: number; lon: number };
  planet_colors: Record<string, string>;
  planet_symbols: Record<string, string>;
}

const ALL_PLANETS = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"];
const ALL_LINE_TYPES = ["MC", "IC", "ASC", "DSC"];

// Map dimensions
const MAP_W = 800;
const MAP_H = 400;

function lonToX(lon: number): number {
  return ((lon + 180) / 360) * MAP_W;
}

function latToY(lat: number): number {
  return ((90 - lat) / 180) * MAP_H;
}

function buildPath(points: LinePoint[]): string {
  if (points.length === 0) return "";
  
  // Split into segments when longitude wraps around the map
  const segments: LinePoint[][] = [];
  let current: LinePoint[] = [points[0]];
  
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const dlon = Math.abs(curr.lon - prev.lon);
    // Break if crossing the antimeridian (lon jump > 180)
    if (dlon > 180) {
      segments.push(current);
      current = [];
    }
    current.push(curr);
  }
  if (current.length > 0) segments.push(current);
  
  return segments
    .map(seg => {
      if (seg.length === 0) return "";
      const start = `M ${lonToX(seg[0].lon).toFixed(1)} ${latToY(seg[0].lat).toFixed(1)}`;
      const rest = seg
        .slice(1)
        .map(p => `L ${lonToX(p.lon).toFixed(1)} ${latToY(p.lat).toFixed(1)}`)
        .join(" ");
      return `${start} ${rest}`;
    })
    .join(" ");
}

export default function AstroGeography({ token }: { token: string | null }) {
  const [data, setData] = useState<AstroData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activePlanets, setActivePlanets] = useState<Set<string>>(new Set(["Sun", "Moon", "Venus", "Mars", "Jupiter"]));
  const [activeTypes, setActiveTypes] = useState<Set<string>>(new Set(["MC", "ASC"]));
  const [hoveredLine, setHoveredLine] = useState<AstroLine | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!token) return;
    const cacheKey = "solray_astrocarto";
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        setData(JSON.parse(cached));
        setLoading(false);
        return;
      }
    } catch (_) {}

    apiFetch("/astrocartography", {}, token)
      .then((d: AstroData) => {
        setData(d);
        try { localStorage.setItem(cacheKey, JSON.stringify(d)); } catch (_) {}
      })
      .catch(() => setError("Could not load astrocartography data."))
      .finally(() => setLoading(false));
  }, [token]);

  const togglePlanet = (planet: string) => {
    setActivePlanets(prev => {
      const next = new Set(prev);
      if (next.has(planet)) { if (next.size > 1) next.delete(planet); }
      else next.add(planet);
      return next;
    });
  };

  const toggleType = (type: string) => {
    setActiveTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) { if (next.size > 1) next.delete(type); }
      else next.add(type);
      return next;
    });
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (rect) {
      setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
  };

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-48 bg-forest-border/30 rounded-2xl" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-text-secondary text-sm font-body text-center py-6">
        {error || "No astrocartography data available."}
      </div>
    );
  }

  const visibleLines = data.lines.filter(
    l => activePlanets.has(l.planet) && activeTypes.has(l.type)
  );

  const birthX = lonToX(data.birth_location.lon);
  const birthY = latToY(data.birth_location.lat);

  return (
    <div className="space-y-4">
      {/* Planet filter pills */}
      <div className="flex flex-wrap gap-1.5">
        {ALL_PLANETS.map(planet => {
          const color = data.planet_colors[planet] || "#888";
          const symbol = data.planet_symbols[planet] || planet[0];
          const active = activePlanets.has(planet);
          return (
            <button
              key={planet}
              onClick={() => togglePlanet(planet)}
              className="flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-body transition-all"
              style={{
                border: `1px solid ${active ? color : "rgba(26,48,32,0.8)"}`,
                background: active ? `${color}20` : "transparent",
                color: active ? color : "#4a5e4d",
              }}
            >
              <span>{symbol}</span>
              <span className="tracking-wider">{planet}</span>
            </button>
          );
        })}
      </div>

      {/* Line type filter */}
      <div className="flex gap-2">
        {ALL_LINE_TYPES.map(type => {
          const active = activeTypes.has(type);
          const labels: Record<string, string> = { MC: "MC Midheaven", IC: "IC Nadir", ASC: "ASC Rising", DSC: "DSC Setting" };
          return (
            <button
              key={type}
              onClick={() => toggleType(type)}
              className="px-2.5 py-1 rounded-full text-[10px] font-body tracking-wider transition-all"
              style={{
                border: `1px solid ${active ? "#e8821a" : "rgba(26,48,32,0.8)"}`,
                background: active ? "rgba(232,130,26,0.1)" : "transparent",
                color: active ? "#e8821a" : "#4a5e4d",
              }}
            >
              {labels[type]}
            </button>
          );
        })}
      </div>

      {/* Map */}
      <div
        className="relative rounded-2xl overflow-hidden border border-forest-border/50"
        style={{ background: "#0a1f12" }}
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${MAP_W} ${MAP_H}`}
          className="w-full"
          style={{ display: "block", cursor: "crosshair" }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoveredLine(null)}
        >
          {/* Ocean background */}
          <rect width={MAP_W} height={MAP_H} fill="#0a1810" />

          {/* Simple world map outline — major land masses as paths */}
          <WorldMap />

          {/* Grid lines */}
          {[-60, -30, 0, 30, 60].map(lat => (
            <line
              key={`lat${lat}`}
              x1={0} y1={latToY(lat)} x2={MAP_W} y2={latToY(lat)}
              stroke={lat === 0 ? "#1a3020" : "#111d14"}
              strokeWidth={lat === 0 ? 0.8 : 0.4}
            />
          ))}
          {[-120, -60, 0, 60, 120].map(lon => (
            <line
              key={`lon${lon}`}
              x1={lonToX(lon)} y1={0} x2={lonToX(lon)} y2={MAP_H}
              stroke="#111d14"
              strokeWidth={0.4}
            />
          ))}

          {/* Planetary lines */}
          {visibleLines.map((line, i) => {
            const path = buildPath(line.points);
            if (!path) return null;
            const isHovered = hoveredLine === line;
            return (
              <path
                key={`${line.planet}-${line.type}-${i}`}
                d={path}
                stroke={line.color}
                strokeWidth={isHovered ? 2.5 : 1.2}
                strokeOpacity={isHovered ? 1 : 0.65}
                fill="none"
                strokeDasharray={line.type === "IC" || line.type === "DSC" ? "4,3" : undefined}
                onMouseEnter={() => setHoveredLine(line)}
                style={{ cursor: "pointer" }}
              />
            );
          })}

          {/* Planet labels on MC lines */}
          {visibleLines.filter(l => l.type === "MC" && l.lon !== undefined).map((line, i) => {
            const x = lonToX(line.lon!);
            if (x < 10 || x > MAP_W - 10) return null;
            return (
              <text
                key={`label-${line.planet}-${i}`}
                x={x + 3}
                y={20}
                fill={line.color}
                fontSize={9}
                fontFamily="Inter, sans-serif"
                opacity={0.8}
              >
                {line.symbol}
              </text>
            );
          })}

          {/* Birth location marker */}
          <circle cx={birthX} cy={birthY} r={5} fill="#e8821a" opacity={0.9} />
          <circle cx={birthX} cy={birthY} r={8} fill="none" stroke="#e8821a" strokeWidth={1} opacity={0.4} />

          {/* Tooltip */}
          {hoveredLine && (
            <g>
              <rect
                x={Math.min(tooltipPos.x + 8, MAP_W - 160)}
                y={Math.max(tooltipPos.y - 30, 5)}
                width={150}
                height={44}
                rx={6}
                fill="#0a1f12"
                stroke={hoveredLine.color}
                strokeWidth={1}
                opacity={0.95}
              />
              <text
                x={Math.min(tooltipPos.x + 16, MAP_W - 152)}
                y={Math.max(tooltipPos.y - 14, 19)}
                fill={hoveredLine.color}
                fontSize={10}
                fontFamily="Inter, sans-serif"
                fontWeight="600"
              >
                {hoveredLine.symbol} {hoveredLine.planet} {hoveredLine.type}
              </text>
              <text
                x={Math.min(tooltipPos.x + 16, MAP_W - 152)}
                y={Math.max(tooltipPos.y + 2, 35)}
                fill="#8a9e8d"
                fontSize={8.5}
                fontFamily="Inter, sans-serif"
              >
                {(hoveredLine.meaning || "").slice(0, 38)}
              </text>
            </g>
          )}
        </svg>

        {/* Legend */}
        <div className="px-3 pb-3 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1">
            <svg width="20" height="6"><line x1="0" y1="3" x2="20" y2="3" stroke="#e8821a" strokeWidth="1.5" /></svg>
            <span className="text-text-secondary text-[9px] font-body">MC / ASC</span>
          </div>
          <div className="flex items-center gap-1">
            <svg width="20" height="6"><line x1="0" y1="3" x2="20" y2="3" stroke="#e8821a" strokeWidth="1.5" strokeDasharray="4,3" /></svg>
            <span className="text-text-secondary text-[9px] font-body">IC / DSC</span>
          </div>
          <div className="flex items-center gap-1">
            <svg width="10" height="10"><circle cx="5" cy="5" r="4" fill="#e8821a" /></svg>
            <span className="text-text-secondary text-[9px] font-body">Birth place</span>
          </div>
        </div>
      </div>

      {/* Hovered line interpretation */}
      {hoveredLine?.meaning && (
        <div
          className="px-4 py-3 rounded-xl border transition-all"
          style={{ borderColor: `${hoveredLine.color}40`, background: `${hoveredLine.color}08` }}
        >
          <p className="text-[10px] font-body tracking-wider uppercase mb-1" style={{ color: hoveredLine.color }}>
            {hoveredLine.symbol} {hoveredLine.planet} {hoveredLine.type}
          </p>
          <p className="text-text-secondary text-xs font-body leading-relaxed">{hoveredLine.meaning}</p>
        </div>
      )}
    </div>
  );
}

// Simplified world map SVG paths
function WorldMap() {
  return (
    <g opacity={0.25} fill="#1a4020" stroke="#0a2810" strokeWidth={0.3}>
      {/* North America */}
      <path d="M 40 80 L 90 70 L 130 75 L 150 90 L 145 120 L 130 145 L 110 160 L 90 165 L 70 155 L 55 140 L 45 120 L 40 100 Z" />
      {/* Central America */}
      <path d="M 110 160 L 130 145 L 135 165 L 125 175 L 115 172 Z" />
      {/* South America */}
      <path d="M 115 172 L 140 170 L 160 190 L 165 220 L 155 260 L 140 290 L 120 300 L 110 280 L 105 250 L 108 220 L 112 195 Z" />
      {/* Europe */}
      <path d="M 370 65 L 400 60 L 430 65 L 440 80 L 430 95 L 410 100 L 390 95 L 375 85 Z" />
      {/* Scandinavia */}
      <path d="M 390 45 L 415 40 L 425 55 L 415 65 L 400 60 L 390 65 Z" />
      {/* Africa */}
      <path d="M 380 115 L 430 110 L 455 130 L 460 165 L 450 210 L 430 245 L 405 255 L 385 245 L 370 215 L 365 175 L 370 140 Z" />
      {/* Asia */}
      <path d="M 435 65 L 530 55 L 600 60 L 640 75 L 650 100 L 630 120 L 580 130 L 540 125 L 490 115 L 455 105 L 440 90 Z" />
      {/* Middle East */}
      <path d="M 455 105 L 490 100 L 500 120 L 485 135 L 465 130 L 455 115 Z" />
      {/* India */}
      <path d="M 520 120 L 555 115 L 565 140 L 555 170 L 535 175 L 520 155 L 515 135 Z" />
      {/* Southeast Asia */}
      <path d="M 580 120 L 630 115 L 650 130 L 640 150 L 610 155 L 590 140 Z" />
      {/* Australia */}
      <path d="M 600 200 L 660 195 L 690 215 L 690 250 L 665 270 L 635 268 L 610 250 L 598 225 Z" />
      {/* Japan */}
      <path d="M 645 85 L 660 80 L 665 95 L 655 102 L 645 95 Z" />
      {/* British Isles */}
      <path d="M 362 72 L 372 68 L 375 78 L 368 82 Z" />
      {/* Iceland */}
      <path d="M 320 58 L 340 55 L 345 65 L 333 70 L 322 65 Z" />
      {/* Greenland */}
      <path d="M 230 30 L 290 25 L 305 45 L 295 65 L 265 70 L 240 60 L 228 45 Z" />
    </g>
  );
}
