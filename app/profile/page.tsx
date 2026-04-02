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
  cardinal: number;
  fixed: number;
  mutable: number;
}

interface NatalAspect {
  planet1: string;
  planet2: string;
  aspect: string;
  orb: number;
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
  aspects: NatalAspect[];
}

// Sign sets

const FIRE_SIGNS = new Set(["Aries", "Leo", "Sagittarius"]);
const EARTH_SIGNS = new Set(["Taurus", "Virgo", "Capricorn"]);
const AIR_SIGNS = new Set(["Gemini", "Libra", "Aquarius"]);
const WATER_SIGNS = new Set(["Cancer", "Scorpio", "Pisces"]);
const CARDINAL_SIGNS = new Set(["Aries", "Cancer", "Libra", "Capricorn"]);
const FIXED_SIGNS = new Set(["Taurus", "Leo", "Scorpio", "Aquarius"]);
const MUTABLE_SIGNS = new Set(["Gemini", "Virgo", "Sagittarius", "Pisces"]);

function clamp(v: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, v));
}

const POINTS_PER_PLANET = 14;
const POINTS_PER_ANGLE = 20;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function computeRadar(blueprint: any): RadarValues {
  const natal = blueprint?.astrology?.natal ?? {};
  const planets = natal?.planets ?? {};

  // Element + modality counting (raw points)
  const counts = { fire: 0, earth: 0, air: 0, water: 0, cardinal: 0, fixed: 0, mutable: 0 };

  function addSign(sign: string, weight: number) {
    if (FIRE_SIGNS.has(sign)) counts.fire += weight;
    else if (EARTH_SIGNS.has(sign)) counts.earth += weight;
    else if (AIR_SIGNS.has(sign)) counts.air += weight;
    else if (WATER_SIGNS.has(sign)) counts.water += weight;
    if (CARDINAL_SIGNS.has(sign)) counts.cardinal += weight;
    else if (FIXED_SIGNS.has(sign)) counts.fixed += weight;
    else if (MUTABLE_SIGNS.has(sign)) counts.mutable += weight;
  }

  // Regular planets
  Object.values(planets as Record<string, { sign?: string }>).forEach((p) => {
    addSign(p?.sign ?? "", POINTS_PER_PLANET);
  });

  // ASC and MC (higher weight)
  const ascSign = (natal?.ascendant as Record<string, string> | undefined)?.sign ?? "";
  const mcSign = (natal?.mc as Record<string, string> | undefined)?.sign ?? "";
  if (ascSign) addSign(ascSign, POINTS_PER_ANGLE);
  if (mcSign) addSign(mcSign, POINTS_PER_ANGLE);

  // Normalize to 0–100 (elements share same max, modalities share same max)
  const maxElement = Math.max(counts.fire, counts.earth, counts.air, counts.water, 1);
  const maxModality = Math.max(counts.cardinal, counts.fixed, counts.mutable, 1);

  return {
    fire: clamp(Math.round((counts.fire / maxElement) * 100)),
    earth: clamp(Math.round((counts.earth / maxElement) * 100)),
    air: clamp(Math.round((counts.air / maxElement) * 100)),
    water: clamp(Math.round((counts.water / maxElement) * 100)),
    cardinal: clamp(Math.round((counts.cardinal / maxModality) * 100)),
    fixed: clamp(Math.round((counts.fixed / maxModality) * 100)),
    mutable: clamp(Math.round((counts.mutable / maxModality) * 100)),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseProfile(blueprint: any): ProfileData {
  const natal = blueprint?.astrology?.natal ?? {};
  const hd = blueprint?.human_design ?? {};
  const gk = blueprint?.gene_keys ?? {};
  const user = blueprint?.user ?? {};
  // Name and username stored in cache with underscore prefix
  const _cachedName = blueprint?._name || "";
  const _cachedUsername = blueprint?._username || "";

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
  const name = _cachedName || user?.name || blueprint?.name || "Your Name";
  const handle = _cachedUsername || user?.handle || blueprint?.handle || user?.email?.split("@")[0] || "you";

  // Parse natal aspects with orb filtering
  const MAJOR_ASPECTS = new Set(["trine", "sextile", "conjunction", "opposition", "square"]);
  const rawAspects: NatalAspect[] = blueprint?.astrology?.natal?.aspects ?? [];
  const aspects = rawAspects.filter((a) => {
    const type = a.aspect?.toLowerCase() ?? "";
    if (MAJOR_ASPECTS.has(type)) return a.orb <= 8;
    if (type === "quincunx") return a.orb <= 3;
    return a.orb <= 2;
  });

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
    aspects,
  };
}

// SVG Icons

function IconSignOut({ color = "currentColor" }: { color?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

// Soul Map Radar — 7 axes, heptagonal polygon

const SOUL_AXIS_KEYS: (keyof RadarValues)[] = ["fire", "earth", "air", "water", "cardinal", "fixed", "mutable"];
const SOUL_AXIS_LABELS = ["Fire", "Earth", "Air", "Water", "Cardinal", "Fixed", "Mutable"] as const;

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
  radar: RadarValues;
}

function SoulMapRadarChart({ radar }: SoulMapRadarChartProps) {
  const progress = useAnimatedProgress(0);

  const OUTER = 112;
  const LABEL_PAD = 54;
  const TOTAL = OUTER * 2 + LABEL_PAD * 2;
  const cx = TOTAL / 2;
  const cy = TOTAL / 2;
  const gridLevels = [25, 50, 75, 100];

  const radarValues = SOUL_AXIS_KEYS.map((key) => radar[key]);
  const animatedValues = radarValues.map((v) => v * progress);

  return (
    <svg
      width={TOTAL}
      height={TOTAL}
      viewBox={`0 0 ${TOTAL} ${TOTAL}`}
      className="w-full max-w-[360px] mx-auto"
      aria-label="Soul Map radar chart"
    >
      {/* Grid rings */}
      {gridLevels.map((level) => {
        const r = (level / 100) * OUTER;
        return (
          <polygon
            key={level}
            points={heptGridPolygon(cx, cy, r)}
            fill="none"
            stroke="#1a3020"
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
            stroke="#1a3020"
            strokeWidth={0.7}
            opacity={0.4}
          />
        );
      })}

      {/* Reference dashed polygon at 50 (balance point) */}
      <polygon
        points={heptGridPolygon(cx, cy, (50 / 100) * OUTER)}
        fill="none"
        stroke="#8a9e8d"
        strokeWidth={1}
        strokeDasharray="4 3"
        opacity={0.30}
      />

      {/* Main amber polygon */}
      <polygon
        points={heptPolygonPoints(animatedValues, cx, cy, OUTER)}
        fill="#e8821a"
        fillOpacity={0.35 * progress}
        stroke="#e8821a"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeOpacity={progress}
      />

      {/* Vertex dots in amber */}
      {SOUL_AXIS_KEYS.map((key, i) => {
        const r = (radar[key] / 100) * OUTER * progress;
        const [x, y] = getPoint7(cx, cy, r, i);
        return (
          <circle
            key={key}
            cx={x}
            cy={y}
            r={3}
            fill="#e8821a"
            opacity={progress * 0.9}
          />
        );
      })}

      {/* Center dot */}
      <circle cx={cx} cy={cy} r={2} fill="#e8821a" opacity={0.3} />

      {/* Axis labels — outside chart */}
      {SOUL_AXIS_LABELS.map((label, i) => {
        const [lx, ly] = getPoint7(cx, cy, OUTER + 32, i);
        return (
          <text
            key={label}
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
            {label}
          </text>
        );
      })}
    </svg>
  );
}

// Natal Aspects

const ASPECT_CONFIG: Record<string, { symbol: string; label: string; color: string; major: boolean }> = {
  trine:          { symbol: "△",  label: "Trine",          color: "#2a9d8f", major: true },
  sextile:        { symbol: "⚹",  label: "Sextile",        color: "#8a9e8d", major: true },
  conjunction:    { symbol: "☌",  label: "Conjunction",    color: "#e8821a", major: true },
  opposition:     { symbol: "☍",  label: "Opposition",     color: "#e05c5c", major: true },
  square:         { symbol: "□",  label: "Square",         color: "#d4813a", major: true },
  quincunx:       { symbol: "⚻",  label: "Quincunx",      color: "#7c6fcd", major: true },
  semi_sextile:   { symbol: "⚺",  label: "Semi-Sextile",  color: "#7a9e80", major: false },
  semi_square:    { symbol: "∠",  label: "Semi-Square",   color: "#9e9e8a", major: false },
  sesquiquadrate: { symbol: "⊼",  label: "Sesquiquadrate",color: "#9e9e8a", major: false },
  quintile:       { symbol: "Q",  label: "Quintile",       color: "#9e9e8a", major: false },
  bi_quintile:    { symbol: "bQ", label: "Bi-Quintile",    color: "#9e9e8a", major: false },
};

const MAJOR_ORDER = ["conjunction", "opposition", "trine", "square", "sextile", "quincunx"];

function NatalAspects({ aspects }: { aspects: NatalAspect[] }) {
  const [openAspects, setOpenAspects] = useState<Record<string, boolean>>({});
  const [minorOpen, setMinorOpen] = useState(false);
  const [sectionOpen, setSectionOpen] = useState(false);

  if (!aspects || aspects.length === 0) return null;

  const grouped: Record<string, NatalAspect[]> = {};
  for (const a of aspects) {
    const key = a.aspect?.toLowerCase() ?? "unknown";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(a);
  }

  const majorGroups = MAJOR_ORDER.filter((k) => grouped[k]?.length > 0);
  const minorGroups = Object.keys(grouped).filter((k) => !MAJOR_ORDER.includes(k) && grouped[k]?.length > 0);

  const toggleAspect = (key: string) => {
    setOpenAspects((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const renderPlanetPairs = (key: string, list: NatalAspect[]) => {
    const cfg = ASPECT_CONFIG[key] ?? { symbol: "·", color: "#9e9e8a" };
    return (
      <div className="mt-1 pl-6 space-y-1">
        {list.map((a, i) => (
          <div key={i} className="flex items-center justify-between py-0.5">
            <span className="font-body text-xs text-text-secondary">
              {a.planet1}{" "}
              <span style={{ color: cfg.color }}>{cfg.symbol}</span>{" "}
              {a.planet2}
            </span>
            <span className="font-body text-[10px] text-text-secondary/50 ml-4">
              {a.orb.toFixed(1)}°
            </span>
          </div>
        ))}
      </div>
    );
  };

  const renderAspectRow = (key: string, list: NatalAspect[]) => {
    const cfg = ASPECT_CONFIG[key] ?? { symbol: "·", label: key, color: "#9e9e8a", major: false };
    const isOpen = openAspects[key] ?? false;
    return (
      <div key={key}>
        <button
          onClick={() => toggleAspect(key)}
          className="w-full flex items-center gap-3 py-2.5 px-1 hover:bg-forest-card/30 rounded-lg transition-colors"
        >
          <span className="text-base w-6 text-center flex-shrink-0" style={{ color: cfg.color }}>
            {cfg.symbol}
          </span>
          <span className="font-body text-sm text-text-primary flex-1 text-left">
            {cfg.label}
          </span>
          <span className="font-body text-xs text-text-secondary/70 mr-2">
            {list.length}
          </span>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#8a9e8d"
            strokeWidth="2"
            className={`transition-transform duration-200 flex-shrink-0 ${isOpen ? "rotate-180" : ""}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        {isOpen && renderPlanetPairs(key, list)}
      </div>
    );
  };

  return (
    <div className="border border-forest-border rounded-2xl overflow-hidden mb-4">
      <button
        onClick={() => setSectionOpen(!sectionOpen)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-forest-card/50 transition-colors"
      >
        <h2 className="font-heading text-xl text-text-primary">Natal Aspects</h2>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#8a9e8d"
          strokeWidth="2"
          className={`transition-transform duration-200 ${sectionOpen ? "rotate-180" : ""}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {sectionOpen && (
        <div className="px-4 pb-4">
          <div className="space-y-0.5">
            {majorGroups.map((key) => renderAspectRow(key, grouped[key]))}
          </div>
          {minorGroups.length > 0 && (
            <div className="mt-1">
              <button
                onClick={() => setMinorOpen(!minorOpen)}
                className="w-full flex items-center gap-3 py-2.5 px-1 hover:bg-forest-card/30 rounded-lg transition-colors"
              >
                <span className="text-base w-6 text-center flex-shrink-0 text-text-secondary/50">·</span>
                <span className="font-body text-sm text-text-secondary flex-1 text-left">Minor Aspects</span>
                <span className="font-body text-xs text-text-secondary/70 mr-2">
                  {minorGroups.reduce((s, k) => s + grouped[k].length, 0)}
                </span>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#8a9e8d"
                  strokeWidth="2"
                  className={`transition-transform duration-200 flex-shrink-0 ${minorOpen ? "rotate-180" : ""}`}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {minorOpen && (
                <div className="mt-1 space-y-0.5">
                  {minorGroups.map((key) => renderAspectRow(key, grouped[key]))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
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

// Pencil icon
function IconPencil() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

// Camera icon
function IconCamera() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

// Main Page

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(false);
  const { token, logout } = useAuth();
  const router = useRouter();

  // Edit state
  const [editingName, setEditingName] = useState(false);
  const [editingHandle, setEditingHandle] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [handleInput, setHandleInput] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [savingHandle, setSavingHandle] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Load avatar from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem("solray_avatar");
      if (stored) setAvatarUrl(stored);
    } catch (_) {}
  }, []);

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
          // Store name and username with the blueprint so they survive cache
          const bpWithUser = {
            ...data.blueprint,
            _name: data.profile?.name || data.name || "",
            _username: data.profile?.username || data.username || "",
            _cachedAt: Date.now()
          };
          try {
            localStorage.setItem(BP_CACHE_KEY, JSON.stringify(bpWithUser));
          } catch (_) {}
          loadFromBlueprint(bpWithUser);
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

  // Save display name
  const handleSaveName = async () => {
    if (!nameInput.trim() || !token) return;
    setSavingName(true);
    setSaveError(null);
    try {
      const data = await apiFetch("/users/profile", { method: "PATCH", body: JSON.stringify({ name: nameInput.trim() }) }, token);
      setProfile((p) => p ? { ...p, name: data.name } : p);
      setEditingName(false);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSavingName(false);
    }
  };

  // Save username
  const handleSaveHandle = async () => {
    if (!handleInput.trim() || !token) return;
    setSavingHandle(true);
    setSaveError(null);
    try {
      const data = await apiFetch("/users/profile", { method: "PATCH", body: JSON.stringify({ username: handleInput.trim() }) }, token);
      setProfile((p) => p ? { ...p, handle: data.username } : p);
      setEditingHandle(false);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSavingHandle(false);
    }
  };

  // Handle avatar selection
  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = ev.target?.result as string;
      try { localStorage.setItem("solray_avatar", base64); } catch (_) {}
      setAvatarUrl(base64);
    };
    reader.readAsDataURL(file);
  };

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
              className="text-text-secondary hover:text-amber-sun transition-colors flex items-center justify-center"
              title="Edit profile"
              aria-label="Edit profile"
              style={{ minWidth: "44px", minHeight: "44px" }}
              onClick={() => { setNameInput(profile?.name || ""); setEditingName(true); setSaveError(null); }}
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
                {/* Avatar with camera overlay */}
                <div className="relative mb-1">
                  <div
                    className="w-20 h-20 rounded-full flex items-center justify-center text-3xl font-heading text-forest-deep font-semibold shadow-lg overflow-hidden"
                    style={{ background: "#e8821a" }}
                  >
                    {avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      initials
                    )}
                  </div>
                  <button
                    onClick={() => avatarInputRef.current?.click()}
                    className="absolute bottom-0 right-0 w-7 h-7 rounded-full flex items-center justify-center border border-forest-border"
                    style={{ background: "#0a1f12", color: "#8a9e8d" }}
                    title="Change profile picture"
                  >
                    <IconCamera />
                  </button>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handleAvatarChange}
                  />
                </div>

                {/* Handle (username) */}
                {editingHandle ? (
                  <div className="flex items-center gap-2">
                    <span className="text-text-secondary text-[10px] font-body tracking-[0.15em] uppercase">@</span>
                    <input
                      className="bg-forest-card border border-forest-border rounded-lg px-2 py-1 text-xs font-body text-text-primary focus:outline-none focus:border-amber-sun/60"
                      value={handleInput}
                      onChange={(e) => setHandleInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleSaveHandle(); if (e.key === "Escape") setEditingHandle(false); }}
                      autoFocus
                    />
                    <button
                      onClick={handleSaveHandle}
                      disabled={savingHandle}
                      className="text-[10px] font-body px-2 py-1 rounded border border-amber-sun/40 text-amber-sun/80"
                    >
                      {savingHandle ? "…" : "Save"}
                    </button>
                    <button onClick={() => setEditingHandle(false)} className="text-[10px] font-body text-text-secondary">Cancel</button>
                  </div>
                ) : (
                  profile?.handle && (
                    <div className="flex items-center gap-1.5">
                      <p className="text-text-secondary text-[10px] font-body tracking-[0.15em] uppercase">
                        @{profile.handle}
                      </p>
                      <button
                        onClick={() => { setHandleInput(profile.handle); setEditingHandle(true); setSaveError(null); }}
                        className="text-text-secondary/50 hover:text-amber-sun/70 transition-colors flex items-center justify-center"
                        title="Edit username"
                        style={{ minWidth: "44px", minHeight: "44px" }}
                      >
                        <IconPencil />
                      </button>
                    </div>
                  )
                )}

                {/* Display name */}
                {editingName ? (
                  <div className="flex items-center gap-2">
                    <input
                      className="bg-forest-card border border-forest-border rounded-lg px-3 py-1.5 text-lg font-heading text-text-primary focus:outline-none focus:border-amber-sun/60 text-center"
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleSaveName(); if (e.key === "Escape") setEditingName(false); }}
                      autoFocus
                    />
                    <button
                      onClick={handleSaveName}
                      disabled={savingName}
                      className="text-[10px] font-body px-2 py-1 rounded border border-amber-sun/40 text-amber-sun/80"
                    >
                      {savingName ? "…" : "Save"}
                    </button>
                    <button onClick={() => setEditingName(false)} className="text-[10px] font-body text-text-secondary">Cancel</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <h1
                      className="font-heading text-4xl text-text-primary leading-tight text-center"
                      style={{ fontWeight: 300, letterSpacing: "-0.01em" }}
                    >
                      {profile?.name || "Your Name"}
                    </h1>
                    <button
                      onClick={() => { setNameInput(profile?.name || ""); setEditingName(true); setSaveError(null); }}
                      className="text-text-secondary/50 hover:text-amber-sun/70 transition-colors flex items-center justify-center"
                      title="Edit display name"
                      style={{ minWidth: "44px", minHeight: "44px" }}
                    >
                      <IconPencil />
                    </button>
                  </div>
                )}

                {saveError && (
                  <p className="text-red-400 text-[10px] font-body">{saveError}</p>
                )}

                {profile && (
                  <div className="flex flex-wrap justify-center gap-2 mt-2">
                    {profile.sunSign && <Tag>{profile.sunSign} Sun</Tag>}
                    {profile.hdType && <Tag>{profile.hdType}</Tag>}
                    {profile.hdProfile && <Tag>{profile.hdProfile}</Tag>}
                  </div>
                )}
              </div>

              {/* Soul Map */}
              <div className="mb-6">
                <p className="text-text-secondary/40 text-[9px] font-body tracking-[0.25em] uppercase mb-4 text-center">
                  Soul Map
                </p>

                {profile ? (
                  <div className="bg-forest-card/40 border border-forest-border/50 rounded-2xl p-4">
                    <SoulMapRadarChart radar={profile.radar} />

                    {/* Legend */}
                    <div className="mt-2 flex justify-center gap-5 text-[9px] font-body tracking-wider">
                      <span style={{ color: "#e8821a" }}>● Amber = your profile</span>
                      <span style={{ color: "#8a9e8d" }}>○ Dashed = balance point</span>
                    </div>

                    {/* Mini bar legend — all 6 dimensions with values */}
                    <div className="mt-4 space-y-1.5 px-1">
                      {SOUL_AXIS_KEYS.map((key, i) => {
                        const val = profile.radar[key];
                        const label = SOUL_AXIS_LABELS[i];
                        return (
                          <div key={key} className="flex items-center gap-2">
                            <span className="text-[9px] font-body tracking-wider uppercase text-text-secondary/60 w-20 shrink-0">
                              {label}
                            </span>
                            <div className="flex-1 h-1 rounded-full bg-forest-border/40 overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${val}%`,
                                  background: "#e8821a",
                                  opacity: 0.7,
                                }}
                              />
                            </div>
                            <span className="text-[9px] font-body text-text-secondary/50 w-7 text-right shrink-0">
                              {val}
                            </span>
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

              {/* Natal Aspects */}
              {profile && profile.aspects.length > 0 && (
                <NatalAspects aspects={profile.aspects} />
              )}

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
