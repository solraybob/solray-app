"use client";

/**
 * /admin/hive — visual dashboard for the Solray collective
 *
 * Central Solray sun. Each user is a node connected to it. Edges between
 * users drawn when they share chart components (sun sign, HD type, etc.).
 * The graph fills in as the collective grows. Force-directed layout, runs
 * a small physics simulation client-side.
 *
 * Admin-only via the existing require_admin gate on /admin/hive/graph.
 *
 * Aesthetic: forest-deep ground, amber sun core with the same drop-shadow
 * halo as the landing hero, user nodes coloured by Sun-sign element.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/lib/auth-context";

type GraphNode = {
  id: string;
  name: string;
  sun_sign?: string | null;
  hd_type?: string | null;
  component_count?: number;
};

type GraphEdge = { a: string; b: string; weight: number };

type Counts = {
  consenting_users: number;
  chart_signals: number;
  chart_components: number;
  pattern_cohorts: number;
  pattern_themes: number;
  pattern_correlations: number;
  high_confidence_cohorts: number;
};

type GraphData = {
  counts: Counts;
  nodes: GraphNode[];
  edges: GraphEdge[];
  top_cohorts: Array<{ name: string; member_count: number; confidence: number }>;
};

// Sun-sign element families → colour. Aligns with the extended palette so
// the graph reads as Solray, not as a generic D3 demo.
const ELEMENT_COLOR: Record<string, string> = {
  Aries: "#d47a52",       // ember (fire)
  Leo: "#f39230",         // amber (fire)
  Sagittarius: "#d47a52", // ember
  Taurus: "#8a9e66",      // moss (earth)
  Virgo: "#8a9e66",
  Capricorn: "#5a6e40",
  Gemini: "#9babb9",      // mist (air)
  Libra: "#9babb9",
  Aquarius: "#647a90",
  Cancer: "#9b86a0",      // wisteria (water)
  Scorpio: "#82648a",
  Pisces: "#9b86a0",
};

const CORE_COLOR = "#f39230"; // amber-sun
const EDGE_COLOR = "rgba(243, 146, 48, 0.18)";

interface PhysicsNode {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  data: GraphNode;
}

export default function HiveDashboardPage() {
  return (
    <ProtectedRoute>
      <HiveDashboardInner />
    </ProtectedRoute>
  );
}

function HiveDashboardInner() {
  const { token } = useAuth();
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState<string | null>(null);

  const apiUrl = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").trim();

  const load = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/admin/hive/graph`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401 || res.status === 403) {
        setError("This area is for Solray operators only.");
        setLoading(false);
        return;
      }
      const data = await res.json();
      setGraph(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  // No /login redirect here. ProtectedRoute (wrapping this component)
  // owns auth routing. A racing router.replace from this effect would
  // bounce the user through /login then back to /today.
  useEffect(() => {
    if (!token) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const fireAction = async (path: string, label: string) => {
    if (!token) return;
    setActionPending(label);
    setActionMsg(null);
    try {
      const res = await fetch(`${apiUrl}${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const out = await res.json().catch(() => ({}));
      setActionMsg(`${label}: ${JSON.stringify(out)}`);
      void load();
    } catch (e: unknown) {
      setActionMsg(`${label}: ${e instanceof Error ? e.message : "failed"}`);
    } finally {
      setActionPending(null);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-forest-deep text-text-primary" style={{ paddingBottom: "calc(96px + env(safe-area-inset-bottom, 16px))" }}>
      <div className="max-w-7xl mx-auto px-6 lg:px-10 py-8">
        <header className="mb-8 flex items-center justify-between gap-4">
          <div>
            <p className="font-body text-[12px] tracking-[0.22em] uppercase text-amber-sun mb-1">
              The Collective
            </p>
            <h1 className="font-heading text-2xl lg:text-3xl text-text-primary" style={{ fontWeight: 300 }}>
              Hive Mind
            </h1>
            <p className="font-body text-text-secondary text-[13px] mt-1">
              Each soul is a node. Lines connect souls who share chart frequencies.
            </p>
          </div>
          <button
            onClick={() => void load()}
            className="font-body text-[12px] tracking-[0.22em] uppercase px-4 py-2 rounded-lg border border-forest-border hover:border-amber-sun/50 transition-colors"
          >
            {loading ? "Reading…" : "Refresh"}
          </button>
        </header>

        {error && (
          <div className="mb-6 px-4 py-3 rounded-lg border border-red-700/40 text-[13px]">
            {error}
          </div>
        )}

        {graph && <CountsRow counts={graph.counts} />}

        {graph && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-8">
            <div className="lg:col-span-2 rounded-2xl border border-forest-border bg-forest-card/30 overflow-hidden">
              <HiveGraph nodes={graph.nodes} edges={graph.edges} />
            </div>
            <div className="space-y-5">
              <Panel title="Cohorts emerging">
                {graph.top_cohorts.length === 0 ? (
                  <p className="font-body text-text-secondary text-[12px]">
                    No cohorts yet. The hive needs at least 10 people sharing one
                    chart trait before a cohort can form. Hit Discover Cohorts
                    once the user count grows.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {graph.top_cohorts.map((c) => (
                      <li key={c.name} className="text-[12px] font-body">
                        <div className="flex items-center justify-between">
                          <span className="text-text-primary">{c.name.replaceAll("=", ": ").replaceAll("_", " ")}</span>
                          <span className="text-text-secondary tabular-nums">
                            {c.member_count} · {Math.round(c.confidence * 100)}%
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>

              <Panel title="Run a phase">
                <div className="grid grid-cols-1 gap-2">
                  <ActionButton
                    label="Discover cohorts"
                    pending={actionPending === "Discover cohorts"}
                    onClick={() => void fireAction("/admin/hive/discover", "Discover cohorts")}
                  />
                  <ActionButton
                    label="Rebuild correlations"
                    pending={actionPending === "Rebuild correlations"}
                    onClick={() => void fireAction("/admin/hive/correlations", "Rebuild correlations")}
                  />
                  <ActionButton
                    label="Refresh resonance"
                    pending={actionPending === "Refresh resonance"}
                    onClick={() => void fireAction("/admin/hive/resonance", "Refresh resonance")}
                  />
                  <ActionButton
                    label="Snapshot daily metrics"
                    pending={actionPending === "Snapshot daily metrics"}
                    onClick={() => void fireAction("/admin/hive/metrics", "Snapshot daily metrics")}
                  />
                  <ActionButton
                    label="Prune non-consenting"
                    pending={actionPending === "Prune non-consenting"}
                    onClick={() => void fireAction("/admin/hive/maintenance", "Prune non-consenting")}
                  />
                </div>
                {actionMsg && (
                  <p className="font-mono text-[11px] text-text-secondary mt-3 break-all leading-relaxed">
                    {actionMsg}
                  </p>
                )}
              </Panel>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CountsRow({ counts }: { counts: Counts }) {
  const items: Array<[string, number]> = [
    ["Souls in the field", counts.consenting_users],
    ["Chart signals", counts.chart_signals],
    ["Components", counts.chart_components],
    ["Cohorts", counts.pattern_cohorts],
    ["High-confidence", counts.high_confidence_cohorts],
    ["Themes", counts.pattern_themes],
    ["Correlations", counts.pattern_correlations],
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
      {items.map(([label, val]) => (
        <div key={label} className="rounded-xl border border-forest-border bg-forest-card/30 px-4 py-3">
          <p className="font-body text-[10px] tracking-[0.22em] uppercase text-text-secondary">{label}</p>
          <p className="font-heading text-text-primary mt-1 tabular-nums" style={{ fontSize: 26, fontWeight: 300 }}>
            {val}
          </p>
        </div>
      ))}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-forest-border bg-forest-card/30 px-5 py-5">
      <p className="font-body text-[11px] tracking-[0.22em] uppercase text-text-secondary mb-4">{title}</p>
      {children}
    </div>
  );
}

function ActionButton({ label, onClick, pending }: { label: string; onClick: () => void; pending: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={pending}
      className="font-body text-[12px] tracking-[0.22em] uppercase px-4 py-2.5 rounded-lg border border-forest-border hover:border-amber-sun/50 transition-colors text-left disabled:opacity-50"
    >
      {pending ? "Running…" : label}
    </button>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// HiveGraph: simple force-directed layout on SVG. Central core node represents
// Solray. All user nodes get repulsion + an attraction toward the core, plus
// link forces from the edges (shared-component pairs). Tiny RAF loop runs
// the physics; graph stabilises within a couple of seconds.
// ───────────────────────────────────────────────────────────────────────────

function HiveGraph({ nodes, edges }: { nodes: GraphNode[]; edges: GraphEdge[] }) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [tick, setTick] = useState(0);

  // Physics state, preserved across renders so the simulation continues.
  const physRef = useRef<{
    nodes: PhysicsNode[];
    width: number;
    height: number;
    cx: number;
    cy: number;
    edgeMap: Map<string, GraphEdge>;
  }>({
    nodes: [],
    width: 0,
    height: 0,
    cx: 0,
    cy: 0,
    edgeMap: new Map(),
  });

  // Initialize / re-initialize when the input data changes.
  const initSig = useMemo(
    () => `${nodes.map((n) => n.id).join("|")}__${edges.length}`,
    [nodes, edges]
  );

  useEffect(() => {
    const W = 760;
    const H = 540;
    const cx = W / 2;
    const cy = H / 2;
    physRef.current.width = W;
    physRef.current.height = H;
    physRef.current.cx = cx;
    physRef.current.cy = cy;
    // Place nodes in a spiral around the core for a pleasant initial state
    physRef.current.nodes = nodes.map((n, i) => {
      const ang = (i / Math.max(1, nodes.length)) * Math.PI * 2 + Math.random() * 0.3;
      const r = 140 + (i % 5) * 22;
      return {
        id: n.id,
        x: cx + Math.cos(ang) * r,
        y: cy + Math.sin(ang) * r,
        vx: 0,
        vy: 0,
        data: n,
      };
    });
    physRef.current.edgeMap = new Map(edges.map((e) => [`${e.a}|${e.b}`, e]));
  }, [initSig, nodes, edges]);

  // RAF loop running the physics
  useEffect(() => {
    let running = true;
    let frame = 0;
    const REPULSION = 1800;
    const LINK_K = 0.018;
    const LINK_REST = 110;
    const CORE_K = 0.012;
    const CORE_REST = 180;
    const DAMPING = 0.86;

    const step = () => {
      if (!running) return;
      const phys = physRef.current;
      const ns = phys.nodes;
      const cx = phys.cx;
      const cy = phys.cy;

      // Repulsion (all pairs)
      for (let i = 0; i < ns.length; i++) {
        for (let j = i + 1; j < ns.length; j++) {
          const a = ns[i];
          const b = ns[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy + 0.01;
          const f = REPULSION / d2;
          const d = Math.sqrt(d2);
          const fx = (dx / d) * f;
          const fy = (dy / d) * f;
          a.vx += fx;
          a.vy += fy;
          b.vx -= fx;
          b.vy -= fy;
        }
      }

      // Spring to core
      for (const n of ns) {
        const dx = cx - n.x;
        const dy = cy - n.y;
        const d = Math.sqrt(dx * dx + dy * dy) + 0.01;
        const stretch = d - CORE_REST;
        const f = CORE_K * stretch;
        n.vx += (dx / d) * f;
        n.vy += (dy / d) * f;
      }

      // Spring along edges
      const idIdx: Record<string, PhysicsNode> = {};
      for (const n of ns) idIdx[n.id] = n;
      const edgeList = Array.from(phys.edgeMap.values());
      for (const e of edgeList) {
        const a = idIdx[e.a];
        const b = idIdx[e.b];
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) + 0.01;
        const stretch = d - LINK_REST;
        const f = LINK_K * stretch * Math.min(3, e.weight);
        const fx = (dx / d) * f;
        const fy = (dy / d) * f;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
      }

      // Integrate + damping + bounds
      for (const n of ns) {
        n.vx *= DAMPING;
        n.vy *= DAMPING;
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < 30) n.x = 30;
        if (n.x > phys.width - 30) n.x = phys.width - 30;
        if (n.y < 30) n.y = 30;
        if (n.y > phys.height - 30) n.y = phys.height - 30;
      }

      frame += 1;
      // Re-render every other frame; physics still runs at ~60fps.
      if (frame % 2 === 0) setTick((t) => (t + 1) % 1_000_000);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    return () => {
      running = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initSig]);

  // Render
  const phys = physRef.current;
  const W = phys.width || 760;
  const H = phys.height || 540;
  const cx = phys.cx || W / 2;
  const cy = phys.cy || H / 2;
  const ns = phys.nodes;
  const idIdx: Record<string, PhysicsNode> = {};
  for (const n of ns) idIdx[n.id] = n;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-[540px]"
      role="img"
      aria-label="Hive Mind: each node is a soul; lines connect souls who share chart components."
      data-tick={tick}
    >
      <defs>
        <radialGradient id="core-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={CORE_COLOR} stopOpacity={0.85} />
          <stop offset="40%" stopColor={CORE_COLOR} stopOpacity={0.35} />
          <stop offset="100%" stopColor={CORE_COLOR} stopOpacity={0} />
        </radialGradient>
        <filter id="node-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>

      {/* Edges */}
      <g stroke={EDGE_COLOR}>
        {edges.map((e) => {
          const a = idIdx[e.a];
          const b = idIdx[e.b];
          if (!a || !b) return null;
          return (
            <line
              key={`${e.a}|${e.b}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              strokeWidth={Math.min(2.4, 0.4 + e.weight * 0.5)}
              opacity={Math.min(0.55, 0.18 + e.weight * 0.08)}
            />
          );
        })}
        {/* Soft lines from each node to the core, like spokes */}
        {ns.map((n) => (
          <line
            key={`core-${n.id}`}
            x1={cx}
            y1={cy}
            x2={n.x}
            y2={n.y}
            strokeOpacity={0.05}
            strokeWidth={1}
          />
        ))}
      </g>

      {/* Core */}
      <circle cx={cx} cy={cy} r={70} fill="url(#core-glow)" />
      <circle cx={cx} cy={cy} r={14} fill={CORE_COLOR} />
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize={11} fill="rgba(10, 31, 18, 0.75)" fontFamily="Inter, system-ui, sans-serif" fontWeight={600} letterSpacing="0.18em">
        SOL
      </text>

      {/* Nodes */}
      <g>
        {ns.map((n) => {
          const fill = (n.data.sun_sign && ELEMENT_COLOR[n.data.sun_sign]) || "#9babb9";
          return (
            <g key={n.id} transform={`translate(${n.x}, ${n.y})`}>
              <circle r={6} fill={fill} opacity={0.9} />
              <circle r={11} fill={fill} opacity={0.18} />
              <text
                y={20}
                textAnchor="middle"
                fontSize={10}
                fill="rgba(245, 239, 222, 0.8)"
                fontFamily="Inter, system-ui, sans-serif"
              >
                {n.data.name}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
