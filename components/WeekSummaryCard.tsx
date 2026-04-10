"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

export default function WeekSummaryCard() {
  const [summary, setSummary] = useState<string | null>(null);
  const { token } = useAuth();

  useEffect(() => {
    if (!token) return;
    const key = `solray_week_${new Date().toISOString().split('T')[0]}`;
    try {
      const cached = localStorage.getItem(key);
      if (cached) {
        const d = JSON.parse(cached);
        if (d?.week_summary) { setSummary(d.week_summary); return; }
      }
    } catch (_) {}
    apiFetch("/forecast/week", {}, token)
      .then(d => {
        if (d?.week_summary) {
          setSummary(d.week_summary);
          try { localStorage.setItem(key, JSON.stringify(d)); } catch (_) {}
        }
      })
      .catch(() => {});
  }, [token]);

  if (!summary) return null;

  return (
    <div className="px-4 py-3 rounded-xl border border-forest-border/50 bg-forest-card/30">
      <p className="text-text-secondary text-[10px] font-body tracking-[0.2em] uppercase mb-1.5">Days Ahead</p>
      <p className="text-text-secondary text-sm font-body leading-relaxed">{summary}</p>
    </div>
  );
}
