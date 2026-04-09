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

interface PowerSpot {
  lat: number;
  lon: number;
  city: string;
  lines: string[];
  description: string;
}

// Major cities lookup for power spot naming
const MAJOR_CITIES: Record<string, { lat: number; lon: number }> = {
  "New York": { lat: 40.7128, lon: -74.006 },
  "Los Angeles": { lat: 34.0522, lon: -118.2437 },
  "Chicago": { lat: 41.8781, lon: -87.6298 },
  "Denver": { lat: 39.7392, lon: -104.9903 },
  "Mexico City": { lat: 19.4326, lon: -99.1332 },
  "São Paulo": { lat: -23.5505, lon: -46.6333 },
  "Buenos Aires": { lat: -34.6037, lon: -58.3816 },
  "London": { lat: 51.5074, lon: -0.1278 },
  "Paris": { lat: 48.8566, lon: 2.3522 },
  "Berlin": { lat: 52.52, lon: 13.405 },
  "Madrid": { lat: 40.4168, lon: -3.7038 },
  "Rome": { lat: 41.9028, lon: 12.4964 },
  "Istanbul": { lat: 41.0082, lon: 28.9784 },
  "Cairo": { lat: 30.0444, lon: 31.2357 },
  "Lagos": { lat: 6.5244, lon: 3.3792 },
  "Dubai": { lat: 25.2048, lon: 55.2708 },
  "Bangkok": { lat: 13.7563, lon: 100.5018 },
  "Singapore": { lat: 1.3521, lon: 103.8198 },
  "Hong Kong": { lat: 22.3193, lon: 114.1694 },
  "Tokyo": { lat: 35.6762, lon: 139.6503 },
  "Mumbai": { lat: 19.076, lon: 72.8777 },
  "Delhi": { lat: 28.7041, lon: 77.1025 },
  "Shanghai": { lat: 31.2304, lon: 121.4737 },
  "Beijing": { lat: 39.9042, lon: 116.4074 },
  "Sydney": { lat: -33.8688, lon: 151.2093 },
  "Auckland": { lat: -37.7749, lon: 175.2811 },
  "Tel Aviv": { lat: 32.0853, lon: 34.7818 },
  "Reykjavik": { lat: 64.1466, lon: -21.942 },
  "Lisbon": { lat: 38.7223, lon: -9.1393 },
  "Barcelona": { lat: 41.3851, lon: 2.1734 },
  "Amsterdam": { lat: 52.3676, lon: 4.9041 },
  "Copenhagen": { lat: 55.6761, lon: 12.5683 },
  "Stockholm": { lat: 59.3293, lon: 18.0686 },
  "Moscow": { lat: 55.7558, lon: 37.6173 },
  "Abu Dhabi": { lat: 24.4539, lon: 54.3773 },
  "Johannesburg": { lat: -26.2023, lon: 28.0436 },
  "Cape Town": { lat: -33.9249, lon: 18.4241 },
  "Nairobi": { lat: -1.2921, lon: 36.8219 },
  "Rio de Janeiro": { lat: -22.9068, lon: -43.1729 },
  "Lima": { lat: -12.0464, lon: -77.0428 },
  "Bogotá": { lat: 4.7110, lon: -74.0721 },
  "Cancun": { lat: 21.1619, lon: -86.8515 },
  "Sedona": { lat: 34.8697, lon: -111.761 },
  "Malibu": { lat: 34.0195, lon: -118.6819 },
  "Kauai": { lat: 22.0964, lon: -159.591 },
  "Bali": { lat: -8.6705, lon: 115.2126 },
  "Ubud": { lat: -8.5069, lon: 115.2625 },
  "Venice": { lat: 45.4408, lon: 12.3155 },
  "Prague": { lat: 50.0755, lon: 14.4378 },
};

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

function findNearestCity(lat: number, lon: number): string {
  let nearest = "Unknown Location";
  let minDist = Infinity;
  for (const [city, coord] of Object.entries(MAJOR_CITIES)) {
    const dist = Math.hypot(coord.lat - lat, coord.lon - lon);
    if (dist < minDist) {
      minDist = dist;
      nearest = city;
    }
  }
  return nearest;
}

