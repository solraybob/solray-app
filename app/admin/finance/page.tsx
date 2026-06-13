"use client";

/**
 * /admin/finance — Finance, its own page (separate from Analytics + Marketing).
 *
 * Revenue and AI cost are live from the DB (GET /admin/hub/finance); infra
 * figures come from Railway env (FINANCE_*). Visual: KPI cards + SVG graphs.
 * The paying-user classification is identical to the Analytics overview, so
 * the headline numbers always match what you see there.
 */

import { useEffect, useState } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";

type Finance = {
  revenue: {
    mrr_usd: number; arr_usd: number; paying: number; price_usd: number;
    collected_30d_usd: number; collected_all_time_usd: number; charges_30d: number;
  };
  cost: {
    ai_30d_usd: number; ai_7d_usd: number; railway_usd_mo: number; vercel_usd_mo: number;
    domain_usd_mo: number; other_usd_mo: number; teya_fee_pct: number; teya_fees_30d_usd: number;
    infra_total_usd_mo: number; total_usd_mo: number;
  };
  net: {
    net_recurring_usd_mo: number; daily_burn_usd: number; cost_per_paying_usd: number | null;
    balance_usd: number | null; runway_days: number | null;
  };
  series: {
    revenue_by_month: { month: string; usd: number }[];
    ai_cost_by_day: { day: string; usd: number }[];
  };
};

const AMBER = "#f39230", MOSS = "#8a9e66", EMBER = "#d47a52", INDIGO = "#6a8692";
const usd = (n: number) => "$" + (n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
const usd0 = (n: number) => "$" + Math.round(n ?? 0).toLocaleString();

function Kpi({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl border border-forest-border bg-forest-card p-5">
      <div className="font-body text-[12px] tracking-[0.18em] uppercase text-text-secondary">{label}</div>
      <div className="font-heading mt-1" style={{ fontWeight: 300, fontSize: "30px", lineHeight: 1.1, color: color || "rgb(var(--rgb-text-primary))" }}>{value}</div>
      {sub && <div className="font-body text-[12px] text-text-secondary mt-1">{sub}</div>}
    </div>
  );
}

// Monthly revenue: vertical bars.
function RevenueBars({ data }: { data: { month: string; usd: number }[] }) {
  const W = 520, H = 180, pad = 28, bw = 46;
  const max = Math.max(1, ...data.map(d => d.usd));
  const gap = (W - pad * 2 - bw * data.length) / Math.max(1, data.length - 1);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 200 }} role="img" aria-label="Revenue collected by month">
      {data.map((d, i) => {
        const x = pad + i * (bw + gap);
        const h = (d.usd / max) * (H - pad * 2);
        const y = H - pad - h;
        return (
          <g key={d.month}>
            <rect x={x} y={y} width={bw} height={Math.max(0, h)} rx={4} fill={AMBER} opacity={0.85} />
            <text x={x + bw / 2} y={H - pad + 14} textAnchor="middle" fontSize={10} fill="rgb(var(--rgb-text-secondary))" fontFamily="Inter, system-ui">{d.month.slice(5)}</text>
            <text x={x + bw / 2} y={y - 5} textAnchor="middle" fontSize={10} fill="rgb(var(--rgb-text-primary))" fontFamily="Inter, system-ui">{d.usd ? usd0(d.usd) : ""}</text>
          </g>
        );
      })}
    </svg>
  );
}

// Daily AI cost: area + line.
function AiCostLine({ data }: { data: { day: string; usd: number }[] }) {
  const W = 520, H = 180, pad = 28;
  const max = Math.max(0.0001, ...data.map(d => d.usd));
  const n = data.length;
  const xAt = (i: number) => pad + (i / Math.max(1, n - 1)) * (W - pad * 2);
  const yAt = (v: number) => H - pad - (v / max) * (H - pad * 2);
  const line = data.map((d, i) => `${i === 0 ? "M" : "L"}${xAt(i).toFixed(1)} ${yAt(d.usd).toFixed(1)}`).join(" ");
  const area = `${line} L${xAt(n - 1).toFixed(1)} ${H - pad} L${xAt(0).toFixed(1)} ${H - pad} Z`;
  const total = data.reduce((s, d) => s + d.usd, 0);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 200 }} role="img" aria-label="AI cost per day, last 30 days">
      <path d={area} fill={EMBER} opacity={0.14} />
      <path d={line} fill="none" stroke={EMBER} strokeWidth={2} />
      <text x={pad} y={16} fontSize={11} fill="rgb(var(--rgb-text-secondary))" fontFamily="Inter, system-ui">30-day AI: {usd(total)}</text>
      <text x={W - pad} y={H - pad + 14} textAnchor="end" fontSize={10} fill="rgb(var(--rgb-text-secondary))" fontFamily="Inter, system-ui">today</text>
      <text x={pad} y={H - pad + 14} fontSize={10} fill="rgb(var(--rgb-text-secondary))" fontFamily="Inter, system-ui">30d ago</text>
    </svg>
  );
}

