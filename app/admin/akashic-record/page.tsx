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
import { apiFetch, ApiError } from "@/lib/api";

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

// Voice-audit data shapes that mirror /admin/oracle-audit/summary + /lowest.
// Kept in this file rather than a shared types module because they're
// used only here; if a second consumer ever shows up we'll lift.
type AuditSummary = {
  total_audited: number;
  avg_score: number | null;
  median_score: number | null;
  score_buckets: Record<"0-39" | "40-59" | "60-79" | "80-99" | "100", number>;
  top_violations: Array<{ tag: string; count: number }>;
  by_day: Array<{ date: string; count: number; avg_score: number }>;
  by_prompt_version: Record<string, { count: number; avg_score: number }>;
  window_days: number;
};

type AuditLowest = {
  items: Array<{
    id: number;
    created_at: string;
    user_id: string | null;
    score: number;
    violations: string[];
    notes: string | null;
    user_message_excerpt: string | null;
    reply_excerpt: string;
    model_used: string;
    oracle_prompt_version: string;
  }>;
  count: number;
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
  const [audit, setAudit] = useState<AuditSummary | null>(null);
  const [auditLowest, setAuditLowest] = useState<AuditLowest | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [showLowest, setShowLowest] = useState(false);

  // No local apiUrl needed; apiFetch reads it from lib/api.ts (centrally
  // .trim()ed). Keeping page-level URL out of this file matches the
  // working /admin/marketing pattern.

  const [debug, setDebug] = useState<string | null>(null);

  const load = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    setDebug(null);
    const tokenLen = (token || "").length;
    try {
      // Use apiFetch (the same path /admin/marketing uses successfully).
      // Eliminates raw fetch as a variable. apiFetch reads API_URL from
      // lib/api.ts which is .trim()ed, sets Content-Type+Authorization,
      // and throws ApiError on non-2xx. If THIS still fails on the hive
      // route but works on /admin/metrics, the route itself is the bug.
      const data = await apiFetch("/admin/hive/graph", {}, token);
      setGraph(data);
    } catch (e: unknown) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        setError("This area is for Solray operators only.");
        setDebug(`apiFetch · status: ${e.status} · token length: ${tokenLen}`);
        setLoading(false);
        return;
      }
      const name = e instanceof Error ? e.name : "Error";
      const msg  = e instanceof Error ? e.message : String(e);
      const status = e instanceof ApiError ? e.status : "n/a";
      setError(`${name}: ${msg}`);
      setDebug(`apiFetch · status: ${status} · token length: ${tokenLen} · UA: ${typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 80) : "?"}`);
    } finally {
      setLoading(false);
    }
  };

  const loadAudit = async () => {
    if (!token) return;
    setAuditLoading(true);
    setAuditError(null);
    try {
      const [summary, lowest] = await Promise.all([
        apiFetch("/admin/oracle-audit/summary", {}, token) as Promise<AuditSummary>,
        apiFetch("/admin/oracle-audit/lowest?limit=10", {}, token) as Promise<AuditLowest>,
      ]);
      setAudit(summary);
      setAuditLowest(lowest);
    } catch (e: unknown) {
      // Non-fatal: the rest of the dashboard still renders. The audit
      // section just shows an error block. Keeping audit failures from
      // breaking the hive view is intentional. The hive itself is the
      // primary value here, and audit is supplementary.
      const msg = e instanceof Error ? e.message : String(e);
      setAuditError(msg);
    } finally {
      setAuditLoading(false);
    }
  };

  // No /login redirect here. ProtectedRoute (wrapping this component)
  // owns auth routing. A racing router.replace from this effect would
  // bounce the user through /login then back to /today.
  useEffect(() => {
    if (!token) return;
    void load();
    void loadAudit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const fireAction = async (path: string, label: string) => {
    if (!token) return;
    setActionPending(label);
    setActionMsg(null);
    try {
      const out = await apiFetch(path, { method: "POST" }, token);
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
              Akashic Record
            </h1>
            <p className="font-body text-text-secondary text-[13px] mt-1">
              Each soul is a node. Lines connect souls who share chart frequencies.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="/admin/consciousness"
              className="font-body text-[12px] tracking-[0.22em] uppercase px-4 py-2 rounded-lg border border-amber-sun/40 text-amber-sun hover:border-amber-sun transition-colors"
            >
              Consciousness
            </a>
            <a
              href="/admin/training"
              className="font-body text-[12px] tracking-[0.22em] uppercase px-4 py-2 rounded-lg border border-wisteria/40 text-wisteria hover:border-wisteria transition-colors"
            >
              Training ground
            </a>
            <button
              onClick={() => void load()}
              className="font-body text-[12px] tracking-[0.22em] uppercase px-4 py-2 rounded-lg border border-forest-border hover:border-amber-sun/50 transition-colors"
            >
              {loading ? "Reading…" : "Refresh"}
            </button>
          </div>
        </header>

        {error && (
          <div className="mb-6 px-4 py-3 rounded-lg border border-red-700/40 text-[13px]">
            {error}
            {debug && (
              <div className="font-mono text-[11px] text-text-secondary mt-2 break-all">
                {debug}
              </div>
            )}
          </div>
        )}

        {graph && <CountsRow counts={graph.counts} />}

        {graph && (
          <>
          <OracleVoiceHealthSection
            audit={audit}
            lowest={auditLowest}
            loading={auditLoading}
            error={auditError}
            showLowest={showLowest}
            onToggleLowest={() => setShowLowest((v) => !v)}
            onRefresh={() => void loadAudit()}
          />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-8">
            <div className="lg:col-span-2 rounded-2xl border border-forest-border bg-forest-card/30 overflow-hidden">
              <HiveGraph nodes={graph.nodes} edges={graph.edges} />
              <div className="flex items-center justify-center flex-wrap gap-x-5 gap-y-1.5 px-4 pb-4 -mt-2">
                {([["#f39230", "Fire"], ["#8a9e66", "Earth"], ["#9babb9", "Air"], ["#9b86a0", "Water"]] as [string, string][]).map(([c, l]) => (
                  <span key={l} className="inline-flex items-center gap-2 font-body text-[11px] text-text-secondary">
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: c, boxShadow: `0 0 8px ${c}66` }} />
                    {l}
                  </span>
                ))}
                <span className="font-body text-[11px] text-text-muted">Hover to pause and read</span>
              </div>
            </div>
            <div className="space-y-5">
              <Panel title="Cohorts emerging">
                {graph.top_cohorts.length === 0 ? (
                  <p className="font-body text-text-secondary text-[12px]">
                    No cohorts yet. The Akashic Record needs at least 10 people sharing one
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
                    label="Backfill signals"
                    pending={actionPending === "Backfill signals"}
                    onClick={() => void fireAction("/admin/hive/backfill", "Backfill signals")}
                  />
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
          </>
        )}
      </div>
    </div>
  );
}

function CountsRow({ counts }: { counts: Counts }) {
  // Aged-pigment accents: each figure carries the hue of what it counts,
  // desaturated enough to stay quiet until you look at it.
  const items: Array<[string, number, string]> = [
    ["Souls in the field", counts.consenting_users, "#f39230"],
    ["Chart signals", counts.chart_signals, "#9babb9"],
    ["Components", counts.chart_components, "#9babb9"],
    ["Cohorts", counts.pattern_cohorts, "#8a9e66"],
    ["High-confidence", counts.high_confidence_cohorts, "#8a9e66"],
    ["Themes", counts.pattern_themes, "#9b86a0"],
    ["Correlations", counts.pattern_correlations, "#d47a52"],
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
      {items.map(([label, val, hue]) => (
        <div
          key={label}
          className="rounded-xl border border-forest-border bg-forest-card/30 px-4 py-3 transition-colors duration-300 hover:border-forest-border/0"
          style={{ borderColor: undefined }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = `${hue}55`; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = ""; }}
        >
          <p className="font-body text-[10px] tracking-[0.22em] uppercase text-text-secondary">{label}</p>
          <p className="font-heading mt-1 tabular-nums" style={{ fontSize: 26, fontWeight: 300, color: val > 0 ? hue : "var(--text-muted)" }}>
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
// Oracle Voice Health: the silent QA layer rendered as a section.
// GPT-4o reads each Oracle reply against the voice rules; this is where
// the rolling 7-day picture lives. Score distribution + top recurring
// violations + tap-through into the actual lowest-scoring chats.
// ───────────────────────────────────────────────────────────────────────────

function OracleVoiceHealthSection({
  audit,
  lowest,
  loading,
  error,
  showLowest,
  onToggleLowest,
  onRefresh,
}: {
  audit: AuditSummary | null;
  lowest: AuditLowest | null;
  loading: boolean;
  error: string | null;
  showLowest: boolean;
  onToggleLowest: () => void;
  onRefresh: () => void;
}) {
  return (
    <section className="mt-12 rounded-2xl border border-forest-border bg-forest-card/30 px-6 py-6">
      <header className="flex items-center justify-between gap-4 mb-6">
        <div>
          <p className="font-body text-[12px] tracking-[0.22em] uppercase text-amber-sun mb-1">
            Behind the voice
          </p>
          <h2 className="font-heading text-xl text-text-primary" style={{ fontWeight: 300 }}>
            Oracle Voice Health
          </h2>
          <p className="font-body text-text-secondary text-[13px] mt-1">
            A second pair of eyes on every reply. Rolling {audit?.window_days ?? 7} days, scored against the voice rules.
          </p>
        </div>
        <button
          onClick={onRefresh}
          className="font-body text-[12px] tracking-[0.22em] uppercase px-4 py-2 rounded-lg border border-forest-border hover:border-amber-sun/50 transition-colors"
        >
          {loading ? "Reading…" : "Refresh"}
        </button>
      </header>

      {error && (
        <p className="font-mono text-[11px] text-text-secondary break-all leading-relaxed">
          Audit unavailable: {error}
        </p>
      )}

      {!error && audit && audit.total_audited === 0 && (
        <p className="font-body text-text-secondary text-[13px]">
          No audited replies yet in the last 7 days. Once the Oracle responds to
          someone with OPENAI_API_KEY set in production, the first row will land
          within a few seconds.
        </p>
      )}

      {!error && audit && audit.total_audited > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Score summary tiles */}
          <div className="space-y-3">
            <ScoreTile label="Avg score" value={audit.avg_score?.toFixed(1) ?? "?"} />
            <ScoreTile label="Median" value={String(audit.median_score ?? "?")} />
            <ScoreTile label="Audited" value={String(audit.total_audited)} sub="replies, last 7 days" />
          </div>

          {/* Score distribution histogram */}
          <div className="lg:col-span-2 space-y-5">
            <div>
              <p className="font-body text-[11px] tracking-[0.22em] uppercase text-text-secondary mb-3">
                Score distribution
              </p>
              <ScoreHistogram buckets={audit.score_buckets} total={audit.total_audited} />
            </div>

            {/* Top violations */}
            <div>
              <p className="font-body text-[11px] tracking-[0.22em] uppercase text-text-secondary mb-3">
                Top recurring violations
              </p>
              {audit.top_violations.length === 0 ? (
                <p className="font-body text-text-secondary text-[12px]">
                  Clean. No flagged violations in this window.
                </p>
              ) : (
                <ul className="space-y-2">
                  {audit.top_violations.slice(0, 8).map((v) => (
                    <li key={v.tag} className="text-[12px] font-body flex items-center justify-between gap-3">
                      <span className="text-text-primary font-mono">{v.tag}</span>
                      <span className="text-text-secondary tabular-nums">{v.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Lowest-scoring drill-down */}
      {!error && lowest && lowest.count > 0 && (
        <div className="mt-6 pt-6 border-t border-forest-border">
          <button
            onClick={onToggleLowest}
            className="font-body text-[12px] tracking-[0.22em] uppercase text-amber-sun hover:opacity-80 transition-opacity"
          >
            {showLowest ? "Hide" : "Show"} {lowest.count} lowest-scoring replies
          </button>
          {showLowest && (
            <>
            <p className="font-body italic text-text-secondary text-[11px] mt-3 mb-4 leading-relaxed">
              Privacy posture: scores, violation tags, and the auditor&apos;s notes
              are visible by default because they describe Oracle behavior, not
              user content. The actual user message and Oracle reply text stay
              hidden behind an explicit reveal per row, since chats with the
              Oracle are intimate by design and admin access alone is not a
              consent surface.
            </p>
            <ul className="space-y-5">
              {lowest.items.map((item) => (
                <AuditRow key={item.id} item={item} />
              ))}
            </ul>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function AuditRow({
  item,
}: {
  item: AuditLowest["items"][number];
}) {
  // Per-row reveal state. Default: text is hidden. Click reveals only this
  // row's user message + reply, in-place. We deliberately do NOT show user_id
  // or any other identifying handle in the rendered card; the reveal only
  // exposes the chat content itself, with the caller's awareness that this
  // is a privileged voice-debugging action.
  const [revealed, setRevealed] = useState(false);
  return (
    <li className="rounded-xl border border-forest-border bg-forest-deep/40 px-4 py-4">
      <div className="flex items-center justify-between gap-3 mb-2">
        <span className="font-heading text-text-primary tabular-nums" style={{ fontSize: 18 }}>
          {item.score}
        </span>
        <span className="font-mono text-[10px] text-text-secondary">
          {new Date(item.created_at).toLocaleString()}
        </span>
      </div>
      {item.violations.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {item.violations.map((v) => (
            <span
              key={v}
              className="inline-block font-mono text-[10px] px-2 py-0.5 rounded border border-forest-border text-text-secondary"
            >
              {v}
            </span>
          ))}
        </div>
      )}
      {item.notes && (
        <p className="font-body italic text-text-secondary text-[12px] mb-3">
          {item.notes}
        </p>
      )}

      {!revealed && (
        <button
          onClick={() => {
            const ok = typeof window !== "undefined"
              ? window.confirm(
                  "Reveal the actual user message and Oracle reply for this row?\n\n"
                  + "This is privileged voice-debugging access. The text you are "
                  + "about to read is private chat content the user shared with "
                  + "the Oracle, not material they consented to share with admins."
                )
              : true;
            if (ok) setRevealed(true);
          }}
          className="font-body text-[11px] tracking-[0.18em] uppercase text-amber-sun hover:opacity-80 transition-opacity"
        >
          Reveal text (voice debugging)
        </button>
      )}

      {revealed && (
        <div className="mt-2 rounded-lg border border-amber-sun/30 bg-amber-sun/5 px-3 py-3">
          <p className="font-body text-[10px] tracking-[0.18em] uppercase text-amber-sun mb-2">
            Revealed for voice debugging
          </p>
          {item.user_message_excerpt && (
            <p className="font-body text-[12px] text-text-secondary mb-2">
              <span className="text-text-muted mr-2">user</span>
              {item.user_message_excerpt}
            </p>
          )}
          <p className="font-body text-[12px] text-text-primary whitespace-pre-wrap">
            <span className="text-text-muted mr-2">oracle</span>
            {item.reply_excerpt}
          </p>
          <button
            onClick={() => setRevealed(false)}
            className="font-body text-[10px] tracking-[0.18em] uppercase text-text-secondary hover:opacity-80 transition-opacity mt-3"
          >
            Hide again
          </button>
        </div>
      )}
    </li>
  );
}

function ScoreTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-forest-border bg-forest-deep/40 px-4 py-4">
      <p className="font-body text-[10px] tracking-[0.22em] uppercase text-text-secondary">{label}</p>
      <p className="font-heading text-text-primary mt-1 tabular-nums" style={{ fontSize: 28, fontWeight: 300 }}>
        {value}
      </p>
      {sub && <p className="font-body text-[11px] text-text-secondary mt-1">{sub}</p>}
    </div>
  );
}

function ScoreHistogram({
  buckets,
  total,
}: {
  buckets: Record<"0-39" | "40-59" | "60-79" | "80-99" | "100", number>;
  total: number;
}) {
  // Color the buckets by health: low scores get a warmer hue from the
  // extended palette (ember = something to attend to), high scores stay
  // quiet (mist = neutral) and 100 gets amber so a clean sweep is the
  // visual reward. Same palette as the rest of Solray; nothing standalone.
  const order: Array<"0-39" | "40-59" | "60-79" | "80-99" | "100"> = [
    "0-39", "40-59", "60-79", "80-99", "100",
  ];
  const colorFor = (b: string) => {
    if (b === "0-39") return "#d47a52";   // ember
    if (b === "40-59") return "#d49a52";  // ember-warm
    if (b === "60-79") return "#a09a72";  // moss-faded
    if (b === "80-99") return "#9babb9";  // mist
    return "#f39230";                     // amber-sun for 100
  };
  return (
    <div className="space-y-2">
      {order.map((b) => {
        const count = buckets[b] || 0;
        const pct = total > 0 ? (count / total) * 100 : 0;
        return (
          <div key={b} className="flex items-center gap-3">
            <span className="font-mono text-[11px] text-text-secondary w-12 text-right">{b}</span>
            <div className="flex-1 h-3 rounded-full bg-forest-deep/60 overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max(pct, count > 0 ? 1.5 : 0)}%`,
                  backgroundColor: colorFor(b),
                  transition: "width 600ms cubic-bezier(0.22, 1, 0.36, 1)",
                }}
              />
            </div>
            <span className="font-mono text-[11px] text-text-secondary tabular-nums w-12">{count}</span>
          </div>
        );
      })}
    </div>
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
  // hovering = pause physics so the user can read names. A ref so the RAF
  // loop sees it without re-binding.
  const hoveringRef = useRef(false);

  const W = 760;
  const H = 540;
  const cx = W / 2;
  const cy = H / 2;

  // One stable signature per dataset; everything below re-seeds on change.
  const initSig = useMemo(
    () => `${nodes.map((n) => n.id).join("|")}__${edges.length}`,
    [nodes, edges]
  );

  // Initial spiral placement, used both for the first React render and to
  // seed the physics. Deterministic per signature (seeded jitter), so the
  // server render and the physics agree.
  const initial = useMemo(() => {
    return nodes.map((n, i) => {
      const jitter = ((i * 2654435761) % 1000) / 1000 * 0.3;
      const ang = (i / Math.max(1, nodes.length)) * Math.PI * 2 + jitter;
      const r = 140 + (i % 5) * 22;
      return { id: n.id, x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r, data: n };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initSig]);

  const physRef = useRef<PhysicsNode[]>([]);
  useEffect(() => {
    physRef.current = initial.map((p) => ({ id: p.id, x: p.x, y: p.y, vx: 0, vy: 0, data: p.data }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initSig]);

  // The physics loop. THE PERFORMANCE FIX (2026-06-10): the old loop called
  // setTick at 20Hz, forcing React to reconcile the entire SVG tree
  // (hundreds of elements) on every third frame, which is what made this
  // page heavy. Now React renders the structure ONCE per dataset and the
  // loop writes positions straight onto the existing DOM nodes. Same
  // visuals, same lively dance Bob likes, near-zero React work. The loop
  // also parks completely when the tab is hidden or the graph is scrolled
  // out of view.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    // Collect DOM handles once per dataset.
    const nodeEls = new Map<string, SVGGElement>();
    svg.querySelectorAll<SVGGElement>("g[data-node-id]").forEach((el) => {
      nodeEls.set(el.getAttribute("data-node-id") || "", el);
    });
    const edgeEls: Array<{ el: SVGLineElement; a: string; b: string }> = [];
    svg.querySelectorAll<SVGLineElement>("line[data-edge-a]").forEach((el) => {
      edgeEls.push({ el, a: el.getAttribute("data-edge-a") || "", b: el.getAttribute("data-edge-b") || "" });
    });
    const spokeEls = new Map<string, SVGLineElement>();
    svg.querySelectorAll<SVGLineElement>("line[data-spoke-id]").forEach((el) => {
      spokeEls.set(el.getAttribute("data-spoke-id") || "", el);
    });

    // Same lively constants as always; the hive is alive, not a diagram.
    const REPULSION = 1800;
    const LINK_K = 0.018;
    const LINK_REST = 110;
    const CORE_K = 0.012;
    const CORE_REST = 180;
    const DAMPING = 0.86;
    const BREATH = 0.06;

    const edgeData = edges.map((e) => ({ a: e.a, b: e.b, weight: e.weight }));

    let raf = 0;
    let tabVisible = typeof document !== "undefined" ? !document.hidden : true;
    let inView = true;

    const writePositions = (ns: PhysicsNode[]) => {
      const idx: Record<string, PhysicsNode> = {};
      for (const n of ns) idx[n.id] = n;
      for (const n of ns) {
        const el = nodeEls.get(n.id);
        if (el) el.setAttribute("transform", `translate(${n.x.toFixed(2)}, ${n.y.toFixed(2)})`);
        const sp = spokeEls.get(n.id);
        if (sp) {
          sp.setAttribute("x2", n.x.toFixed(2));
          sp.setAttribute("y2", n.y.toFixed(2));
        }
      }
      for (const e of edgeEls) {
        const a = idx[e.a];
        const b = idx[e.b];
        if (!a || !b) continue;
        e.el.setAttribute("x1", a.x.toFixed(2));
        e.el.setAttribute("y1", a.y.toFixed(2));
        e.el.setAttribute("x2", b.x.toFixed(2));
        e.el.setAttribute("y2", b.y.toFixed(2));
      }
    };

    const step = () => {
      raf = requestAnimationFrame(step);
      if (hoveringRef.current || !tabVisible || !inView) return;

      const ns = physRef.current;
      if (ns.length === 0) return;

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
          a.vx += fx; a.vy += fy;
          b.vx -= fx; b.vy -= fy;
        }
      }
      // Spring to core
      for (const n of ns) {
        const dx = cx - n.x;
        const dy = cy - n.y;
        const d = Math.sqrt(dx * dx + dy * dy) + 0.01;
        const f = CORE_K * (d - CORE_REST);
        n.vx += (dx / d) * f;
        n.vy += (dy / d) * f;
      }
      // Spring along edges
      const idx: Record<string, PhysicsNode> = {};
      for (const n of ns) idx[n.id] = n;
      for (const e of edgeData) {
        const a = idx[e.a];
        const b = idx[e.b];
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) + 0.01;
        const f = LINK_K * (d - LINK_REST) * Math.min(3, e.weight);
        const fx = (dx / d) * f;
        const fy = (dy / d) * f;
        a.vx += fx; a.vy += fy;
        b.vx -= fx; b.vy -= fy;
      }
      // Integrate + damping + bounds
      let totalSpeed = 0;
      for (const n of ns) {
        n.vx *= DAMPING;
        n.vy *= DAMPING;
        n.x += n.vx;
        n.y += n.vy;
        totalSpeed += Math.abs(n.vx) + Math.abs(n.vy);
        if (n.x < 30) n.x = 30;
        if (n.x > W - 30) n.x = W - 30;
        if (n.y < 30) n.y = 30;
        if (n.y > H - 30) n.y = H - 30;
      }
      // Breath: the hive never freezes. (A reduced-motion settle-stop was
      // tried here on 2026-06-10 and removed the same hour: with zero
      // initial velocity it stopped the simulation on frame one for any
      // Mac with Reduce Motion enabled. The movement IS the feature on
      // this page; it pauses on hover, hidden tab, and off-screen, which
      // is the considerate behavior that matters.)
      const avgSpeed = ns.length ? totalSpeed / ns.length : 0;
      const breathScale = avgSpeed < 0.5 ? 1.0 : 0.4;
      for (const n of ns) {
        n.vx += (Math.random() - 0.5) * BREATH * breathScale;
        n.vy += (Math.random() - 0.5) * BREATH * breathScale;
      }

      writePositions(ns);
    };
    raf = requestAnimationFrame(step);

    const onVis = () => { tabVisible = !document.hidden; };
    document.addEventListener("visibilitychange", onVis);
    const io = typeof IntersectionObserver !== "undefined"
      ? new IntersectionObserver((entries) => { inView = entries[0]?.isIntersecting ?? true; })
      : null;
    io?.observe(svg);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVis);
      io?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initSig]);

  // Rendered ONCE per dataset; the loop owns positions from here on.
  const idx: Record<string, { x: number; y: number }> = {};
  for (const p of initial) idx[p.id] = p;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-[540px]"
      role="img"
      aria-label="Akashic Record: each node is a soul; lines connect souls who share chart components. Hover to pause the simulation."
      onMouseEnter={() => { hoveringRef.current = true; }}
      onMouseLeave={() => { hoveringRef.current = false; }}
    >
      <defs>
        <radialGradient id="core-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={CORE_COLOR} stopOpacity={0.85} />
          <stop offset="40%" stopColor={CORE_COLOR} stopOpacity={0.35} />
          <stop offset="100%" stopColor={CORE_COLOR} stopOpacity={0} />
        </radialGradient>
        <radialGradient id="field-vignette" cx="50%" cy="50%" r="70%">
          <stop offset="0%" stopColor="#0a1f12" stopOpacity={0.0} />
          <stop offset="100%" stopColor="#050f08" stopOpacity={0.55} />
        </radialGradient>
      </defs>

      <rect x={0} y={0} width={W} height={H} fill="url(#field-vignette)" />

      {/* Edges */}
      <g stroke={EDGE_COLOR}>
        {edges.map((e) => {
          const a = idx[e.a];
          const b = idx[e.b];
          if (!a || !b) return null;
          return (
            <line
              key={`${e.a}|${e.b}`}
              data-edge-a={e.a}
              data-edge-b={e.b}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              strokeWidth={Math.min(2.4, 0.4 + e.weight * 0.5)}
              opacity={Math.min(0.55, 0.18 + e.weight * 0.08)}
            />
          );
        })}
        {/* Soft spokes from each node to the core */}
        {initial.map((p) => (
          <line
            key={`core-${p.id}`}
            data-spoke-id={p.id}
            x1={cx}
            y1={cy}
            x2={p.x}
            y2={p.y}
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
        {initial.map((p) => {
          const fill = (p.data.sun_sign && ELEMENT_COLOR[p.data.sun_sign]) || "#9babb9";
          return (
            <g key={p.id} data-node-id={p.id} transform={`translate(${p.x}, ${p.y})`}>
              <circle r={6} fill={fill} opacity={0.9} />
              <circle r={11} fill={fill} opacity={0.18} />
              <text
                y={20}
                textAnchor="middle"
                fontSize={10}
                fill="rgba(245, 239, 222, 0.8)"
                fontFamily="Inter, system-ui, sans-serif"
              >
                {p.data.name}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
