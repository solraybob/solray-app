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
  // Filter for positive planetary lines: Jupiter MC/ASC, Venus MC/ASC, Sun MC
  const positiveLines = lines.filter(
    l => ["Jupiter", "Venus", "Sun"].includes(l.planet) && ["MC", "ASC"].includes(l.type)
  );

  const spots: Map<string, { lat: number; lon: number; lines: AstroLine[] }> = new Map();

  // Find intersections: where 2+ lines come within 15° of each other
  for (let i = 0; i < positiveLines.length; i++) {
    for (let j = i + 1; j < positiveLines.length; j++) {
      const line1 = positiveLines[i];
      const line2 = positiveLines[j];

      // Find closest points between the two lines
      let minDist = Infinity;
      let bestLat = 0,
        bestLon = 0;

      for (const p1 of line1.points) {
        for (const p2 of line2.points) {
          const dist = Math.hypot(p1.lat - p2.lat, p1.lon - p2.lon);
          if (dist < minDist) {
            minDist = dist;
            bestLat = (p1.lat + p2.lat) / 2;
            bestLon = (p1.lon + p2.lon) / 2;
          }
        }
      }

      // If within 15°, mark as intersection point
      if (minDist < 15) {
        const key = `${bestLat.toFixed(1)}-${bestLon.toFixed(1)}`;
        if (!spots.has(key)) {
          spots.set(key, { lat: bestLat, lon: bestLon, lines: [] });
        }
        const spot = spots.get(key)!;
        if (!spot.lines.includes(line1)) spot.lines.push(line1);
        if (!spot.lines.includes(line2)) spot.lines.push(line2);
      }
    }
  }

  // Convert to array and sort by number of lines (most confluent first)
  const spotList: PowerSpot[] = Array.from(spots.values())
    .filter(s => s.lines.length >= 2)
    .map(s => ({
      lat: s.lat,
      lon: s.lon,
      city: findNearestCity(s.lat, s.lon),
      lines: s.lines.map(l => `${l.planet} ${l.type}`),
      description: `${s.lines.map(l => l.symbol).join("")} Cross — powerful junction of ${s.lines
        .map(l => l.planet)
        .join(" & ")} energies`,
    }))
    .sort((a, b) => b.lines.length - a.lines.length)
    .slice(0, 3);

  return spotList;
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

// Accurate world map with Natural Earth-inspired paths
function WorldMap() {
  return (
    <g fill="#1e3d25" stroke="#0d2418" strokeWidth={0.5}>
      {/* North America */}
      <path d="M 20 65 L 45 55 L 65 50 L 85 45 L 100 48 L 110 52 L 115 60 L 120 75 L 125 90 L 128 105 L 125 120 L 115 135 L 100 145 L 85 148 L 70 145 L 55 140 L 40 130 L 30 115 L 25 95 L 22 80 Z" />

      {/* Central America & Caribbean */}
      <path d="M 115 135 L 125 138 L 130 145 L 125 150 L 115 148 Z" />

      {/* Greenland */}
      <path d="M 290 20 L 320 18 L 335 35 L 330 55 L 310 60 L 295 50 L 288 35 Z" />

      {/* South America */}
      <path d="M 100 145 L 115 150 L 125 155 L 135 165 L 145 180 L 150 200 L 148 225 L 145 250 L 138 275 L 125 290 L 115 292 L 105 285 L 100 265 L 98 240 L 98 210 L 100 175 Z" />

      {/* Iceland */}
      <path d="M 305 50 L 320 48 L 322 58 L 310 60 Z" />

      {/* British Isles */}
      <path d="M 355 70 L 368 68 L 372 78 L 360 80 Z" />

      {/* Scandinavia */}
      <path d="M 370 45 L 395 40 L 410 50 L 405 70 L 385 72 L 375 60 Z" />

      {/* Western Europe */}
      <path d="M 355 70 L 375 68 L 385 75 L 390 90 L 380 100 L 360 98 L 350 85 Z" />

      {/* Central Europe */}
      <path d="M 375 68 L 410 65 L 435 70 L 440 85 L 430 95 L 405 98 L 385 90 Z" />

      {/* Southern Europe */}
      <path d="M 380 100 L 430 95 L 455 105 L 460 120 L 440 130 L 405 125 L 385 115 Z" />

      {/* Africa */}
      <path d="M 380 115 L 440 110 L 475 120 L 495 140 L 510 165 L 515 190 L 510 215 L 495 240 L 470 260 L 440 270 L 410 268 L 385 250 L 368 220 L 362 185 L 365 150 L 375 125 Z" />

      {/* Middle East */}
      <path d="M 440 110 L 475 105 L 510 115 L 525 135 L 510 150 L 475 145 L 460 125 Z" />

      {/* Russia */}
      <path d="M 410 60 L 520 50 L 600 55 L 620 70 L 600 85 L 520 90 L 430 85 L 420 70 Z" />

      {/* Eastern Europe */}
      <path d="M 410 70 L 440 68 L 460 80 L 450 100 L 420 95 L 405 85 Z" />

      {/* Central Asia */}
      <path d="M 480 75 L 540 70 L 570 85 L 560 105 L 510 110 L 485 95 Z" />

      {/* India & South Asia */}
      <path d="M 510 120 L 555 115 L 580 130 L 585 160 L 570 185 L 540 188 L 525 170 L 520 145 Z" />

      {/* Southeast Asia */}
      <path d="M 570 130 L 620 125 L 655 135 L 665 160 L 635 170 L 605 160 L 580 145 Z" />

      {/* East Asia - China */}
      <path d="M 570 85 L 630 80 L 665 90 L 670 120 L 630 125 L 600 110 Z" />

      {/* Japan */}
      <path d="M 665 95 L 680 93 L 685 110 L 675 115 L 670 105 Z" />

      {/* Philippines */}
      <path d="M 655 140 L 670 138 L 675 155 L 665 158 Z" />

      {/* Australia */}
      <path d="M 600 210 L 670 205 L 705 225 L 710 265 L 680 280 L 635 275 L 610 250 Z" />

      {/* New Zealand */}
      <path d="M 710 270 L 735 268 L 740 310 L 720 315 Z" />

      {/* Antarctica */}
      <path d="M 0 370 L 800 370 L 800 400 L 0 400 Z" />
    </g>
  );
}
