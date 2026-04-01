"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import BottomNav from "@/components/BottomNav";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";

// Types

interface ElementScores {
  fire: number;
  earth: number;
  air: number;
  water: number;
}

interface ModalRadar {
  cardinal: ElementScores;
  fixed: ElementScores;
  mutable: ElementScores;
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
  radar: ModalRadar;
}

// Sign classification by modality + element

// Cardinal signs
const CARDINAL_FIRE = new Set(["Aries"]);
const CARDINAL_EARTH = new Set(["Capricorn"]);
const CARDINAL_AIR = new Set(["Libra"]);
const CARDINAL_WATER = new Set(["Cancer"]);

// Fixed signs
const FIXED_FIRE = new Set(["Leo"]);
const FIXED_EARTH = new Set(["Taurus"]);
const FIXED_AIR = new Set(["Aquarius"]);
const FIXED_WATER = new Set(["Scorpio"]);

// Mutable signs
const MUTABLE_FIRE = new Set(["Sagittarius"]);
const MUTABLE_EARTH = new Set(["Virgo"]);
const MUTABLE_AIR = new Set(["Gemini"]);
const MUTABLE_WATER = new Set(["Pisces"]);

function clamp(v: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, v));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function computeRadar(blueprint: any): ModalRadar {
  const natal = blueprint?.astrology?.natal ?? {};
  const planets = natal?.planets ?? {};

  const POINTS_PER_PLANET = 14;
  const ASC_POINTS = 20;

  const cardinal = { fire: 0, earth: 0, air: 0, water: 0 };
  const fixed = { fire: 0, earth: 0, air: 0, water: 0 };
  const mutable = { fire: 0, earth: 0, air: 0, water: 0 };

  function scoreSign(sign: string, points: number) {
    if (CARDINAL_FIRE.has(sign)) cardinal.fire += points;
    else if (CARDINAL_EARTH.has(sign)) cardinal.earth += points;
    else if (CARDINAL_AIR.has(sign)) cardinal.air += points;
    else if (CARDINAL_WATER.has(sign)) cardinal.water += points;
    else if (FIXED_FIRE.has(sign)) fixed.fire += points;
    else if (FIXED_EARTH.has(sign)) fixed.earth += points;
    else if (FIXED_AIR.has(sign)) fixed.air += points;
    else if (FIXED_WATER.has(sign)) fixed.water += points;
    else if (MUTABLE_FIRE.has(sign)) mutable.fire += points;
    else if (MUTABLE_EARTH.has(sign)) mutable.earth += points;
    else if (MUTABLE_AIR.has(sign)) mutable.air += points;
    else if (MUTABLE_WATER.has(sign)) mutable.water += points;
  }

  Object.values(planets as Record<string, { sign?: string }>).forEach((p) => {
    scoreSign(p?.sign ?? "", POINTS_PER_PLANET);
  });

  const ascSign = (natal?.ascendant as Record<string, string> | undefined)?.sign ?? "";
  const mcSign = (natal?.mc as Record<string, string> | undefined)?.sign ?? "";
  [ascSign, mcSign].forEach((s) => s && scoreSign(s, ASC_POINTS));

  // Normalize each ring separately so each element axis is 0-100
  function normalizeRing(ring: ElementScores): ElementScores {
    const max = Math.max(ring.fire, ring.earth, ring.air, ring.water, 1);
    const scale = 100 / max;
    return {
      fire: clamp(ring.fire * scale),
      earth: clamp(ring.earth * scale),
      air: clamp(ring.air * scale),
      water: clamp(ring.water * scale),
    };
  }

  return {
    cardinal: normalizeRing(cardinal),
    fixed: normalizeRing(fixed),
    mutable: normalizeRing(mutable),
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

// SVG Icons

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

function IconSignOut({ color = "currentColor" }: { color?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

// Radar Chart — 4 axes, 3 modal polygons

const RADAR_AXES = ["Fire", "Earth", "Air", "Water"] as const;
type RadarAxis = (typeof RADAR_AXES)[number];

const AXIS_ICONS_MAP: Record<RadarAxis, (color: string) => React.ReactNode> = {
  Fire: (c) => <IconFire color={c} />,
  Earth: (c) => <IconEarth color={c} />,
  Air: (c) => <IconAir color={c} />,
  Water: (c) => <IconWater color={c} />,
};

const MODAL_CONFIG = [
  { key: "cardinal" as const, label: "Cardinal", color: "#e8821a", fillOpacity: 0.28, strokeOpacity: 0.9, delay: 0 },
  { key: "fixed"    as const, label: "Fixed",    color: "#c9681a", fillOpacity: 0.22, strokeOpacity: 0.7, delay: 150 },
  { key: "mutable"  as const, label: "Mutable",  color: "#a04d10", fillOpacity: 0.16, strokeOpacity: 0.5, delay: 300 },
];

function getPoint(
  cx: number,
  cy: number,
  radius: number,
  index: number,
  total: number
): [number, number] {
  const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
  return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
}

function polygonPoints(
  scores: ElementScores,
  cx: number,
  cy: number,
  outerRadius: number,
  progress: number
): string {
  const vals = [scores.fire, scores.earth, scores.air, scores.water];
  return vals
    .map((v, i) => {
      const r = (v / 100) * outerRadius * progress;
      const [x, y] = getPoint(cx, cy, r, i, 4);
      return `${x},${y}`;
    })
    .join(" ");
}

function gridPolygon(cx: number, cy: number, radius: number): string {
  return Array.from({ length: 4 }, (_, i) => {
    const [x, y] = getPoint(cx, cy, radius, i, 4);
    return `${x},${y}`;
  }).join(" ");
}

interface ModalRadarChartProps {
  radar: ModalRadar;
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

function ModalRadarChart({ radar }: ModalRadarChartProps) {
  const progressCardinal = useAnimatedProgress(0);
  const progressFixed = useAnimatedProgress(150);
  const progressMutable = useAnimatedProgress(300);

  const progressMap = { cardinal: progressCardinal, fixed: progressFixed, mutable: progressMutable };

  const SIZE = 280;
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const OUTER = 96;
  const gridLevels = [25, 50, 75, 100];

  return (
    <svg
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className="w-full max-w-[280px] mx-auto"
      aria-label="Soul modal radar chart"
    >
      {/* Grid rings */}
      {gridLevels.map((level) => {
        const r = (level / 100) * OUTER;
        return (
          <polygon
            key={level}
            points={gridPolygon(cx, cy, r)}
            fill="none"
            stroke="#1a3020"
            strokeWidth={level === 50 ? 1.5 : 0.8}
            strokeDasharray={level === 50 ? "3,3" : undefined}
            opacity={0.6}
          />
        );
      })}

      {/* Grid spokes */}
      {RADAR_AXES.map((_, i) => {
        const [x2, y2] = getPoint(cx, cy, OUTER, i, 4);
        return (
          <line
            key={i}
            x1={cx} y1={cy}
            x2={x2} y2={y2}
            stroke="#1a3020"
            strokeWidth={0.8}
            opacity={0.5}
          />
        );
      })}

      {/* Three modal polygons — mutable first (back), cardinal last (front) */}
      {[...MODAL_CONFIG].reverse().map(({ key, color, fillOpacity, strokeOpacity }) => {
        const p = progressMap[key];
        return (
          <polygon
            key={key}
            points={polygonPoints(radar[key], cx, cy, OUTER, p)}
            fill={color}
            fillOpacity={fillOpacity * p}
            stroke={color}
            strokeWidth={1.6}
            strokeLinejoin="round"
            strokeOpacity={strokeOpacity * p}
          />
        );
      })}

      {/* Vertex dots for cardinal ring (frontmost) */}
      {[radar.cardinal.fire, radar.cardinal.earth, radar.cardinal.air, radar.cardinal.water].map((v, i) => {
        const r = (v / 100) * OUTER * progressCardinal;
        const [x, y] = getPoint(cx, cy, r, i, 4);
        return (
          <circle
            key={i}
            cx={x} cy={y}
            r={2.5}
            fill="#e8821a"
            opacity={progressCardinal * 0.9}
          />
        );
      })}

      {/* Center dot */}
      <circle cx={cx} cy={cy} r={2} fill="#e8821a" opacity={0.4} />

      {/* Axis labels */}
      {RADAR_AXES.map((axis, i) => {
        const [lx, ly] = getPoint(cx, cy, OUTER + 22, i, 4);
        return (
          <text
            key={axis}
            x={lx}
            y={ly}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#8a9e8d"
            fontSize="9"
            fontFamily="Inter, system-ui, sans-serif"
            letterSpacing="0.12em"
            style={{ textTransform: "uppercase" }}
          >
            {axis}
          </text>
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

    try {
      const cached = localStorage.getItem(BP_CACHE_KEY);
      if (cached) {
        loadFromBlueprint(JSON.parse(cached));
        return;
      }
    } catch (_) {}

    apiFetch("/users/me", {}, token)
      .then((data) => {
        if (data.blueprint) {
          try {
            localStorage.setItem(BP_CACHE_KEY, JSON.stringify({ ...data.blueprint, _cachedAt: Date.now() }));
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

  const initials = profile?.name ? profile.name.charAt(0).toUpperCase() : "S";

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
                    <ModalRadarChart radar={profile.radar} />

                    {/* Axis icons row */}
                    <div className="mt-2 flex justify-center gap-5">
                      {RADAR_AXES.map((axis) => (
                        <div key={axis} className="flex flex-col items-center gap-1">
                          {AXIS_ICONS_MAP[axis]("#8a9e8d")}
                          <span className="text-text-secondary/60 text-[8px] font-body tracking-wider uppercase">
                            {axis}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Modal legend */}
                    <div className="mt-4 flex justify-center gap-5">
                      {MODAL_CONFIG.map(({ label, color }) => (
                        <div key={label} className="flex items-center gap-1.5">
                          <span
                            className="inline-block w-2 h-2 rounded-full"
                            style={{ background: color }}
                          />
                          <span
                            className="text-[9px] font-body tracking-wider uppercase"
                            style={{ color }}
                          >
                            {label}
                          </span>
                        </div>
                      ))}
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