function calculatePowerSpots(lines: AstroLine[]): PowerSpot[] {
  const positiveLines = lines.filter(
    l => ["Jupiter", "Venus", "Sun"].includes(l.planet) && ["MC", "ASC"].includes(l.type)
  );

  const candidates: { lat: number; lon: number; line1: AstroLine; line2: AstroLine; dist: number }[] = [];

  for (let i = 0; i < positiveLines.length; i++) {
    for (let j = i + 1; j < positiveLines.length; j++) {
      const line1 = positiveLines[i];
      const line2 = positiveLines[j];
      let minDist = Infinity;
      let bestLat = 0, bestLon = 0;

      for (const p1 of line1.points) {
        for (const p2 of line2.points) {
          if (Math.abs(p1.lat - p2.lat) > 12) continue;
          const dlat = p1.lat - p2.lat;
          const dlon = Math.abs(p1.lon - p2.lon) > 180
            ? 360 - Math.abs(p1.lon - p2.lon)
            : Math.abs(p1.lon - p2.lon);
          const dist = Math.sqrt(dlat * dlat + dlon * dlon);
          if (dist < minDist) {
            minDist = dist;
            bestLat = (p1.lat + p2.lat) / 2;
            bestLon = (p1.lon + p2.lon) / 2;
          }
        }
      }

      if (minDist < 12) {
        candidates.push({ lat: bestLat, lon: bestLon, line1, line2, dist: minDist });
      }
    }
  }

  candidates.sort((a, b) => a.dist - b.dist);

  // Deduplicate: skip spots within 25 degrees of an already selected one
  const merged: typeof candidates = [];
  for (const c of candidates) {
    const tooClose = merged.some(m => {
      const d = Math.sqrt(Math.pow(c.lat - m.lat, 2) + Math.pow(c.lon - m.lon, 2));
      return d < 25;
    });
    if (!tooClose) merged.push(c);
    if (merged.length >= 3) break;
  }

  return merged.map(c => ({
    lat: c.lat,
    lon: c.lon,
    city: findNearestCity(c.lat, c.lon),
    lines: [`${c.line1.planet} ${c.line1.type}`, `${c.line2.planet} ${c.line2.type}`],
    description: `${c.line1.symbol}${c.line2.symbol} — ${c.line1.planet} & ${c.line2.planet} energies converge here`,
  }));
}

