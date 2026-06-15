"use client";

// Analytics tab: live engagement + adoption numbers from the production DB
// (home-screen installs, last-seen activity, accounts, signups), with the
// analytics-provider connect cards beneath. Same /admin/metrics source as the
// Overview tab; this view leads with the reach/retention story.

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import IntegrationsSection from "./Integrations";

interface Metrics {
  total_users: number | null;
  trial_users: number | null;
  paying_subscribers: number | null;
  signups_last_7d: number | null;
  signups_last_30d: number | null;
  active_users_1d: number | null;
  active_users_7d: number | null;
  active_users_30d: number | null;
  home_screen_total: number | null;
  home_screen_pct: number | null;
  home_screen_new_7d: number | null;
  generated_at: string;
}

interface AdoptionUser {
  name: string | null;
  email: string | null;
  last_seen: string | null;
  home_screen: boolean;
  home_screen_at: string | null;
}

export default function AnalyticsSection({ token }: { token: string | null }) {
  const [m, setM] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [roster, setRoster] = useState<AdoptionUser[] | null>(null);
  const [onlyMissing, setOnlyMissing] = useState(true);

  useEffect(() => {
    if (!token) return;
    apiFetch("/admin/metrics", {}, token)
      .then((d) => setM(d as Metrics))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not load analytics"));
    apiFetch("/admin/users/adoption", {}, token)
      .then((d) => setRoster((d as { users: AdoptionUser[] }).users))
      .catch(() => { /* roster is non-fatal; cards still render */ });
  }, [token]);

  const shown = (roster || []).filter((u) => (onlyMissing ? !u.home_screen : true));

  return (
    <div className="space-y-8 page-enter">
      <div>
        <p className="font-body text-text-secondary text-[13px] leading-relaxed mb-4">
          Live engagement from the Solray production database. A quiet dash means no data yet, never a fictional zero.
        </p>
        {error && (
          <div className="rounded-2xl border px-5 py-4 font-body text-[13px]" style={{ borderColor: "var(--ember)", color: "var(--ember)" }}>
            {error}
          </div>
        )}
        {!m && !error && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-2xl bg-forest-card/30 border border-forest-border/30 px-5 py-5 h-32 skeleton-shimmer" />
            ))}
          </div>
        )}
        {m && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <Card label="On home screen" value={fmt(m.home_screen_total)} sub={homeSub(m)} />
            <Card label="Active today" value={fmt(m.active_users_1d)} sub="Opened the app in the last 24 hours" />
            <Card label="Active in last 7 days" value={fmt(m.active_users_7d)} sub="Opened the app in the last week" />
            <Card label="Active in last 30 days" value={fmt(m.active_users_30d)} />
            <Card label="Total accounts" value={fmt(m.total_users)} />
            <Card label="Signups last 7 days" value={fmt(m.signups_last_7d)} sub={m.signups_last_30d != null ? `${m.signups_last_30d} in the last 30 days` : undefined} />
          </div>
        )}
        {m && (
          <p className="font-body text-text-secondary/60 text-[11px] tracking-[0.18em] uppercase mt-4">
            Generated {new Date(m.generated_at).toLocaleString()}
          </p>
        )}
      </div>

      {roster && (
        <div>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h3 className="font-heading text-text-primary" style={{ fontSize: 18, fontWeight: 300 }}>
              Home screen by person
            </h3>
            <button
              onClick={() => setOnlyMissing((v) => !v)}
              className="font-body text-[11px] tracking-[0.18em] uppercase px-3 py-1.5 rounded-md transition-colors"
              style={{ border: "1px solid var(--forest-border)", color: "var(--text-secondary)" }}
            >
              {onlyMissing ? "Showing: not installed" : "Showing: everyone"}
            </button>
          </div>
          <p className="font-body text-text-secondary/70 text-[12px] mb-3 leading-snug">
            Who to email an &ldquo;add Solray to your home screen&rdquo; nudge. Not-installed first, most recently active at the top.
          </p>
          <div className="rounded-2xl border border-forest-border/50 overflow-hidden">
            {shown.map((u, i) => (
              <div
                key={(u.email || "") + i}
                className="flex items-center justify-between gap-3 px-4 py-3"
                style={{ borderTop: i === 0 ? "none" : "1px solid rgb(var(--rgb-border))" }}
              >
                <div className="min-w-0">
                  <p className="font-body text-text-primary text-[14px] truncate">{u.name || u.email || "Unknown"}</p>
                  <p className="font-body text-text-secondary/60 text-[12px] truncate">
                    {u.email}{u.last_seen ? ` · seen ${relSeen(u.last_seen)}` : " · never opened"}
                  </p>
                </div>
                {u.home_screen ? (
                  <span className="font-body text-[11px] tracking-[0.16em] uppercase shrink-0" style={{ color: "var(--amber)" }}>
                    On home screen
                  </span>
                ) : (
                  <span className="font-body text-[11px] tracking-[0.16em] uppercase shrink-0" style={{ color: "var(--text-secondary)", opacity: 0.6 }}>
                    Not yet
                  </span>
                )}
              </div>
            ))}
            {shown.length === 0 && (
              <p className="font-body text-text-secondary/70 text-[13px] px-4 py-5 text-center">
                {onlyMissing ? "Everyone has it on their home screen." : "No accounts yet."}
              </p>
            )}
          </div>
        </div>
      )}

      <IntegrationsSection
        token={token}
        category="analytics"
        title="Analytics providers"
        subtitle="Connect Vercel, PostHog and others for visit and funnel data."
      />
    </div>
  );
}

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl bg-forest-card/40 border border-forest-border/50 px-5 py-5">
      <p className="font-body text-text-secondary text-[11px] tracking-[0.22em] uppercase mb-3">{label}</p>
      <p className="font-heading text-text-primary" style={{ fontSize: 30, fontWeight: 300 }}>{value}</p>
      {sub && <p className="font-body text-text-secondary/70 text-[12px] mt-2 leading-snug">{sub}</p>}
    </div>
  );
}

function homeSub(m: Metrics): string {
  const parts: string[] = [];
  if (m.home_screen_pct !== null && m.home_screen_pct !== undefined) parts.push(`${m.home_screen_pct}% of accounts`);
  if (m.home_screen_new_7d) parts.push(`${m.home_screen_new_7d} added this week`);
  return parts.join(", ");
}

function fmt(n: number | null): string {
  if (n === null || n === undefined) return "-";
  return n.toLocaleString();
}

function relSeen(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const days = Math.floor((Date.now() - t) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1mo ago" : `${months}mo ago`;
}
