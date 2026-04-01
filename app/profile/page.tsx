"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import BottomNav from "@/components/BottomNav";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";

// Types

interface RadarValues {
  fire: number;
  earth: number;
  air: number;
  water: number;
  spirit: number;
  fixed: number;
}

interface ProfileData {
  name: string;
  handle: string;
  sunSign: string;
  moonSign: string;
  risingSign: string;
  hdType: string;
  hdProfile: string;
  authority: string;
  incarnationCross: string;
  lifesWorkGate: number;
  lifesWorkGift: string;
  lifesWorkShadow: string;
  evolutionGate: number;
  evolutionGift: string;
  evolutionShadow: string;
  radar: RadarValues;
}

// Sign classification

const FIRE_SIGNS = new Set(["Aries", "Leo", "Sagittarius"]);
const EARTH_SIGNS = new Set(["Taurus", "Virgo", "Capricorn"]);
const AIR_SIGNS = new Set(["Gemini", "Libra", "Aquarius"]);
const WATER_SIGNS = new Set(["Cancer", "Scorpio", "Pisces"]);
const FIXED_SIGNS = new Set(["Taurus", "Leo", "Scorpio", "Aquarius"]);

function clamp(v: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, v));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function computeRadar(blueprint: any): RadarValues {
  const natal = blueprint?.astrology?.natal ?? {};
  const planets = natal?.planets ?? {};

  let fire = 0, earth = 0, air = 0, water = 0;
  const POINTS_PER_PLANET = 14;

  // Count planets by element
  Object.values(planets as Record<string, { sign?: string }>).forEach((p) => {
    const sign = p?.sign ?? "";
    if (FIRE_SIGNS.has(sign)) fire += POINTS_PER_PLANET;
    else if (EARTH_SIGNS.has(sign)) earth += POINTS_PER_PLANET;
    else if (AIR_SIGNS.has(sign)) air += POINTS_PER_PLANET;
    else if (WATER_SIGNS.has(sign)) water += POINTS_PER_PLANET;
  });

  // Chart angles carry extra weight
  const ASC_POINTS = 20;
  const ascSign = (natal?.ascendant as Record<string, string> | undefined)?.sign ?? "";
  const mcSign = (natal?.mc as Record<string, string> | undefined)?.sign ?? "";
  [ascSign, mcSign].forEach((angleSign) => {
    if (!angleSign) return;
    if (FIRE_SIGNS.has(angleSign)) fire += ASC_POINTS;
    else if (EARTH_SIGNS.has(angleSign)) earth += ASC_POINTS;
    else if (AIR_SIGNS.has(angleSign)) air += ASC_POINTS;
    else if (WATER_SIGNS.has(angleSign)) water += ASC_POINTS;
  });

  // Spirit: outer planet prominence in water or air signs
  // Neptune (home: Pisces), Uranus (home: Aquarius), Pluto (intensifies: Scorpio)
  const outerPlanetKeys = ["Neptune", "Uranus", "Pluto"];
  let outerInReceptiveSign = 0;
  outerPlanetKeys.forEach((key) => {
    const sign = (planets as Record<string, { sign?: string }>)[key]?.sign ?? "";
    if (WATER_SIGNS.has(sign) || AIR_SIGNS.has(sign)) outerInReceptiveSign += 1;
  });
  const spirit = clamp((outerInReceptiveSign / 3) * 100);

  // Fixed: concentration of fixed-sign planets
  const allPlanetSigns = Object.values(planets as Record<string, { sign?: string }>).map(
    (p) => p?.sign ?? ""
  );
  const totalPlanets = allPlanetSigns.filter(Boolean).length;
  const fixedPlanets = allPlanetSigns.filter((s) => FIXED_SIGNS.has(s)).length;
  const fixed = totalPlanets > 0 ? clamp((fixedPlanets / totalPlanets) * 100) : 50;

  return {
    fire: clamp(fire),
    earth: clamp(earth),
    air: clamp(air),
    water: clamp(water),
    spirit,
    fixed,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseProfile(blueprint: any): ProfileData {
  const natal = blueprint?.astrology?.natal ?? {};
  const hd = blueprint?.human_design ?? {};
  const gk = blueprint?.gene_keys ?? {};
  const user = blueprint?.user ?? {};

  const sunSign = natal?.planets?.Sun?.sign ?? "";
  const moonSign = natal?.planets?.Moon?.sign ?? "";
  const risingSign = natal?.ascendant?.sign ?? "";

  let lifesWork = { gate: 64, gift: "Imagination", shadow: "Confusion" };
  let evolution = { gate: 63, gift: "Inquiry", shadow: "Doubt" };

  if (gk.lifes_work) {
    lifesWork = { gate: gk.lifes_work.gate ?? 64, gift: gk.lifes_work.gift ?? "", shadow: gk.lifes_work.shadow ?? "" };
  } else if (gk.natal_gene_keys) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vals = Object.values(gk.natal_gene_keys as Record<string, any>).sort((a: any, b: any) => a.gate - b.gate);
    if (vals[0]) lifesWork = { gate: vals[0].gate, gift: vals[0].gift ?? "", shadow: vals[0].shadow ?? "" };
    if (vals[1]) evolution = { gate: vals[1].gate, gift: vals[1].gift ?? "", shadow: vals[1].shadow ?? "" };
  }
  if (gk.evolution) {
    evolution = { gate: gk.evolution.gate ?? 63, gift: gk.evolution.gift ?? "", shadow: gk.evolution.shadow ?? "" };
  }

  const crossLabel = hd?.incarnation_cross?.label ?? hd?.incarnation_cross ?? "";
  const name = user?.name ?? blueprint?.name ?? "Your Name";
  const handle = user?.handle ?? blueprint?.handle ?? user?.email?.split("@")[0] ?? "you";

  return {
    name,
    handle,
    sunSign,
    moonSign,
    risingSign,
    hdType: hd?.type ?? "",
    hdProfile: hd?.profile ?? "",
    authority: hd?.authority ?? "",
    incarnationCross: typeof crossLabel === "string" ? crossLabel : String(crossLabel),
    lifesWorkGate: lifesWork.gate,
    lifesWorkGift: lifesWork.gift,
    lifesWorkShadow: lifesWork.shadow,
    evolutionGate: evolution.gate,
    evolutionGift: evolution.gift,
    evolutionShadow: evolution.shadow,
    radar: computeRadar(blueprint),
  };
}

// SVG Icons (stroke-based, 16px, consistent with app design language)

function IconFire({ color = "currentColor" }: { color?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2c0 3.5-4 6.5-4 10a4 4 0 0 0 8 0c0-3.5-4-6.5-4-10z" />
      <path d="M12 21.5c-1.1 0-2-1-2-2.5 0-1.2.8-2.2 2-3.5 1.2 1.3 2 2.3 2 3.5 0 1.5-.9 2.5-2 2.5z" />
    </svg>
  );
}

function IconEarth({ color = "currentColor" }: { color?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 3 22 20 2 20" />
    </svg>
  );
}

function IconAir({ color = "currentColor" }: { color?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8h10c2 0 3-1 3-2s-1-2-3-2-2 1-2 2" />
      <path d="M3 12h15" />
      <path d="M3 16h8c2 0 3 1 3 2s-1 2-3 2-2-1-2-2" />
    </svg>
  );
}

function IconWater({ color = "currentColor" }: { color?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L6 13a6 6 0 0 0 12 0z" />
    </svg>
  );
}

function IconSpirit({ color = "currentColor" }: { color?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1l2.1-2.1M17 7l2.1-2.1" />
    </svg>
  );
}

function IconFixed({ color = "currentColor" }: { color?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l8 10-8 10-8-10z" />
    </svg>
  );
}

function IconSignOut({ color = "currentColor" }: { color?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

// Radar Chart (pure SVG)

const RADAR_DIMS = ["Fire", "Earth", "Air", "Water", "Spirit", "Fixed"] as const;
type RadarDim = (typeof RADAR_DIMS)[number];

const DIM_DESCRIPTIONS: Record<RadarDim, string> = {
  Fire: "action, will",
  Earth: "form, matter",
  Air: "thought, connection",
  Water: "feeling, depth",
  Spirit: "transpersonal",
  Fixed: "persistence, focus",
};

function getDimIcon(dim: RadarDim, color: string) {
  switch (dim) {
    case "Fire": return <IconFire color={color} />;
    case "Earth": return <IconEarth color={color} />;
    case "Air": return <IconAir color={color} />;
    case "Water": return <IconWater color={color} />;
    case "Spirit": return <IconSpirit color={color} />;
    case "Fixed": return <IconFixed color={color} />;
  }
}

function getRadarPoint(
  cx: number,
  cy: number,
  radius: number,
  index: number,
  total: number,
  progress: number
): [number, number] {
  const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
  const r = radius * progress;
  return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
}

function getLabelPoint(
  cx: number,
  cy: number,
  outerRadius: number,
  index: number,
  total: number
): [number, number] {
  const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
  const r = outerRadius + 22;
  return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
}

function radarPolygonPoints(
  values: number[],
  cx: number,
  cy: number,
  outerRadius: number,
  progress: number
): string {
  return values
    .map((v, i) => {
      const normalised = (v / 100) * outerRadius;
      const [x, y] = getRadarPoint(cx, cy, normalised, i, values.length, progress);
      return `${x},${y}`;
    })
    .join(" ");
}

function balancedPolygonPoints(
  cx: number,
  cy: number,
  outerRadius: number,
  total: number
): string {
  const r = (50 / 100) * outerRadius;
  return Array.from({ length: total }, (_, i) => {
    const angle = (Math.PI * 2 * i) / total - Math.PI / 2;
    return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
  }).join(" ");
}

function gridPolygonPoints(
  cx: number,
  cy: number,
  radius: number,
  total: number
): string {
  return Array.from({ length: total }, (_, i) => {
    const angle = (Math.PI * 2 * i) / total - Math.PI / 2;
    return `${cx + radius * Math.cos(angle)},${cy + radius * Math.sin(angle)}`;
  }).join(" ");
}

interface RadarChartProps {
  values: RadarValues;
}

function RadarChart({ values }: RadarChartProps) {
  const [progress, setProgress] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const DURATION = 800;

  useEffect(() => {
    function animate(ts: number) {
      if (startRef.current === null) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const t = Math.min(elapsed / DURATION, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setProgress(eased);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    }
    const timeout = setTimeout(() => {
      rafRef.current = requestAnimationFrame(animate);
    }, 150);
    return () => {
      clearTimeout(timeout);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const SIZE = 280;
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const OUTER = 100;

  const dimValues: number[] = [
    values.fire,
    values.earth,
    values.air,
    values.water,
    values.spirit,
    values.fixed,
  ];

  const gridLevels = [25, 50, 75, 100];

  return (
    <svg
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className="w-full max-w-[280px] mx-auto"
      aria-label="Soul radar chart"
    >
      {/* Grid rings */}
      {gridLevels.map((level) => {
        const r = (level / 100) * OUTER;
        return (
          <polygon
            key={level}
            points={gridPolygonPoints(cx, cy, r, 6)}
            fill="none"
            stroke="#1a3020"
            strokeWidth={level === 50 ? 1.5 : 0.8}
            strokeDasharray={level === 50 ? "3,3" : undefined}
            opacity={0.6}
          />
        );
      })}

      {/* Grid spokes */}
      {RADAR_DIMS.map((_, i) => {
        const angle = (Math.PI * 2 * i) / 6 - Math.PI / 2;
        const x2 = cx + OUTER * Math.cos(angle);
        const y2 = cy + OUTER * Math.sin(angle);
        return (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={x2}
            y2={y2}
            stroke="#1a3020"
            strokeWidth={0.8}
            opacity={0.5}
          />
        );
      })}

      {/* Reference hexagon at 50 on all axes */}
      <polygon
        points={balancedPolygonPoints(cx, cy, OUTER, 6)}
        fill="none"
        stroke="#8a9e8d"
        strokeWidth={1}
        strokeDasharray="4,4"
        opacity={0.3}
      />

      {/* User's radar polygon — animated */}
      <polygon
        points={radarPolygonPoints(dimValues, cx, cy, OUTER, progress)}
        fill="rgba(232, 130, 26, 0.18)"
        stroke="#e8821a"
        strokeWidth={1.8}
        strokeLinejoin="round"
        opacity={progress}
      />

      {/* Dot at each vertex */}
      {dimValues.map((v, i) => {
        const normalised = (v / 100) * OUTER;
        const [x, y] = getRadarPoint(cx, cy, normalised, i, 6, progress);
        return (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={3}
            fill="#e8821a"
            opacity={progress * 0.9}
          />
        );
      })}

      {/* Center dot */}
      <circle cx={cx} cy={cy} r={2} fill="#e8821a" opacity={0.4} />

      {/* Axis labels */}
      {RADAR_DIMS.map((dim, i) => {
        const [lx, ly] = getLabelPoint(cx, cy, OUTER, i, 6);
        const value = dimValues[i];
        return (
          <g key={dim}>
            <text
              x={lx}
              y={ly - 5}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#8a9e8d"
              fontSize="9"
              fontFamily="Inter, system-ui, sans-serif"
              letterSpacing="0.12em"
              style={{ textTransform: "uppercase" }}
            >
              {dim}
            </text>
            <text
              x={lx}
              y={ly + 8}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#e8821a"
              fontSize="10"
              fontFamily="Inter, system-ui, sans-serif"
              fontWeight="500"
              opacity={progress}
            >
              {Math.round(value)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// Collapsible Section

function CollapsibleSection({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border border-forest-border rounded-2xl overflow-hidden mb-4">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-forest-card/50 transition-colors"
      >
        <h2 className="font-heading text-xl text-text-primary">{title}</h2>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#8a9e8d"
          strokeWidth="2"
          className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && <div className="px-5 pb-5">{children}</div>}
    </div>
  );
}

// Tag

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-3 py-1 rounded-full border border-forest-border/70 text-text-secondary/70 text-[10px] font-body tracking-[0.12em] uppercase">
      {children}
    </span>
  );
}

// Skeleton

function ProfileSkeleton() {
  return (
    <div className="max-w-lg mx-auto px-5 animate-pulse">
      <div className="pt-10 pb-8 flex flex-col items-center gap-3">
        <div className="w-20 h-20 rounded-full bg-forest-border/60" />
        <div className="h-3 w-24 bg-forest-border/60 rounded" />
        <div className="h-8 w-40 bg-forest-border/60 rounded" />
        <div className="flex gap-2 mt-2">
          <div className="h-6 w-20 bg-forest-border/60 rounded-full" />
          <div className="h-6 w-24 bg-forest-border/60 rounded-full" />
        </div>
      </div>
      <div className="flex justify-center mb-8">
        <div className="w-[280px] h-[280px] bg-forest-border/30 rounded-2xl" />
      </div>
      <div className="space-y-4">
        <div className="h-14 bg-forest-border/30 rounded-2xl" />
        <div className="h-14 bg-forest-border/30 rounded-2xl" />
      </div>
    </div>
  );
}

// Main Page

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(false);
  const { token, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!token) return;

    const BP_CACHE_KEY = "solray_blueprint";

    function loadFromBlueprint(bp: any) {
      try {
        const p = parseProfile(bp);
        setProfile(p);
        setLoading(false);
        setTimeout(() => setVisible(true), 50);
      } catch {
        setLoading(false);
      }
    }

    // 1. Check cache first
    try {
      const cached = localStorage.getItem(BP_CACHE_KEY);
      if (cached) {
        const bp = JSON.parse(cached);
        loadFromBlueprint(bp);
        return;
      }
    } catch (_) {}

    // 2. Fetch from API
    apiFetch("/users/me", {}, token)
      .then((data) => {
        if (data.blueprint) {
          try {
            localStorage.setItem(
              BP_CACHE_KEY,
              JSON.stringify({ ...data.blueprint, _cachedAt: Date.now() })
            );
          } catch (_) {}
          loadFromBlueprint(data.blueprint);
        } else {
          setLoading(false);
          setTimeout(() => setVisible(true), 50);
        }
      })
      .catch(() => {
        setLoading(false);
        setTimeout(() => setVisible(true), 50);
      });
  }, [token]);

  const handleSignOut = () => {
    logout();
    router.push("/login");
  };

  const initials = profile?.name
    ? profile.name.charAt(0).toUpperCase()
    : "S";

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-forest-deep pb-28">
        {/* Header bar */}
        <div className="sticky top-0 z-10 bg-forest-deep/90 backdrop-blur-sm border-b border-forest-border/50">
          <div className="max-w-lg mx-auto px-5 py-3 flex items-center justify-between">
            <span className="font-heading text-xs tracking-[0.2em] uppercase text-text-secondary">
              Profile
            </span>
            <button
              className="text-text-secondary hover:text-amber-sun transition-colors"
              title="Edit profile (coming soon)"
              aria-label="Edit profile"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>
          </div>
        </div>

        {loading ? (
          <ProfileSkeleton />
        ) : (
          <div
            className="transition-all duration-700"
            style={{
              opacity: visible ? 1 : 0,
              transform: visible ? "translateY(0)" : "translateY(16px)",
            }}
          >
            <div className="max-w-lg mx-auto px-5">
              {/* Avatar + Identity */}
              <div className="pt-10 pb-8 flex flex-col items-center gap-2">
                <div
                  className="w-20 h-20 rounded-full flex items-center justify-center text-3xl font-heading text-forest-deep font-semibold shadow-lg mb-1"
                  style={{ background: "#e8821a" }}
                >
                  {initials}
                </div>

                {profile?.handle && (
                  <p className="text-text-secondary text-[10px] font-body tracking-[0.15em] uppercase">
                    @{profile.handle}
                  </p>
                )}

                <h1
                  className="font-heading text-4xl text-text-primary leading-tight text-center"
                  style={{ fontWeight: 300, letterSpacing: "-0.01em" }}
                >
                  {profile?.name || "Your Name"}
                </h1>

                {profile && (
                  <div className="flex flex-wrap justify-center gap-2 mt-2">
                    {profile.sunSign && <Tag>{profile.sunSign} Sun</Tag>}
                    {profile.hdType && <Tag>{profile.hdType}</Tag>}
                    {profile.hdProfile && <Tag>{profile.hdProfile}</Tag>}
                  </div>
                )}
              </div>

              {/* Radar / Soul Map */}
              <div className="mb-6">
                <p className="text-text-secondary/40 text-[9px] font-body tracking-[0.25em] uppercase mb-4 text-center">
                  Soul Map
                </p>

                {profile ? (
                  <div className="bg-forest-card/40 border border-forest-border/50 rounded-2xl p-4">
                    <RadarChart values={profile.radar} />

                    {/* Dimension legend */}
                    <div className="mt-4 grid grid-cols-3 gap-x-3 gap-y-3">
                      {RADAR_DIMS.map((dim) => {
                        const val = profile.radar[dim.toLowerCase() as keyof RadarValues];
                        return (
                          <div key={dim} className="flex items-start gap-1.5">
                            <span className="mt-0.5 shrink-0">
                              {getDimIcon(dim, "#8a9e8d")}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-text-secondary text-[9px] font-body tracking-wider uppercase leading-none">
                                {dim}
                              </p>
                              <p className="text-text-secondary/50 text-[8px] font-body mt-0.5 leading-none">
                                {DIM_DESCRIPTIONS[dim]}
                              </p>
                              <div className="h-1 bg-forest-border rounded-full overflow-hidden mt-1">
                                <div
                                  className="h-full rounded-full transition-all duration-1000 delay-500"
                                  style={{
                                    width: visible ? `${val}%` : "0%",
                                    background: "#e8821a",
                                    opacity: 0.7,
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="bg-forest-card/40 border border-forest-border/50 rounded-2xl p-8 text-center">
                    <p className="text-text-secondary font-body text-sm">
                      Complete your birth data to unlock your Soul Map
                    </p>
                  </div>
                )}
              </div>

              {/* Chart Summary */}
              {profile && (
                <CollapsibleSection title="Chart Summary" defaultOpen={false}>
                  <div className="space-y-4 mt-2">
                    {(profile.sunSign || profile.moonSign || profile.risingSign) && (
                      <div className="pb-4 border-b border-forest-border/40">
                        <p className="font-body text-text-primary text-sm leading-relaxed">
                          {[
                            profile.sunSign && `${profile.sunSign} Sun`,
                            profile.moonSign && `${profile.moonSign} Moon`,
                            profile.risingSign && `${profile.risingSign} Rising`,
                          ]
                            .filter(Boolean)
                            .join(", ")}
                        </p>
                      </div>
                    )}

                    {profile.hdType && (
                      <div className="flex items-start gap-3">
                        <span className="text-text-secondary text-[10px] font-body tracking-wider uppercase w-24 shrink-0 pt-0.5">
                          Human Design
                        </span>
                        <span className="font-body text-sm text-text-primary">
                          {[profile.hdType, profile.hdProfile, profile.authority]
                            .filter(Boolean)
                            .join(", ")}
                        </span>
                      </div>
                    )}

                    {profile.incarnationCross && (
                      <div className="flex items-start gap-3">
                        <span className="text-text-secondary text-[10px] font-body tracking-wider uppercase w-24 shrink-0 pt-0.5">
                          Cross
                        </span>
                        <span className="font-body text-sm text-text-primary">
                          {profile.incarnationCross}
                        </span>
                      </div>
                    )}
                  </div>
                </CollapsibleSection>
              )}

              {/* Gene Keys Highlights */}
              {profile && (profile.lifesWorkGift || profile.evolutionGift) && (
                <div className="mb-4 border border-forest-border rounded-2xl overflow-hidden">
                  <div className="px-5 pt-4 pb-2">
                    <h2 className="font-heading text-xl text-text-primary">Gene Keys</h2>
                  </div>
                  <div className="px-5 pb-5 space-y-4">
                    {profile.lifesWorkGift && (
                      <div className="bg-forest-card/50 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-amber-sun text-[10px] font-body tracking-wider uppercase">
                            Life&apos;s Work
                          </span>
                          <span className="text-text-secondary text-[10px] font-body">
                            Gate {profile.lifesWorkGate}
                          </span>
                        </div>
                        <p className="font-heading text-lg text-text-primary leading-tight">
                          {profile.lifesWorkShadow}
                          <span className="text-text-secondary/50 mx-2">&#8594;</span>
                          {profile.lifesWorkGift}
                        </p>
                      </div>
                    )}

                    {profile.evolutionGift && (
                      <div className="bg-forest-card/50 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-amber-sun text-[10px] font-body tracking-wider uppercase">
                            Evolution
                          </span>
                          <span className="text-text-secondary text-[10px] font-body">
                            Gate {profile.evolutionGate}
                          </span>
                        </div>
                        <p className="font-heading text-lg text-text-primary leading-tight">
                          {profile.evolutionShadow}
                          <span className="text-text-secondary/50 mx-2">&#8594;</span>
                          {profile.evolutionGift}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Sign Out */}
              <div className="mt-4 mb-6">
                <button
                  onClick={handleSignOut}
                  className="w-full py-3 rounded-2xl border border-forest-border/60 text-text-secondary text-xs font-body tracking-wider uppercase hover:border-amber-sun/40 hover:text-amber-sun transition-all duration-200 flex items-center justify-center gap-2"
                >
                  <IconSignOut />
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        )}

        <BottomNav />
      </div>
    </ProtectedRoute>
  );
}