export default function AstroGeography({ token }: { token: string | null }) {
  const [data, setData] = useState<AstroData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activePlanets, setActivePlanets] = useState<Set<string>>(new Set(["Sun", "Moon", "Venus", "Mars", "Jupiter"]));
  const [activeTypes, setActiveTypes] = useState<Set<string>>(new Set(["MC", "ASC"]));
  const [hoveredLine, setHoveredLine] = useState<AstroLine | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [fullscreen, setFullscreen] = useState(false);
  const [powerSpots, setPowerSpots] = useState<PowerSpot[]>([]);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!token) return;
    const cacheKey = "solray_astrocarto";
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        setData(parsed);
        setPowerSpots(calculatePowerSpots(parsed.lines));
        setLoading(false);
        return;
      }
    } catch (_) {}

    apiFetch("/astrocartography", {}, token)
      .then((d: AstroData) => {
        setData(d);
        setPowerSpots(calculatePowerSpots(d.lines));
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
    <>
      {/* Fullscreen modal */}
      {fullscreen && (
        <div className="fixed inset-0 z-50 bg-forest-deep flex items-center justify-center p-4">
          <button
            onClick={() => setFullscreen(false)}
            className="absolute top-4 right-4 z-51 w-10 h-10 flex items-center justify-center rounded-full bg-forest-border/30 hover:bg-forest-border/50 transition-colors"
            aria-label="Close fullscreen"
          >
            <svg
              className="w-6 h-6 stroke-text-secondary"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <div className="w-full h-full max-w-6xl max-h-[90vh]">
            <MapSVG
              data={data}
              visibleLines={data.lines.filter(
                l => activePlanets.has(l.planet) && activeTypes.has(l.type)
              )}
              powerSpots={powerSpots}
              hoveredLine={hoveredLine}
              setHoveredLine={setHoveredLine}
              tooltipPos={tooltipPos}
              setTooltipPos={setTooltipPos}
              svgRef={svgRef}
              handleMouseMove={handleMouseMove}
              fullscreen
            />
          </div>
        </div>
      )}

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
          className="relative rounded-2xl overflow-hidden border border-forest-border/50 cursor-pointer group"
          style={{ background: "#0a1f12" }}
          onClick={() => setFullscreen(true)}
        >
          <MapSVG
            data={data}
            visibleLines={data.lines.filter(
              l => activePlanets.has(l.planet) && activeTypes.has(l.type)
            )}
            powerSpots={powerSpots}
            hoveredLine={hoveredLine}
            setHoveredLine={setHoveredLine}
            tooltipPos={tooltipPos}
            setTooltipPos={setTooltipPos}
            svgRef={svgRef}
            handleMouseMove={handleMouseMove}
          />

          {/* Expand hint */}
          <div className="absolute bottom-3 right-3 text-text-secondary/40 text-xs font-body flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            <span>⤢</span>
            <span>Expand</span>
          </div>

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

        {/* Power Spots section */}
        {powerSpots.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-body tracking-wider uppercase text-text-secondary">Power Spots</h3>
              <button
                onClick={() => {
                  const spotNames = powerSpots.map(s => s.city).join(", ");
                  sessionStorage.setItem("solray_chat_prompt", JSON.stringify({
                    topic: "Astro Geography Power Spots",
                    question: `My astrocartography shows my top power spots are: ${spotNames}. Can you explain what these locations mean for me and why they are energetically significant?`
                  }));
                  window.location.href = "/chat";
                }}
                className="text-[9px] font-body tracking-wider uppercase text-amber-sun/60 hover:text-amber-sun transition-colors border border-amber-sun/20 hover:border-amber-sun/50 px-2 py-0.5 rounded-full"
              >
                Ask →
              </button>
            </div>
            <div className="grid grid-cols-1 gap-2">
              {powerSpots.map((spot, idx) => (
                <div
                  key={idx}
                  className="px-3 py-2 rounded-lg border border-amber-500/30 bg-amber-500/5 flex items-start justify-between gap-2"
                >
                  <div className="flex-1">
                    <p className="text-sm font-body text-amber-400/90 mb-0.5">{spot.city}</p>
                    <p className="text-xs text-text-secondary">{spot.lines.join(" + ")}</p>
                    <p className="text-xs text-text-secondary/70 mt-1">{spot.description}</p>
                  </div>
                  <button
                    onClick={() => {
                      sessionStorage.setItem("solray_chat_prompt", JSON.stringify({
                        topic: `Power Spot: ${spot.city}`,
                        question: `My astrocartography shows ${spot.city} as a power spot where ${spot.lines.join(" and ")} cross. What would living or visiting ${spot.city} activate in my chart?`
                      }));
                      window.location.href = "/chat";
                    }}
                    className="text-[9px] font-body tracking-wider uppercase text-amber-sun/60 hover:text-amber-sun transition-colors border border-amber-sun/20 hover:border-amber-sun/50 px-2 py-0.5 rounded-full shrink-0 mt-0.5"
                  >
                    Ask →
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

interface MapSVGProps {
  data: AstroData;
  visibleLines: AstroLine[];
  powerSpots: PowerSpot[];
  hoveredLine: AstroLine | null;
  setHoveredLine: (line: AstroLine | null) => void;
  tooltipPos: { x: number; y: number };
  setTooltipPos: (pos: { x: number; y: number }) => void;
  svgRef: React.RefObject<SVGSVGElement>;
  handleMouseMove: (e: React.MouseEvent<SVGSVGElement>) => void;
  fullscreen?: boolean;
}

function MapSVG({
  data,
  visibleLines,
  powerSpots,
  hoveredLine,
  setHoveredLine,
  tooltipPos,
  setTooltipPos,
  svgRef,
  handleMouseMove,
  fullscreen,
}: MapSVGProps) {
  const birthX = lonToX(data.birth_location.lon);
  const birthY = latToY(data.birth_location.lat);

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${MAP_W} ${MAP_H}`}
      className={fullscreen ? "w-full h-full" : "w-full"}
      style={{ display: "block", cursor: "crosshair" }}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHoveredLine(null)}
    >
      {/* Ocean background */}
      <rect width={MAP_W} height={MAP_H} fill="#0a1810" />

      {/* World map with improved paths */}
      <WorldMap />

      {/* Grid lines */}
      {[-60, -30, 0, 30, 60].map(lat => (
        <line
          key={`lat${lat}`}
          x1={0}
          y1={latToY(lat)}
          x2={MAP_W}
          y2={latToY(lat)}
          stroke={lat === 0 ? "#1a3020" : "#111d14"}
          strokeWidth={lat === 0 ? 0.8 : 0.4}
        />
      ))}
      {[-120, -60, 0, 60, 120].map(lon => (
        <line
          key={`lon${lon}`}
          x1={lonToX(lon)}
          y1={0}
          x2={lonToX(lon)}
          y2={MAP_H}
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
      {visibleLines
        .filter(l => l.type === "MC" && l.lon !== undefined)
        .map((line, i) => {
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

      {/* Power spots as glowing amber dots */}
      {powerSpots.map((spot, idx) => {
        const x = lonToX(spot.lon);
        const y = latToY(spot.lat);
        return (
          <g key={`power-${idx}`}>
            <defs>
              <radialGradient id={`power-glow-${idx}`}>
                <stop offset="0%" stopColor="#e8821a" stopOpacity={0.8} />
                <stop offset="100%" stopColor="#e8821a" stopOpacity={0} />
              </radialGradient>
            </defs>
            {/* Pulsing glow background */}
            <circle
              cx={x}
              cy={y}
              r={12}
              fill={`url(#power-glow-${idx})`}
              style={{
                animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
              }}
            />
            {/* Core dot */}
            <circle cx={x} cy={y} r={4} fill="#e8821a" opacity={0.95} />
            {/* Label */}
            <text
              x={x}
              y={y - 10}
              textAnchor="middle"
              fill="#e8821a"
              fontSize={7}
              fontFamily="Inter, sans-serif"
              fontWeight="600"
              opacity={0.7}
            >
              {spot.city.split(" ")[0]}
            </text>
          </g>
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

      <style>{`
        @keyframes pulse {
          0%, 100% { r: 12; opacity: 0.8; }
          50% { r: 16; opacity: 0.4; }
        }
      `}</style>
    </svg>
  );
}

// Coordinate-accurate world map
function WorldMap() {
  return (
    <g fill="#1e3d25" stroke="#0d2418" strokeWidth={0.4}>
      <path d="M 88.9 44.4 L 133.3 40.0 L 188.9 44.4 L 211.1 37.8 L 233.3 48.9 L 255.6 60.0 L 255.6 66.7 L 266.7 77.8 L 277.8 88.9 L 282.2 95.6 L 282.2 102.2 L 288.9 106.7 L 255.6 106.7 L 244.4 111.1 L 233.3 122.2 L 222.2 133.3 L 222.2 144.4 L 200.0 144.4 L 200.0 151.1 L 206.7 155.6 L 211.1 164.4 L 215.6 177.8 L 228.9 182.2 L 228.9 182.2 L 224.4 180.0 L 233.3 177.8 L 242.2 173.3 L 262.2 173.3 L 266.7 166.7 L 253.3 160.0 L 251.1 160.0 L 244.4 155.6 L 222.2 151.1 L 222.2 144.4 L 222.2 133.3 L 233.3 122.2 L 233.3 115.6 L 237.8 111.1 L 244.4 106.7 L 262.2 100.0 L 280.0 95.6 L 277.8 88.9 L 266.7 77.8 L 244.4 77.8 L 226.7 71.1 L 231.1 66.7 L 228.9 57.8 L 233.3 48.9 L 211.1 44.4 L 188.9 40.0 L 133.3 37.8 L 111.1 44.4 L 88.9 55.6 L 82.2 66.7 L 111.1 77.8 L 117.8 88.9 L 124.4 100.0 L 124.4 111.1 L 133.3 122.2 L 140.0 133.3 L 155.6 144.4 L 166.7 151.1 L 166.7 155.6 L 177.8 155.6 L 182.2 151.1 L 184.4 144.4 L 184.4 137.8 L 188.9 133.3 L 200.0 133.3 L 200.0 144.4 L 200.0 151.1 L 206.7 155.6 L 182.2 155.6 L 166.7 151.1 L 155.6 144.4 L 140.0 133.3 L 133.3 122.2 L 124.4 111.1 L 124.4 100.0 L 117.8 88.9 L 111.1 77.8 L 82.2 66.7 L 88.9 55.6 L 88.9 44.4 Z" />
      <path d="M 240.0 173.3 L 264.4 173.3 L 262.2 177.8 L 262.2 182.2 L 266.7 188.9 L 286.7 191.1 L 288.9 195.6 L 288.9 200.0 L 322.2 211.1 L 315.6 222.2 L 311.1 233.3 L 311.1 244.4 L 304.4 248.9 L 304.4 251.1 L 293.3 255.6 L 288.9 266.7 L 282.2 273.3 L 273.3 277.8 L 262.2 284.4 L 262.2 288.9 L 255.6 293.3 L 255.6 300.0 L 255.6 306.7 L 248.9 315.6 L 248.9 322.2 L 255.6 322.2 L 271.1 315.6 L 284.4 306.7 L 288.9 293.3 L 273.3 284.4 L 273.3 277.8 L 288.9 266.7 L 293.3 255.6 L 306.7 248.9 L 311.1 244.4 L 311.1 233.3 L 315.6 222.2 L 322.2 211.1 L 288.9 200.0 L 288.9 195.6 L 286.7 191.1 L 266.7 188.9 L 262.2 182.2 L 262.2 177.8 L 264.4 173.3 Z" />
      <path d="M 462.2 42.2 L 444.4 44.4 L 431.1 48.9 L 431.1 55.6 L 417.8 60.0 L 411.1 66.7 L 417.8 73.3 L 426.7 77.8 L 422.2 80.0 L 431.1 77.8 L 440.0 80.0 L 442.2 88.9 L 435.6 93.3 L 420.0 95.6 L 415.6 97.8 L 406.7 102.2 L 406.7 104.4 L 404.4 108.9 L 391.1 111.1 L 386.7 120.0 L 380.0 120.0 L 380.0 115.6 L 380.0 106.7 L 382.2 102.2 L 395.6 97.8 L 395.6 93.3 L 404.4 88.9 L 404.4 86.7 L 408.9 86.7 L 411.1 84.4 L 415.6 82.2 L 422.2 80.0 L 426.7 77.8 L 422.2 73.3 L 426.7 71.1 L 435.6 71.1 L 440.0 66.7 L 435.6 62.2 L 431.1 60.0 L 431.1 55.6 L 440.0 48.9 L 455.6 44.4 L 462.2 42.2 Z" />
      <path d="M 422.2 117.8 L 477.8 117.8 L 471.1 133.3 L 482.2 151.1 L 495.6 173.3 L 493.3 200.0 L 488.9 211.1 L 488.9 222.2 L 477.8 233.3 L 477.8 244.4 L 473.3 255.6 L 457.8 275.6 L 444.4 277.8 L 437.8 266.7 L 433.3 255.6 L 426.7 244.4 L 426.7 233.3 L 431.1 222.2 L 422.2 211.1 L 417.8 200.0 L 406.7 188.9 L 395.6 188.9 L 388.9 182.2 L 366.7 177.8 L 364.4 173.3 L 362.2 166.7 L 362.2 155.6 L 366.7 151.1 L 366.7 144.4 L 377.8 133.3 L 422.2 117.8 Z" />
      <path d="M 457.8 44.4 L 511.1 44.4 L 622.2 44.4 L 711.1 55.6 L 766.7 66.7 L 766.7 77.8 L 733.3 88.9 L 711.1 100.0 L 688.9 111.1 L 671.1 122.2 L 671.1 133.3 L 668.9 144.4 L 655.6 151.1 L 644.4 160.0 L 631.1 177.8 L 628.9 188.9 L 631.1 197.8 L 644.4 197.8 L 628.9 188.9 L 631.1 177.8 L 640.0 166.7 L 644.4 155.6 L 666.7 144.4 L 666.7 133.3 L 666.7 122.2 L 688.9 111.1 L 711.1 100.0 L 733.3 88.9 L 755.6 77.8 L 777.8 66.7 L 777.8 55.6 L 755.6 44.4 L 711.1 40.0 L 622.2 40.0 L 555.6 44.4 L 511.1 44.4 L 466.7 44.4 L 466.7 55.6 L 466.7 66.7 L 488.9 77.8 L 488.9 88.9 L 477.8 93.3 L 477.8 100.0 L 477.8 106.7 L 480.0 111.1 L 480.0 115.6 L 480.0 122.2 L 475.6 133.3 L 475.6 137.8 L 477.8 144.4 L 493.3 155.6 L 497.8 166.7 L 497.8 173.3 L 497.8 177.8 L 497.8 166.7 L 493.3 155.6 L 477.8 144.4 L 475.6 133.3 L 480.0 122.2 L 480.0 111.1 L 477.8 100.0 L 477.8 93.3 L 488.9 88.9 L 488.9 77.8 L 466.7 66.7 L 466.7 55.6 L 457.8 44.4 Z" />
      <path d="M 688.9 233.3 L 702.2 226.7 L 717.8 226.7 L 724.4 237.8 L 731.1 244.4 L 740.0 255.6 L 740.0 266.7 L 733.3 277.8 L 726.7 284.4 L 722.2 284.4 L 706.7 277.8 L 704.4 277.8 L 697.8 273.3 L 695.6 271.1 L 680.0 271.1 L 653.3 255.6 L 653.3 248.9 L 662.2 244.4 L 671.1 237.8 L 684.4 233.3 L 688.9 233.3 Z" />
      <path d="M 300.0 15.6 L 344.4 15.6 L 360.0 26.7 L 351.1 40.0 L 340.0 48.9 L 311.1 55.6 L 284.4 55.6 L 284.4 44.4 L 271.1 40.0 L 255.6 31.1 L 271.1 22.2 L 300.0 15.6 Z" />
      {/* India */}
      <path d="M 562.2 151.1 L 555.6 144.4 L 551.1 151.1 L 562.2 155.6 L 564.4 166.7 L 573.3 177.8 L 571.1 182.2 L 577.8 182.2 L 577.8 177.8 L 577.8 173.3 L 577.8 166.7 L 591.1 155.6 L 600.0 151.1 L 595.6 144.4 L 588.9 137.8 L 577.8 137.8 L 573.3 144.4 L 562.2 151.1 Z" />
      {/* Japan */}
      <path d="M 682 83 L 690 82 L 692 95 L 685 97 Z" />
      {/* UK/Ireland */}
      <path d="M 355 69 L 366 67 L 370 75 L 362 78 Z" />
      {/* New Zealand */}
      <path d="M 782.2 277.8 L 788.9 284.4 L 782.2 295.6 L 773.3 300.0 L 773.3 293.3 L 788.9 282.2 L 782.2 277.8 Z" />
      {/* Madagascar */}
      <path d="M 508.9 226.7 L 511.1 231.1 L 506.7 240.0 L 497.8 248.9 L 500.0 255.6 L 497.8 248.9 L 506.7 240.0 L 511.1 231.1 L 508.9 226.7 Z" />
      {/* Antarctica */}
      <path d="M 0 375 L 800 375 L 800 400 L 0 400 Z" />
    </g>
  );
}
