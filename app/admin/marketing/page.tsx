"use client";

/**
 * /admin/marketing — Solray's internal marketing tool.
 *
 * Six sections, all gated to admin emails:
 *   Overview   — live subscriber count, MRR, signups, active users
 *   Brand      — palette, typography, voice rules, tone examples
 *   Calendar   — scheduling layer for posts, ads, launches (real CRUD)
 *   Social     — connection cards for X / Instagram / TikTok / LinkedIn
 *   Ads        — Meta Ads connection card with prerequisite checklist
 *   Analytics  — Vercel Analytics live, PostHog deferred
 *
 * The architecture is "cathedral first": the UI for every section ships
 * tonight even when the underlying integration has no API key yet.
 * Connection state is read from /admin/integrations and rendered as an
 * honest "not connected yet" card with the exact prerequisites the
 * integration needs. As Bob gathers API keys, the same UI becomes live.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/lib/auth-context";
import { apiFetch, ApiError } from "@/lib/api";
import OverviewSection   from "./sections/Overview";
import BrandSection      from "./sections/Brand";
import CalendarSection   from "./sections/Calendar";
import IntegrationsSection from "./sections/Integrations";

type Tab = "overview" | "brand" | "calendar" | "social" | "ads" | "analytics";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "overview",  label: "Overview"  },
  { id: "brand",     label: "Brand"     },
  { id: "calendar",  label: "Calendar"  },
  { id: "social",    label: "Social"    },
  { id: "ads",       label: "Ads"       },
  { id: "analytics", label: "Analytics" },
];

export default function MarketingPage() {
  const router = useRouter();
  const { token, user } = useAuth();
  const [tab, setTab] = useState<Tab>("overview");
  const [authError, setAuthError] = useState<string | null>(null);

  // Probe /admin/metrics on mount to verify admin status. The endpoint
  // 403s for non-admins, so this is the cleanest "am I allowed in" check.
  useEffect(() => {
    if (!token) return;
    apiFetch("/admin/metrics", {}, token).catch((e: unknown) => {
      if (e instanceof ApiError && e.status === 403) {
        setAuthError("This area is for Solray operators only.");
      } else if (e instanceof ApiError && e.status === 401) {
        router.push("/login");
      }
    });
  }, [token, router]);

  return (
    <ProtectedRoute>
      <div
        className="min-h-[100dvh] bg-forest-deep"
        style={{ paddingBottom: "calc(96px + env(safe-area-inset-bottom, 16px))" }}
      >
        <Header userName={user?.name || "Operator"} />

        {authError ? (
          <div className="max-w-lg mx-auto px-5 pt-12 text-center">
            <p className="font-heading text-text-primary" style={{ fontSize: 22, fontWeight: 300 }}>
              {authError}
            </p>
            <button
              onClick={() => router.push("/today")}
              className="mt-6 font-body text-[12px] tracking-[0.22em] uppercase px-4 py-2 rounded-full border border-amber-sun/70 text-amber-sun hover:bg-amber-sun/10 transition-colors"
            >
              Back to Today
            </button>
          </div>
        ) : (
          <>
            <Tabs current={tab} onChange={setTab} />
            <div className="max-w-6xl mx-auto px-5 pt-6">
              {tab === "overview"  && <OverviewSection token={token} />}
              {tab === "brand"     && <BrandSection />}
              {tab === "calendar"  && <CalendarSection token={token} />}
              {tab === "social"    && <IntegrationsSection token={token} category="social"    title="Social channels" subtitle="Connect each platform once and the same UI becomes live." />}
              {tab === "ads"       && <IntegrationsSection token={token} category="ads"       title="Ads"             subtitle="Meta is first. Other platforms slot in as we add them." />}
              {tab === "analytics" && <IntegrationsSection token={token} category="analytics" title="Analytics"       subtitle="Visit data, funnel data, where users come from." />}
            </div>
          </>
        )}
      </div>
    </ProtectedRoute>
  );
}

function Header({ userName }: { userName: string }) {
  const router = useRouter();
  return (
    <div className="border-b border-forest-border/50">
      <div className="max-w-6xl mx-auto px-5 pt-2 pb-3">
        <p className="font-body text-[12px] tracking-[0.18em] uppercase mb-1" style={{ color: "rgb(var(--rgb-amber))" }}>
          Operations
        </p>
        <div className="relative flex items-center" style={{ height: "26px" }}>
          <button
            onClick={() => router.push("/today")}
            aria-label="Back"
            className="text-text-secondary hover:text-amber-sun transition-colors flex items-center justify-center"
            style={{ minWidth: "32px", minHeight: "32px", marginLeft: "-8px" }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
          <h1
            className="font-heading tracking-[0.15em] text-text-primary absolute left-1/2 -translate-x-1/2"
            style={{ fontWeight: 300, fontSize: "21px" }}
          >
            MARKETING
          </h1>
          <div className="ml-auto font-body text-text-secondary text-[12px] tracking-[0.14em] uppercase">
            {userName}
          </div>
        </div>
      </div>
    </div>
  );
}

function Tabs({ current, onChange }: { current: Tab; onChange: (t: Tab) => void }) {
  return (
    <div className="border-b border-forest-border/30 bg-forest-deep/40 sticky top-0 z-10 backdrop-blur">
      <div className="max-w-6xl mx-auto px-5 overflow-x-auto">
        <div className="flex gap-1 py-3 min-w-max">
          {TABS.map((t) => {
            const active = t.id === current;
            return (
              <button
                key={t.id}
                onClick={() => onChange(t.id)}
                className={`font-body text-[12px] tracking-[0.22em] uppercase px-4 py-2 rounded-full transition-all ${
                  active
                    ? "bg-amber-sun text-forest-deep"
                    : "text-text-secondary hover:text-text-primary border border-transparent hover:border-forest-border"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
