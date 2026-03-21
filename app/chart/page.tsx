"use client";

import { useEffect, useState } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import BottomNav from "@/components/BottomNav";
import LoadingSpinner from "@/components/LoadingSpinner";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";

interface NatalPlanet {
  planet: string;
  sign: string;
  degree: string;
  house: number;
  symbol: string;
}

interface HumanDesign {
  type: string;
  strategy: string;
  authority: string;
  profile: string;
  defined_centres: string[];
  undefined_centres: string[];
  key_channels: string[];
}

interface GeneKey {
  name: string;
  gate: number;
  shadow: string;
  gift: string;
  siddhi: string;
}

interface ChartData {
  natal: NatalPlanet[];
  human_design: HumanDesign;
  gene_keys: {
    lifes_work: GeneKey;
    evolution: GeneKey;
    radiance: GeneKey;
  };
}

const MOCK_CHART: ChartData = {
  natal: [
    { planet: "Sun", symbol: "☉", sign: "Scorpio", degree: "14°32'", house: 8 },
    { planet: "Moon", symbol: "☽", sign: "Cancer", degree: "3°17'", house: 5 },
    { planet: "Mercury", symbol: "☿", sign: "Scorpio", degree: "2°45'", house: 8 },
    { planet: "Venus", symbol: "♀", sign: "Libra", degree: "27°08'", house: 7 },
    { planet: "Mars", symbol: "♂", sign: "Virgo", degree: "19°54'", house: 7 },
    { planet: "Jupiter", symbol: "♃", sign: "Pisces", degree: "8°22'", house: 1 },
    { planet: "Saturn", symbol: "♄", sign: "Capricorn", degree: "22°01'", house: 10 },
    { planet: "Uranus", symbol: "♅", sign: "Capricorn", degree: "4°38'", house: 10 },
    { planet: "Neptune", symbol: "♆", sign: "Capricorn", degree: "12°15'", house: 10 },
    { planet: "Pluto", symbol: "♇", sign: "Scorpio", degree: "17°33'", house: 9 },
    { planet: "ASC", symbol: "↑", sign: "Pisces", degree: "12°44'", house: 1 },
    { planet: "MC", symbol: "↑", sign: "Sagittarius", degree: "21°19'", house: 10 },
  ],
  human_design: {
    type: "Projector",
    strategy: "Wait for the invitation",
    authority: "Splenic",
    profile: "1/3 — Investigator / Martyr",
    defined_centres: ["Spleen", "G Centre", "Heart"],
    undefined_centres: ["Root", "Sacral", "Solar Plexus", "Throat", "Ajna", "Head"],
    key_channels: ["Channel 57-10: Perfected Form", "Channel 26-44: Surrender"],
  },
  gene_keys: {
    lifes_work: {
      name: "Life's Work",
      gate: 57,
      shadow: "Unease",
      gift: "Intuition",
      siddhi: "Clarity",
    },
    evolution: {
      name: "Evolution",
      gate: 51,
      shadow: "Agitation",
      gift: "Initiative",
      siddhi: "Awakening",
    },
    radiance: {
      name: "Radiance",
      gate: 44,
      shadow: "Interference",
      gift: "Teamwork",
      siddhi: "Synarchy",
    },
  },
};

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