// Cost composition: horizontal stacked bar.
function CostComposition({ c }: { c: Finance["cost"] }) {
  const parts = [
    { label: "AI", v: c.ai_30d_usd, color: EMBER },
    { label: "Railway", v: c.railway_usd_mo, color: INDIGO },
    { label: "Teya fees", v: c.teya_fees_30d_usd, color: AMBER },
    { label: "Domain", v: c.domain_usd_mo, color: MOSS },
    { label: "Vercel", v: c.vercel_usd_mo, color: "#9babb9" },
    { label: "Other", v: c.other_usd_mo, color: "#9b86a0" },
  ].filter(p => p.v > 0);
  const total = Math.max(0.0001, parts.reduce((s, p) => s + p.v, 0));
  return (
    <div>
      <div className="flex w-full h-4 rounded-full overflow-hidden border border-forest-border">
        {parts.map(p => (
          <div key={p.label} style={{ width: `${(p.v / total) * 100}%`, background: p.color }} title={`${p.label} ${usd(p.v)}`} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-3">
        {parts.map(p => (
          <span key={p.label} className="inline-flex items-center gap-2 font-body text-[12px] text-text-secondary">
            <span style={{ width: 9, height: 9, borderRadius: 2, background: p.color }} />
            {p.label} {usd(p.v)}
          </span>
        ))}
      </div>
    </div>
  );
}

function FinancePage() {
  const { token } = useAuth();
  const [f, setF] = useState<Finance | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!token) return;
    setLoading(true); setErr("");
    try { setF(await apiFetch("/admin/hub/finance", {}, token) as Finance); }
    catch (e: unknown) { setErr(`Could not load (status ${(e as { status?: number })?.status ?? "?"})`); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [token]);

  const net = f?.net.net_recurring_usd_mo ?? 0;

  return (
    <div className="min-h-[100dvh] bg-forest-deep text-text-primary" style={{ paddingBottom: "calc(96px + env(safe-area-inset-bottom, 16px))" }}>
      <div className="max-w-5xl mx-auto px-6 lg:px-10 py-8">
        <header className="mb-7 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="font-body text-[12px] tracking-[0.22em] uppercase text-amber-sun mb-1">Operations</p>
            <h1 className="font-heading text-2xl lg:text-3xl" style={{ fontWeight: 300 }}>Finance</h1>
            <p className="font-body text-text-secondary text-[13px] mt-1">Revenue and AI cost are live. Infra figures come from Railway env (FINANCE_*).</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <a href="/admin/hub" className="font-body text-[12px] tracking-[0.22em] uppercase px-4 py-2 rounded-lg border border-indigo/40 text-indigo hover:border-indigo transition-colors">Analytics</a>
            <a href="/admin/marketing" className="font-body text-[12px] tracking-[0.22em] uppercase px-4 py-2 rounded-lg border border-ember/40 text-ember hover:border-ember transition-colors">Marketing</a>
            <a href="/admin/akashic-record" className="font-body text-[12px] tracking-[0.22em] uppercase px-4 py-2 rounded-lg border border-moss/40 text-moss hover:border-moss transition-colors">Akashic</a>
            <button onClick={() => void load()} className="font-body text-[12px] tracking-[0.22em] uppercase px-4 py-2 rounded-lg border border-forest-border hover:border-amber-sun/50 transition-colors">{loading ? "Reading…" : "Refresh"}</button>
          </div>
        </header>

        {err && <div className="mb-6 px-4 py-3 rounded-lg border border-red-700/40 text-[13px]">{err}</div>}
        {!f && !err && <div className="font-body text-text-secondary text-[13px]">Loading…</div>}

        {f && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              <Kpi label="MRR" value={usd0(f.revenue.mrr_usd)} sub={`${f.revenue.paying} paying, ${usd0(f.revenue.arr_usd)}/yr`} color={AMBER} />
              <Kpi label="Collected 30d" value={usd(f.revenue.collected_30d_usd)} sub={`${f.revenue.charges_30d} charges`} />
              <Kpi label="Cost / month" value={usd(f.cost.total_usd_mo)} sub={`${usd(f.net.daily_burn_usd)}/day burn`} />
              <Kpi label="Net / month" value={(net < 0 ? "-" : "") + usd0(Math.abs(net))} sub={f.net.runway_days != null ? `${Math.round(f.net.runway_days)} days runway` : (f.net.cost_per_paying_usd != null ? `${usd(f.net.cost_per_paying_usd)}/paying` : "set FINANCE_BALANCE_USD")} color={net < 0 ? EMBER : MOSS} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
              <div className="rounded-xl border border-forest-border bg-forest-card p-5">
                <div className="font-body text-[12px] tracking-[0.18em] uppercase text-text-secondary mb-3">Revenue collected by month</div>
                <RevenueBars data={f.series.revenue_by_month} />
              </div>
              <div className="rounded-xl border border-forest-border bg-forest-card p-5">
                <div className="font-body text-[12px] tracking-[0.18em] uppercase text-text-secondary mb-3">AI cost per day</div>
                <AiCostLine data={f.series.ai_cost_by_day} />
              </div>
            </div>

            <div className="rounded-xl border border-forest-border bg-forest-card p-5 mb-4">
              <div className="font-body text-[12px] tracking-[0.18em] uppercase text-text-secondary mb-3">Cost composition (monthly)</div>
              <CostComposition c={f.cost} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-xl border border-forest-border bg-forest-card p-5">
                <div className="font-body text-[12px] tracking-[0.18em] uppercase text-text-secondary mb-3">Revenue</div>
                <table className="w-full text-[13px] font-body">
                  <tbody>
                    <tr className="border-b border-forest-border/40"><td className="py-2 text-text-secondary">MRR (paying x ${f.revenue.price_usd})</td><td className="py-2 text-right">{usd(f.revenue.mrr_usd)}</td></tr>
                    <tr className="border-b border-forest-border/40"><td className="py-2 text-text-secondary">Collected, last 30d</td><td className="py-2 text-right">{usd(f.revenue.collected_30d_usd)}</td></tr>
                    <tr className="border-b border-forest-border/40"><td className="py-2 text-text-secondary">Collected, all time</td><td className="py-2 text-right">{usd(f.revenue.collected_all_time_usd)}</td></tr>
                    <tr><td className="py-2 text-text-secondary">Paying subscribers</td><td className="py-2 text-right">{f.revenue.paying}</td></tr>
                  </tbody>
                </table>
              </div>
              <div className="rounded-xl border border-forest-border bg-forest-card p-5">
                <div className="font-body text-[12px] tracking-[0.18em] uppercase text-text-secondary mb-3">Cost breakdown (monthly)</div>
                <table className="w-full text-[13px] font-body">
                  <tbody>
                    <tr className="border-b border-forest-border/40"><td className="py-2 text-text-secondary">AI (live, 30d)</td><td className="py-2 text-right">{usd(f.cost.ai_30d_usd)}</td></tr>
                    <tr className="border-b border-forest-border/40"><td className="py-2 text-text-secondary">Railway</td><td className="py-2 text-right">{usd(f.cost.railway_usd_mo)}</td></tr>
                    <tr className="border-b border-forest-border/40"><td className="py-2 text-text-secondary">Teya fees ({f.cost.teya_fee_pct}% of collected)</td><td className="py-2 text-right">{usd(f.cost.teya_fees_30d_usd)}</td></tr>
                    <tr className="border-b border-forest-border/40"><td className="py-2 text-text-secondary">Domain</td><td className="py-2 text-right">{usd(f.cost.domain_usd_mo)}</td></tr>
                    <tr className="border-b border-forest-border/40"><td className="py-2 text-text-secondary">Vercel</td><td className="py-2 text-right">{usd(f.cost.vercel_usd_mo)}</td></tr>
                    <tr><td className="py-2 text-text-secondary">Other</td><td className="py-2 text-right">{usd(f.cost.other_usd_mo)}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <ProtectedRoute>
      <FinancePage />
    </ProtectedRoute>
  );
}
