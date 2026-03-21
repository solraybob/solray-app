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
    vocation?: GeneKey;
    culture?: GeneKey;
    pearl?: GeneKey;
  };
}

const PLANET_SYMBOLS: Record<string, string> = {
  Sun: "☉",
  Moon: "☽",
  Mercury: "☿",
  Venus: "♀",
  Mars: "♂",
  Jupiter: "♃",
  Saturn: "♄",
  Uranus: "♅",
  Neptune: "♆",
  Pluto: "♇",
  NorthNode: "☊",
  Chiron: "⚷",
  Ceres: "⚳",
  ASC: "↑",
};

function formatDegree(decimalDegree: number): string {
  const deg = Math.floor(decimalDegree);
  const minutes = Math.round((decimalDegree - deg) * 60);
  return `${deg}°${String(minutes).padStart(2, "0")}'`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseBlueprint(blueprint: any): ChartData {
  const natal = blueprint?.astrology?.natal;
  const hd = blueprint?.human_design;
  const gk = blueprint?.gene_keys;

  // Build planets array
  const planetsRaw: NatalPlanet[] = [];
  if (natal?.planets) {
    for (const [name, data] of Object.entries(natal.planets as Record<string, { sign: string; degree: number; house: number; retrograde: boolean }>)) {
      planetsRaw.push({
        planet: name,
        symbol: PLANET_SYMBOLS[name] ?? "●",
        sign: data.sign,
        degree: formatDegree(data.degree),
        house: data.house,
      });
    }
  }
  // Add ASC
  if (natal?.ascendant) {
    planetsRaw.push({
      planet: "ASC",
      symbol: "↑",
      sign: natal.ascendant.sign,
      degree: formatDegree(natal.ascendant.degree),
      house: 1,
    });
  }

  // Build key_channels from defined_channels
  const keyChannels: string[] = hd?.defined_channels
    ? (hd.defined_channels as Array<any>).map((ch) => {
        if (Array.isArray(ch)) return `Channel ${ch[0]}-${ch[1]}: ${ch[2]}`;
        if (ch && typeof ch === 'object') return `Channel ${ch.gate_a}-${ch.gate_b}: ${ch.name}`;
        return String(ch);
      })
    : [];

  // defined_centres can be a dict {Head: true, Sacral: true} or array of strings
  let definedCentres: string[] = [];
  let undefinedCentres: string[] = [];
  if (hd?.defined_centres) {
    if (Array.isArray(hd.defined_centres)) {
      definedCentres = hd.defined_centres;
    } else if (typeof hd.defined_centres === 'object') {
      definedCentres = Object.entries(hd.defined_centres).filter(([,v]) => v).map(([k]) => k);
      undefinedCentres = Object.entries(hd.defined_centres).filter(([,v]) => !v).map(([k]) => k);
    }
  }
  if (hd?.undefined_centres && Array.isArray(hd.undefined_centres)) {
    undefinedCentres = hd.undefined_centres;
  }

  const humanDesign: HumanDesign = {
    type: hd?.type ?? "",
    strategy: hd?.strategy ?? "",
    authority: hd?.authority ?? "",
    profile: hd?.profile ?? "",
    defined_centres: definedCentres,
    undefined_centres: undefinedCentres,
    key_channels: keyChannels,
  };

  // Gene keys can come in two formats:
  // 1. {lifes_work: {...}, evolution: {...}} — hologenetic profile format
  // 2. {natal_gene_keys: {"64": {...}, "63": {...}}} — gate dict format
  const gkBuild = (name: string, data: any) => data ? { name, gate: data.gate ?? 0, shadow: data.shadow ?? "", gift: data.gift ?? "", siddhi: data.siddhi ?? "" } : undefined;

  let geneKeys: any = {};
  if (gk?.lifes_work || gk?.evolution) {
    // Hologenetic profile format
    geneKeys = {
      lifes_work: gkBuild("Life's Work", gk.lifes_work),
      evolution: gkBuild("Evolution", gk.evolution),
      radiance: gkBuild("Radiance", gk.radiance),
      vocation: gkBuild("Vocation", gk.vocation),
      culture: gkBuild("Culture", gk.culture),
      pearl: gkBuild("Pearl", gk.pearl),
    };
  } else if (gk?.natal_gene_keys) {
    // Gate dict format — map to hologenetic profile using natal planet gates
    const natalGK = gk.natal_gene_keys as Record<string, any>;
    const hd2 = blueprint?.human_design || {};
    // Conscious Sun gate = Life's Work, Conscious Earth = Evolution
    // Design Moon = Radiance, Design Sun = Vocation, Design Earth = Culture, Conscious Moon = Pearl
    const cc = hd2.conscious_chart || {};
    const uc = hd2.unconscious_chart || {};
    const profileMap = [
      { name: "Life's Work", gateKey: String(cc.Sun?.gate     || 64) }, // Conscious Sun
      { name: "Evolution",   gateKey: String(cc.Earth?.gate   || 63) }, // Conscious Earth
      { name: "Radiance",    gateKey: String(uc.Sun?.gate     || 35) }, // Design Sun
      { name: "Purpose",     gateKey: String(uc.Earth?.gate   || 5)  }, // Design Earth
      { name: "Culture",     gateKey: String(uc.Jupiter?.gate || 45) }, // Design Jupiter
      { name: "Pearl",       gateKey: String(uc.Moon?.gate    || 52) }, // Design Moon
    ];
    geneKeys = {};
    profileMap.forEach(({ name, gateKey }) => {
      const entry = natalGK[gateKey];
      if (entry) {
        const key = name.toLowerCase().replace(/[' ]/g, '_');
        geneKeys[key] = { name, gate: entry.gate, shadow: entry.shadow ?? "", gift: entry.gift ?? "", siddhi: entry.siddhi ?? "" };
      }
    });
    // Fallback: if profile gates not in blueprint, use first 6 sorted by gate number
    if (Object.keys(geneKeys).length < 3) {
      const gkLabels = ["Life's Work", "Evolution", "Radiance", "Vocation", "Culture", "Pearl"];
      const sorted = Object.values(natalGK).sort((a: any, b: any) => a.gate - b.gate).slice(0, 6);
      geneKeys = {};
      sorted.forEach((entry: any, i: number) => {
        const key = gkLabels[i].toLowerCase().replace(/[' ]/g, '_');
        geneKeys[key] = { name: gkLabels[i], gate: entry.gate, shadow: entry.shadow ?? "", gift: entry.gift ?? "", siddhi: entry.siddhi ?? "" };
      });
    }
  }

  return { natal: planetsRaw, human_design: humanDesign, gene_keys: geneKeys };
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
        if (data.blueprint) {
          try {
            const parsed = parseBlueprint(data.blueprint);
            setChart(parsed);
          } catch (parseErr) {
            console.error("Blueprint parse error:", parseErr);
            setChart(MOCK_CHART);
          }
        } else {
          setChart(MOCK_CHART);
        }
      } catch (err) {
        console.error("Chart load error:", err);
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
                {Object.values(chart.gene_keys).filter(Boolean).map((gk) => (
                  <div key={gk!.name} className="bg-forest-card rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-amber-sun text-xs font-body tracking-wider uppercase">{gk!.name}</span>
                      <span className="text-text-secondary text-xs font-body">— Gate {gk!.gate}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <GKPill label="Shadow" value={gk!.shadow} color="text-red-400/70" />
                      <GKPill label="Gift" value={gk!.gift} color="text-amber-sun" />
                      <GKPill label="Siddhi" value={gk!.siddhi} color="text-text-primary" />
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
