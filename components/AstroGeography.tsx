"use client";

import { WORLD_PATHS } from "@/lib/world-paths";
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

// Force text rendering (not emoji) with \uFE0E variation selector
const PLANET_SYMBOL_OVERRIDE: Record<string, string> = {
  Sun: "☉", Moon: "☽", Mercury: "☿", Venus: "♀\uFE0E", Mars: "♂\uFE0E",
  Jupiter: "♃", Saturn: "♄", Uranus: "♅", Neptune: "♆", Pluto: "♇",
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
    const dx = Math.abs(lonToX(curr.lon) - lonToX(prev.lon));
    // Break if crossing the antimeridian OR if x jumps more than 200px (polar artifacts)
    if (dlon > 180 || dx > 200) {
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

  // Score each city by how close it is to each positive line
  // City score = sum of (1/distance) for each nearby positive line, capped at 20° radius
  const RADIUS = 20;
  const cityScores: Map<string, { score: number; nearLines: AstroLine[]; city: string; lat: number; lon: number }> = new Map();

  for (const [cityName, coord] of Object.entries(MAJOR_CITIES)) {
    let totalScore = 0;
    const nearLines: AstroLine[] = [];

    for (const line of positiveLines) {
      // Find closest point on this line to the city
      let minDist = Infinity;
      for (const pt of line.points) {
        const dlat = pt.lat - coord.lat;
        const dlon = Math.abs(pt.lon - coord.lon) > 180
          ? 360 - Math.abs(pt.lon - coord.lon)
          : Math.abs(pt.lon - coord.lon);
        const dist = Math.sqrt(dlat * dlat + dlon * dlon);
        if (dist < minDist) minDist = dist;
      }
      if (minDist < RADIUS) {
        totalScore += (RADIUS - minDist) / RADIUS; // 0-1, higher = closer
        nearLines.push(line);
      }
    }

    if (nearLines.length >= 2) {
      cityScores.set(cityName, {
        score: totalScore,
        nearLines,
        city: cityName,
        lat: coord.lat,
        lon: coord.lon,
      });
    }
  }

  // Sort by score, deduplicate by city name
  const seen = new Set<string>();
  const sorted = Array.from(cityScores.values())
    .sort((a, b) => b.score - a.score)
    .filter(s => { if (seen.has(s.city)) return false; seen.add(s.city); return true; })
    .slice(0, 3);

  return sorted.map(s => ({
    lat: s.lat,
    lon: s.lon,
    city: s.city,
    lines: s.nearLines.map(l => `${l.planet} ${l.type}`),
    description: `${s.nearLines.map(l => l.symbol).join("")} — ${s.nearLines.map(l => l.planet).join(" & ")} energies are strong here`,
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
        <FullscreenMap
          data={data}
          visibleLines={data.lines.filter(l => activePlanets.has(l.planet) && activeTypes.has(l.type))}
          powerSpots={powerSpots}
          onClose={() => setFullscreen(false)}
        />
      )}

      <div className="space-y-4">
        {/* Planet filter pills */}
        <div className="flex flex-wrap gap-1.5">
          {ALL_PLANETS.map(planet => {
            const color = data.planet_colors[planet] || "#888";
            const symbol = PLANET_SYMBOL_OVERRIDE[planet] || data.planet_symbols[planet] || planet[0];
            const active = activePlanets.has(planet);
            return (
              <button
                key={planet}
                onClick={() => togglePlanet(planet)}
                className="flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-body transition-all"
                style={{
                  border: `1px solid ${active ? color : "rgba(26,48,32,0.8)"}`,
                  background: active ? `${color}20` : "transparent",
                  color: active ? color : "#6a8068",
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
                  border: `1px solid ${active ? "#f39230" : "rgba(26,48,32,0.8)"}`,
                  background: active ? "rgba(243,146,48,0.1)" : "transparent",
                  color: active ? "#f39230" : "#6a8068",
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
          style={{ background: "rgb(var(--rgb-card))" }}
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
              <svg width="20" height="6"><line x1="0" y1="3" x2="20" y2="3" stroke="#f39230" strokeWidth="1.5" /></svg>
              <span className="text-text-secondary text-[9px] font-body">MC / ASC</span>
            </div>
            <div className="flex items-center gap-1">
              <svg width="20" height="6"><line x1="0" y1="3" x2="20" y2="3" stroke="#f39230" strokeWidth="1.5" strokeDasharray="4,3" /></svg>
              <span className="text-text-secondary text-[9px] font-body">IC / DSC</span>
            </div>
            <div className="flex items-center gap-1">
              <svg width="10" height="10"><circle cx="5" cy="5" r="4" fill="#f39230" /></svg>
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
              {PLANET_SYMBOL_OVERRIDE[hoveredLine.planet] || hoveredLine.symbol} {hoveredLine.planet} {hoveredLine.type}
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
                    topic: "Astrocartography Power Spots",
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

// Fullscreen map with pinch-to-zoom and pan
function FullscreenMap({
  data,
  visibleLines,
  powerSpots,
  onClose,
}: {
  data: AstroData;
  visibleLines: AstroLine[];
  powerSpots: PowerSpot[];
  onClose: () => void;
}) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const draggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const lastTouchDist = useRef<number | null>(null);
  const scaleRef = useRef(1);
  const offsetRef = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const resetView = () => { setScale(1); setOffset({ x: 0, y: 0 }); scaleRef.current = 1; offsetRef.current = { x: 0, y: 0 }; };

  // Use native event listeners with { passive: false } so preventDefault works
  // without polluting React's global synthetic event system
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = -e.deltaY * 0.002;
      const newScale = Math.min(8, Math.max(1, scaleRef.current + delta * scaleRef.current));
      scaleRef.current = newScale;
      setScale(newScale);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        draggingRef.current = true;
        dragStartRef.current = { x: e.touches[0].clientX - offsetRef.current.x, y: e.touches[0].clientY - offsetRef.current.y };
      } else if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        lastTouchDist.current = Math.sqrt(dx * dx + dy * dy);
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 1 && draggingRef.current) {
        const newOffset = { x: e.touches[0].clientX - dragStartRef.current.x, y: e.touches[0].clientY - dragStartRef.current.y };
        offsetRef.current = newOffset;
        setOffset({ ...newOffset });
      } else if (e.touches.length === 2 && lastTouchDist.current) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const newScale = Math.min(8, Math.max(1, scaleRef.current * (dist / lastTouchDist.current)));
        scaleRef.current = newScale;
        setScale(newScale);
        lastTouchDist.current = dist;
      }
    };

    const onTouchEnd = () => { draggingRef.current = false; lastTouchDist.current = null; };

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    draggingRef.current = true;
    dragStartRef.current = { x: e.clientX - offsetRef.current.x, y: e.clientY - offsetRef.current.y };
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!draggingRef.current) return;
    const newOffset = { x: e.clientX - dragStartRef.current.x, y: e.clientY - dragStartRef.current.y };
    offsetRef.current = newOffset;
    setOffset({ ...newOffset });
  };
  const handleMouseUp = () => { draggingRef.current = false; };

  return (
    <div
      className="fixed inset-0 z-50 bg-forest-deep"
      style={{ cursor: 'grab' }}
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Controls */}
      <div className="absolute top-4 right-4 z-10 flex gap-2">
        <button
          onClick={resetView}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-forest-card border border-forest-border text-text-secondary hover:text-text-primary transition-colors text-xs font-body"
          title="Reset view"
        >
          ↺
        </button>
        <button
          onClick={() => setScale(s => Math.min(8, s * 1.5))}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-forest-card border border-forest-border text-text-secondary hover:text-text-primary transition-colors text-lg"
        >
          +
        </button>
        <button
          onClick={() => setScale(s => Math.max(1, s / 1.5))}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-forest-card border border-forest-border text-text-secondary hover:text-text-primary transition-colors text-lg"
        >
          −
        </button>
        <button
          onClick={onClose}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-forest-card border border-forest-border text-text-secondary hover:text-amber-sun transition-colors"
        >
          ✕
        </button>
      </div>

      <div className="absolute bottom-4 left-4 text-text-secondary/40 text-[10px] font-body">
        Pinch or scroll to zoom · Drag to pan
      </div>

      {/* Map container with transform */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg
          viewBox={`0 0 ${MAP_W} ${MAP_H}`}
          style={{
            width: '100vw',
            height: '100vh',
            display: 'block',
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transformOrigin: 'center center',
            transition: 'transform 0.1s ease',
          }}
        >
          <rect width={MAP_W} height={MAP_H} fill="#071310" />
          <WorldMap />
          {/* Grid lines */}
          {[-60, -30, 0, 30, 60].map(lat => (
            <line key={`lat${lat}`} x1={0} y1={latToY(lat)} x2={MAP_W} y2={latToY(lat)}
              stroke={lat === 0 ? "#1a3020" : "#111d14"} strokeWidth={lat === 0 ? 0.8 : 0.4} />
          ))}
          {[-120, -60, 0, 60, 120].map(lon => (
            <line key={`lon${lon}`} x1={lonToX(lon)} y1={0} x2={lonToX(lon)} y2={MAP_H}
              stroke="#111d14" strokeWidth={0.4} />
          ))}
          {visibleLines.map((line, i) => {
            const path = buildPath(line.points);
            if (!path) return null;
            return (
              <path key={`fs-${i}`} d={path} stroke={line.color} strokeWidth={1.5}
                strokeOpacity={0.8} fill="none"
                strokeDasharray={line.type === "IC" || line.type === "DSC" ? "4,3" : undefined} />
            );
          })}
          {(() => {
            const slots: { x: number; row: number }[] = [];
            const mcLines = visibleLines.filter(l => l.type === "MC" && l.lon !== undefined);
            return mcLines.map((line, i) => {
              const x = lonToX(line.lon!);
              let row = 0;
              // reserve ~70px horizontal space per label (glyph + planet name)
              while (slots.some(s => s.row === row && Math.abs(s.x - x) < 70)) row++;
              slots.push({ x, row });
              const y = 14 + row * 12;
              return (
                <text key={`fslabel-${i}`} x={x + 3} y={y} fill={line.color}
                  fontSize={9} fontFamily="'Cormorant Garamond', Georgia, serif" opacity={0.9}>
                  {PLANET_SYMBOL_OVERRIDE[line.planet] || line.symbol} {line.planet}
                </text>
              );
            });
          })()}
          {powerSpots.map((spot, idx) => {
            const x = lonToX(spot.lon);
            const y = latToY(spot.lat);
            return (
              <g key={`fs-power-${idx}`}>
                <circle cx={x} cy={y} r={6} fill="#f39230" opacity={0.9} />
                <circle cx={x} cy={y} r={12} fill="none" stroke="#f39230" strokeWidth={1} opacity={0.4} />
                <text x={x} y={y - 14} textAnchor="middle" fill="#f39230"
                  fontSize={9} fontFamily="Inter, sans-serif" fontWeight="600">
                  ★ {spot.city}
                </text>
              </g>
            );
          })}
          <circle cx={lonToX(data.birth_location.lon)} cy={latToY(data.birth_location.lat)}
            r={5} fill="#f39230" opacity={0.9} />
          <circle cx={lonToX(data.birth_location.lon)} cy={latToY(data.birth_location.lat)}
            r={9} fill="none" stroke="#f39230" strokeWidth={1} opacity={0.4} />
        </svg>
      </div>
    </div>
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
      <rect width={MAP_W} height={MAP_H} fill="#071310" />

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

      {/* Planet glyphs on MC lines, stacked vertically to avoid collision.
          Each glyph slot reserves 14px of horizontal space; when an earlier glyph
          falls within that window, the next one drops to the row below instead
          of stacking on top and creating the cluttered smear we had at the top. */}
      {(() => {
        const slots: { x: number; row: number }[] = [];
        const mcLines = visibleLines.filter(l => l.type === "MC" && l.lon !== undefined);
        return mcLines.map((line, i) => {
          const x = lonToX(line.lon!);
          if (x < 10 || x > MAP_W - 10) return null;
          let row = 0;
          while (slots.some(s => s.row === row && Math.abs(s.x - x) < 14)) row++;
          slots.push({ x, row });
          const y = 14 + row * 12;
          return (
            <text
              key={`label-${line.planet}-${i}`}
              x={x + 3}
              y={y}
              fill={line.color}
              fontSize={10}
              fontFamily="'Cormorant Garamond', Georgia, serif"
              opacity={0.85}
            >
              {PLANET_SYMBOL_OVERRIDE[line.planet] || line.symbol}
            </text>
          );
        });
      })()}

      {/* Power spots as glowing amber dots */}
      {powerSpots.map((spot, idx) => {
        const x = lonToX(spot.lon);
        const y = latToY(spot.lat);
        return (
          <g key={`power-${idx}`}>
            <defs>
              <radialGradient id={`power-glow-${idx}`}>
                <stop offset="0%" stopColor="#f39230" stopOpacity={0.8} />
                <stop offset="100%" stopColor="#f39230" stopOpacity={0} />
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
            <circle cx={x} cy={y} r={4} fill="#f39230" opacity={0.95} />
            {/* Label */}
            <text
              x={x}
              y={y - 10}
              textAnchor="middle"
              fill="#f39230"
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
      <circle cx={birthX} cy={birthY} r={5} fill="#f39230" opacity={0.9} />
      <circle cx={birthX} cy={birthY} r={8} fill="none" stroke="#f39230" strokeWidth={1} opacity={0.4} />

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
            {PLANET_SYMBOL_OVERRIDE[hoveredLine.planet] || hoveredLine.symbol} {hoveredLine.planet} {hoveredLine.type}
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

// Real world map from Natural Earth 110m data
function WorldMap() {
  return (
    <g fill="#2d5438" stroke="#0a1a10" strokeWidth={0.3} strokeLinejoin="round">
      {WORLD_PATHS.map((d, i) => (
        <path key={i} d={d} />
      ))}
      {/* Iceland — not in 110m dataset, added manually */}
      <path d="M 351.1 52.2 L 368.9 54.4 L 368.9 57.8 L 360.0 59.1 L 351.1 58.9 L 346.7 56.7 L 346.7 54.4 Z" />
      {/* UK & Ireland */}
      <path d="M 355 68 L 366 66 L 370 72 L 364 76 L 356 74 Z" />
      <path d="M 349 70 L 354 69 L 355 74 L 350 75 Z" />
      {/* New Zealand North */}
      <path d="M 778 272 L 788 268 L 790 278 L 782 282 Z" />
      {/* New Zealand South */}
      <path d="M 774 282 L 784 280 L 783 296 L 773 298 Z" />
    </g>
  );
}