export default function ChartPage() {
  const [chart, setChart] = useState<ChartData | null>(null);
  const [loading, setLoading] = useState(true);
  const { token } = useAuth();

  useEffect(() => {
    async function loadChart() {
      try {
        const data = await apiFetch("/users/me", {}, token);
        if (data.chart) setChart(data.chart);
        else setChart(MOCK_CHART);
      } catch {
        setChart(MOCK_CHART);
      } finally {
        setLoading(false);
      }
    }
    if (token) loadChart();
  }, [token]);

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-forest-deep pb-24">
        {/* Header */}
        <div className="px-5 pt-12 pb-6 max-w-lg mx-auto">
          <p className="text-text-secondary text-[10px] font-body tracking-[0.2em] uppercase mb-1">Your</p>
          <h1 className="font-heading text-4xl text-text-primary">Blueprint</h1>
        </div>

        {loading ? (
          <div className="flex items-center justify-center pt-16">
            <LoadingSpinner size="lg" />
          </div>
        ) : chart ? (
          <div className="max-w-lg mx-auto px-5 animate-fade-in">
            {/* Natal Chart */}
            <CollapsibleSection title="Natal Chart" defaultOpen={true}>
              <div className="space-y-2 mt-2">
                {chart.natal.map((p) => (
                  <div key={p.planet} className="flex items-center gap-3 py-1.5 border-b border-forest-border/50 last:border-0">
                    <span className="text-xl w-7 text-center">{p.symbol}</span>
                    <span className="text-text-primary font-body text-sm flex-1">{p.planet}</span>
                    <span className="text-text-secondary font-body text-sm">{p.sign}</span>
                    <span className="text-text-secondary font-body text-xs">{p.degree}</span>
                    <span className="text-text-secondary font-body text-xs">H{p.house}</span>
                  </div>
                ))}
              </div>
            </CollapsibleSection>

            {/* Human Design */}
            <CollapsibleSection title="Human Design">
              <div className="space-y-4 mt-2">
                <HDRow label="Type" value={chart.human_design.type} highlight />
                <HDRow label="Strategy" value={chart.human_design.strategy} />
                <HDRow label="Authority" value={chart.human_design.authority} />
                <HDRow label="Profile" value={chart.human_design.profile} />

                <div>
                  <p className="text-text-secondary text-xs font-body tracking-wider uppercase mb-2">Defined Centres</p>
                  <div className="flex flex-wrap gap-2">
                    {chart.human_design.defined_centres.map((c) => (
                      <span key={c} className="px-2.5 py-1 bg-forest-card border border-amber-sun/30 rounded-full text-amber-sun text-xs font-body">
                        {c}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-text-secondary text-xs font-body tracking-wider uppercase mb-2">Undefined Centres</p>
                  <div className="flex flex-wrap gap-2">
                    {chart.human_design.undefined_centres.map((c) => (
                      <span key={c} className="px-2.5 py-1 bg-forest-card border border-forest-border rounded-full text-text-secondary text-xs font-body">
                        {c}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-text-secondary text-xs font-body tracking-wider uppercase mb-2">Key Channels</p>
                  <div className="space-y-1">
                    {chart.human_design.key_channels.map((ch) => (
                      <p key={ch} className="text-text-primary text-sm font-body">— {ch}</p>
                    ))}
                  </div>
                </div>
              </div>
            </CollapsibleSection>

            {/* Gene Keys */}
            <CollapsibleSection title="Gene Keys">
              <div className="space-y-5 mt-2">
                {Object.values(chart.gene_keys).map((gk) => (
                  <div key={gk.name} className="bg-forest-card rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-amber-sun text-xs font-body tracking-wider uppercase">{gk.name}</span>
                      <span className="text-forest-border text-xs font-body">— Gate {gk.gate}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <GKPill label="Shadow" value={gk.shadow} color="text-red-400/70" />
                      <GKPill label="Gift" value={gk.gift} color="text-amber-sun" />
                      <GKPill label="Siddhi" value={gk.siddhi} color="text-text-primary" />
                    </div>
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          </div>
        ) : null}

        <BottomNav />
      </div>
    </ProtectedRoute>
  );
}

function HDRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-text-secondary text-xs font-body tracking-wider uppercase w-24 shrink-0 pt-0.5">{label}</span>
      <span className={`font-body text-sm ${highlight ? "text-amber-sun font-medium" : "text-text-primary"}`}>
        {value}
      </span>
    </div>
  );
}

function GKPill({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="text-center">
      <p className="text-text-secondary text-[10px] font-body tracking-wider uppercase mb-1">{label}</p>
      <p className={`font-heading text-lg ${color}`}>{value}</p>
    </div>
  );
}
