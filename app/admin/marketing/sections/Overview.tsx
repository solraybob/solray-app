"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

interface Metrics {
  total_users: number | null;
  trial_users: number | null;
  paying_subscribers: number | null;
  mrr_usd: number | null;
  signups_last_7d: number | null;
  signups_last_30d: number | null;
  active_users_7d: number | null;
  price_usd_monthly: number;
  generated_at: string;
}

export default function OverviewSection({ token }: { token: string | null }) {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    apiFetch("/admin/metrics", {}, token)
      .then((d) => setMetrics(d as Metrics))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not load metrics"))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return <Skeleton />;
  if (error)   return <Banner kind="error" text={error} />;
  if (!metrics) return null;

  return (
    <div className="space-y-6 page-enter">
      <p className="font-body text-text-secondary text-[13px] leading-relaxed">
        Live numbers from the Solray production database. Metrics that have no data yet show a quiet dash, never a fictional zero.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <Card label="Paying subscribers"     value={fmt(metrics.paying_subscribers)} />
        <Card label="Monthly recurring"      value={fmtUsd(metrics.mrr_usd)}        sub={`$${metrics.price_usd_monthly.toFixed(2)} per subscriber`} />
        <Card label="Trial users"            value={fmt(metrics.trial_users)} />
        <Card label="Total accounts"         value={fmt(metrics.total_users)} />
        <Card label="Signups last 7 days"    value={fmt(metrics.signups_last_7d)} />
        <Card label="Signups last 30 days"   value={fmt(metrics.signups_last_30d)} />
        <Card label="Active in last 7 days"  value={fmt(metrics.active_users_7d)}   sub="Generated a forecast in the last week" />
      </div>

      <p className="font-body text-text-secondary/60 text-[11px] tracking-[0.18em] uppercase">
        Generated {new Date(metrics.generated_at).toLocaleString()}
      </p>
    </div>
  );
}

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl bg-forest-card/40 border border-forest-border/50 px-5 py-5">
      <p className="font-body text-text-secondary text-[11px] tracking-[0.22em] uppercase mb-3">
        {label}
      </p>
      <p className="font-heading text-text-primary" style={{ fontSize: 30, fontWeight: 300 }}>
        {value}
      </p>
      {sub && (
        <p className="font-body text-text-secondary/70 text-[12px] mt-2 leading-snug">{sub}</p>
      )}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-2xl bg-forest-card/30 border border-forest-border/30 px-5 py-5 h-32 skeleton-shimmer" />
      ))}
    </div>
  );
}

function Banner({ kind, text }: { kind: "error" | "info"; text: string }) {
  const color = kind === "error" ? "var(--ember)" : "var(--text-secondary)";
  return (
    <div className="rounded-2xl border px-5 py-4 font-body text-[13px]" style={{ borderColor: color, color }}>
      {text}
    </div>
  );
}

function fmt(n: number | null): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString();
}

function fmtUsd(n: number | null): string {
  if (n === null || n === undefined) return "—";
  return "$" + n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
