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
  incarnation_cross: string;
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

interface NumerologyData {
  life_path: number;
  expression: number;
  soul_urge: number;
  personal_year: number;
  current_year: number;
  short_meanings: Record<string, string>;
}

interface ChartData {
  natal: NatalPlanet[];
  human_design: HumanDesign;
  numerology: NumerologyData | null;
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

// Human-first translations for HD attributes
const HD_TYPE_MEANINGS: Record<string, string> = {
  "Generator": "You're built to respond. Your energy is sustainable when you love what you do.",
  "Manifesting Generator": "You're built to respond and move fast. Multiple things at once is your nature.",
  "Projector": "You're built to guide. Wait for the invitation before sharing your wisdom.",
  "Manifestor": "You're built to initiate. Inform the people around you before you act.",
  "Reflector": "You're a mirror for your community. You need a full lunar cycle before major decisions.",
};

const HD_STRATEGY_MEANINGS: Record<string, string> = {
  "Wait to respond": "Don't initiate. Let life present itself, then check your response.",
  "Wait for the invitation": "Your wisdom lands when invited. Share it when asked.",
  "Inform and initiate": "Tell people what you're doing before you do it.",
  "Wait a lunar cycle": "Give yourself a full month before deciding anything significant.",
};

const HD_AUTHORITY_MEANINGS: Record<string, string> = {
  "Sacral": "Your gut knows before your mind does. The yes or no in your body is your truth.",
  "Emotional": "You need time. Never decide in the heat or the low. Clarity comes in waves.",
  "Solar Plexus": "You need time. Never decide in the heat or the low. Clarity comes in waves.",
  "Emotional / Solar Plexus": "You need time. Never decide in the heat or the low. Clarity comes in waves.",
  "Splenic": "A quiet whisper in the moment. It only speaks once. Trust the first feeling.",
  "Spleen": "A quiet whisper in the moment. It only speaks once. Trust the first feeling.",
  "Self-Projected": "Talk it through out loud. Your truth emerges in your own voice.",
  "Mental": "Discuss it with people you trust. The answer comes through conversation.",
  "Mental / Sounding Board": "Discuss it with people you trust. The answer comes through conversation.",
  "Ego": "You know what you want when you commit from the heart. Only commit when it's real.",
  "Ego / Will": "You know what you want when you commit from the heart. Only commit when it's real.",
  "Lunar": "You reflect your environment. One full moon cycle before any major decision.",
  "None / Lunar": "You reflect your environment. One full moon cycle before any major decision.",
};

const HD_PROFILE_MEANINGS: Record<string, string> = {
  "1/3": "Investigator / Martyr. You learn by researching and by trial and error. Your mistakes are your teacher.",
  "1/4": "Investigator / Opportunist. You build through deep foundations and trusted networks.",
  "2/4": "Hermit / Opportunist. You need solitude to develop mastery, then your network calls you out.",
  "2/5": "Hermit / Heretic. You need alone time but people project practical solutions onto you.",
  "3/5": "Martyr / Heretic. You learn through experience and are seen as a practical problem-solver.",
  "3/6": "Martyr / Role Model. First half of life: trial and error. Second half: becoming the example.",
  "4/6": "Opportunist / Role Model. Your network is everything. You become a trusted authority.",
  "4/1": "Opportunist / Investigator. Security through relationships and solid foundations.",
  "5/1": "Heretic / Investigator. People project savior qualities onto you. Deep research backs your authority.",
  "5/2": "Heretic / Hermit. Called out of solitude to solve others' problems. Research gives you credibility.",
  "6/2": "Role Model / Hermit. Three life phases: trial, retreat, role model.",
  "6/3": "Role Model / Martyr. Experience-driven. You live it before you teach it.",
};

// Normalise HD centre names from backend keys to display labels
function normaliseCentreName(key: string): string {
  const MAP: Record<string, string> = {
    G: "G Centre",
    SolarPlexus: "Solar Plexus",
    Head: "Head",
    Ajna: "Ajna",
    Throat: "Throat",
    Heart: "Heart / Ego",
    Sacral: "Sacral",
    Spleen: "Spleen",
    Root: "Root",
  };
  return MAP[key] ?? key;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseBlueprint(blueprint: any): ChartData {
  const natal = blueprint?.astrology?.natal;
  const hd = blueprint?.human_design;
  const gk = blueprint?.gene_keys;
  const numRaw = blueprint?.numerology;

  // Build planets array
  const planetsRaw: NatalPlanet[] = [];
  if (natal?.planets) {
    for (const [name, data] of Object.entries(natal.planets as Record<string, any>)) {
      // Skip planets with no valid data (e.g. Chiron when ephemeris file missing)
      if (!data.sign || data.sign === 'Unknown' || data.longitude === null) continue;
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
      definedCentres = hd.defined_centres.map(normaliseCentreName);
    } else if (typeof hd.defined_centres === 'object') {
      definedCentres = Object.entries(hd.defined_centres).filter(([,v]) => v).map(([k]) => normaliseCentreName(k));
      undefinedCentres = Object.entries(hd.defined_centres).filter(([,v]) => !v).map(([k]) => normaliseCentreName(k));
    }
  }
  if (hd?.undefined_centres && Array.isArray(hd.undefined_centres)) {
    undefinedCentres = hd.undefined_centres.map(normaliseCentreName);
  }

  // Expand numeric profile to include descriptive name
  const PROFILE_NAMES: Record<string, string> = {
    "1/3": "Investigator / Martyr",
    "1/4": "Investigator / Opportunist",
    "2/4": "Hermit / Opportunist",
    "2/5": "Hermit / Heretic",
    "3/5": "Martyr / Heretic",
    "3/6": "Martyr / Role Model",
    "4/1": "Opportunist / Investigator",
    "4/6": "Opportunist / Role Model",
    "5/1": "Heretic / Investigator",
    "5/2": "Heretic / Hermit",
    "6/2": "Role Model / Hermit",
    "6/3": "Role Model / Martyr",
  };
  const rawProfile = hd?.profile ?? "";
  const profileDisplay = rawProfile && PROFILE_NAMES[rawProfile]
    ? `${rawProfile} — ${PROFILE_NAMES[rawProfile]}`
    : rawProfile;

  const crossLabel = hd?.incarnation_cross?.label ?? hd?.incarnation_cross ?? "";

  const humanDesign: HumanDesign = {
    type: hd?.type ?? "",
    strategy: hd?.strategy ?? "",
    authority: hd?.authority ?? "",
    profile: profileDisplay,
    incarnation_cross: typeof crossLabel === "string" ? crossLabel : String(crossLabel),
    defined_centres: definedCentres,
    undefined_centres: undefinedCentres,
    key_channels: keyChannels,
  };

  // Gene keys can come in two formats:
  // 1. {lifes_work: {...}, evolution: {...}}, hologenetic profile format
  // 2. {natal_gene_keys: {"64": {...}, "63": {...}}}, gate dict format
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
    // Gate dict format, map to hologenetic profile using natal planet gates
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
      { name: "Vocation",    gateKey: String(uc.Earth?.gate   || 5)  }, // Design Earth
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

  // Numerology
  const numerology: NumerologyData | null = numRaw ? {
    life_path: numRaw.life_path ?? 0,
    expression: numRaw.expression ?? 0,
    soul_urge: numRaw.soul_urge ?? 0,
    personal_year: numRaw.personal_year ?? 0,
    current_year: numRaw.current_year ?? new Date().getFullYear(),
    short_meanings: numRaw.short_meanings ?? {},
  } : null;

  return { natal: planetsRaw, human_design: humanDesign, numerology, gene_keys: geneKeys };
}

// Pattern-style interpretation templates for Sun, Moon, Rising
function buildCoreInterpretation(sun: string, moon: string, rising: string): string {
  const sunLines: Record<string, string> = {
    Aries: "You act before you think. The courage is real, but so is the cost of not waiting.",
    Taurus: "You move slowly and mean it. Stability isn't stubbornness. It's how you build things that last.",
    Gemini: "Your mind runs faster than the conversation. You're already three steps ahead, wondering if anyone will catch up.",
    Cancer: "You absorb the emotional temperature of every room you enter. Most people don't notice. You can't turn it off.",
    Leo: "You present with warmth and certainty. The private self questions more than the public one ever shows.",
    Virgo: "You analyze before you act. Even when you appear decisive, the calculation never stops.",
    Libra: "You see every side so clearly that choosing one feels like a betrayal of the others.",
    Scorpio: "You don't just observe. You read underneath. You know what's really happening long before it's said out loud.",
    Sagittarius: "You move toward meaning. When a situation stops teaching you something, you're already halfway out the door.",
    Capricorn: "You build. Quietly, methodically, often alone. The ambition runs deeper than most people suspect.",
    Aquarius: "You think at a distance from the crowd. The ideas feel obvious to you and unreachable to everyone else.",
    Pisces: "You feel everything, and not just your own. The boundaries between you and others are thinner than people realize.",
  };

  const moonLines: Record<string, string> = {
    Aries: "Emotionally, you react first and process later. The feelings arrive fast and honest.",
    Taurus: "You need emotional safety before you can open. Push too hard and the door closes completely.",
    Gemini: "You process feelings by talking them through. The words help you figure out what you actually feel.",
    Cancer: "You feel everything twice as hard as you show. The softness runs deep, even when the surface looks composed.",
    Leo: "You need to know the people you love are proud of you. Not often. Just sometimes. It matters more than you admit.",
    Virgo: "You critique yourself privately in ways you'd never say aloud. The standard is always slightly out of reach.",
    Libra: "You smooth things over instinctively, sometimes before you've even registered that you're upset.",
    Scorpio: "You take it in, hold it, and wait. The emotional world is private territory. Access is earned, not assumed.",
    Sagittarius: "You need room. Emotional confinement is worse for you than almost anything else.",
    Capricorn: "You learned early that feelings were less useful than results. You still carry that bargain.",
    Aquarius: "You observe your emotions from a slight distance. Not cold, just wired differently.",
    Pisces: "The boundary between your feelings and everyone else's is porous. You pick things up without meaning to.",
  };

  const risingLines: Record<string, string> = {
    Aries: "You arrive with energy before you arrive with words. People feel your presence before they hear your name.",
    Taurus: "You project calm even when everything inside is moving. The steadiness is real, and also sometimes a mask.",
    Gemini: "You adapt to the room instantly. People see what they need to see, and you give it to them naturally.",
    Cancer: "You lead with warmth. Strangers feel safe around you before you've said anything significant.",
    Leo: "You are noticed. That's not ego. It's just how the light falls on you when you enter a space.",
    Virgo: "You present as precise and considered. The impression you make is careful, even when you're not trying.",
    Libra: "You make people feel included. The grace is genuine, but it's also armor. Few get past it easily.",
    Scorpio: "You read the room completely before speaking. The intensity is quiet but unmistakable.",
    Sagittarius: "You project openness and forward motion. People want to follow you before they know where you're going.",
    Capricorn: "You project authority. Not loudly, just structurally. People assume competence before you've proven it.",
    Aquarius: "You come across as independent, a little electric, a little removed. It's exactly what you're going for.",
    Pisces: "You appear soft and approachable. The depth underneath takes people by surprise.",
  };

  const sunLine = sunLines[sun] || `The ${sun} Sun shapes how you move through the world.`;
  const moonLine = moonLines[moon] || `The ${moon} Moon is how you feel things when no one is watching.`;
  const risingLine = risingLines[rising] || `${rising} Rising is the door people walk through to find you.`;

  return `${sunLine} That's the ${sun} Sun.\n\n${moonLine} That's the ${moon} Moon.\n\n${risingLine} That's the ${rising} Rising.`;
}

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

function NatalSection({ planets }: { planets: NatalPlanet[] }) {
  const [showAll, setShowAll] = useState(false);

  const corePlanets = ["Sun", "Moon", "ASC"];
  const core = planets.filter((p) => corePlanets.includes(p.planet));
  const rest = planets.filter((p) => !corePlanets.includes(p.planet));

  const sun = core.find((p) => p.planet === "Sun");
  const moon = core.find((p) => p.planet === "Moon");
  const rising = core.find((p) => p.planet === "ASC");

  const interpretation =
    sun && moon && rising
      ? buildCoreInterpretation(sun.sign, moon.sign, rising.sign)
      : null;

  return (
    <div className="mt-2">
      {/* Core trio — very prominent */}
      <div className="space-y-4 mb-6">
        {core.map((p) => {
          const label = p.planet === "ASC" ? "Rising" : p.planet;
          const subtitles: Record<string, string> = {
            Sun: "Your core identity — how you shine",
            Moon: "Your emotional nature — how you feel",
            Rising: "Your outer mask — how the world sees you",
          };
          return (
            <div
              key={p.planet}
              className="flex items-center gap-4 py-3 border-b border-forest-border/40 last:border-0"
            >
              <span className="text-3xl w-10 text-center leading-none">{p.symbol}</span>
              <div className="flex-1">
                <p className="text-text-secondary text-[10px] font-body tracking-wider uppercase">{label}</p>
                <p className="text-text-secondary/50 text-[10px] font-body">{subtitles[label]}</p>
              </div>
              <div className="text-right">
                <p className="text-amber-sun font-heading text-2xl leading-tight">{p.sign}</p>
                <p className="text-text-secondary/60 font-body text-[10px]">{p.degree}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pattern-style interpretation */}
      {interpretation && (
        <div className="mb-6 p-4 bg-forest-card/40 rounded-xl border border-forest-border/30">
          {interpretation.split('\n\n').map((line, i) => (
            <p key={i} className={`font-body text-text-secondary text-sm leading-relaxed ${i > 0 ? 'mt-3' : ''}`}>
              {line}
            </p>
          ))}
        </div>
      )}

      {/* Collapsible: rest of planets */}
      <button
        onClick={() => setShowAll(!showAll)}
        className="flex items-center gap-2 text-text-secondary text-xs font-body tracking-wider uppercase mb-3 hover:text-text-primary transition-colors"
      >
        <span>{showAll ? "Hide planets" : "See all planets"}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`transition-transform duration-200 ${showAll ? "rotate-180" : ""}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {showAll && (
        <div className="space-y-1">
          {rest.map((p) => (
            <div key={p.planet} className="flex items-center gap-3 py-1.5 border-b border-forest-border/50 last:border-0">
              <span className="text-xl w-7 text-center opacity-70">{p.symbol}</span>
              <span className="text-text-primary font-body text-sm flex-1">{p.planet}</span>
              <span className="text-text-secondary font-body text-sm">{p.sign}</span>
              <span className="text-text-secondary font-body text-xs">{p.degree}</span>
              <span className="text-text-secondary font-body text-xs">H{p.house}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ChartPage() {
  const [chart, setChart] = useState<ChartData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { token } = useAuth();

  useEffect(() => {
    if (!token) return;

    const BP_CACHE_KEY = "solray_blueprint";
    const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

    async function fetchAndCacheBlueprint(isBackground: boolean) {
      try {
        const data = await apiFetch("/users/me", {}, token);
        if (data.blueprint) {
          try {
            const parsed = parseBlueprint(data.blueprint);
            // Cache blueprint with timestamp
            try {
              localStorage.setItem(
                BP_CACHE_KEY,
                JSON.stringify({ ...data.blueprint, _cachedAt: Date.now() })
              );
            } catch (_) {
              // ignore storage errors
            }
            if (!isBackground) {
              setChart(parsed);
              setLoading(false);
            } else {
              setChart(parsed);
            }
          } catch (parseErr) {
            console.error("Blueprint parse error:", parseErr);
            if (!isBackground) {
              setError("Could not parse your blueprint. Please try again.");
              setLoading(false);
            }
          }
        } else {
          if (!isBackground) {
            setError("Your blueprint is still being calculated. Check back shortly.");
            setLoading(false);
          }
        }
      } catch (err) {
        console.error("Chart load error:", err);
        if (!isBackground) {
          setError("Unable to load your chart. Please check your connection and try again.");
          setLoading(false);
        }
      }
    }

    // Fix 4: Try localStorage cache first
    try {
      const cached = localStorage.getItem(BP_CACHE_KEY);
      if (cached) {
        const bp = JSON.parse(cached);
        const cachedAt = bp._cachedAt || 0;
        const isStale = Date.now() - cachedAt > ONE_WEEK_MS;
        try {
          const parsed = parseBlueprint(bp);
          setChart(parsed);
          setLoading(false);
          // Refresh in background if stale (older than 1 week)
          if (isStale) {
            fetchAndCacheBlueprint(true);
          }
          return;
        } catch (_) {
          // Cache corrupt, fetch fresh
        }
      }
    } catch (_) {
      // ignore parse errors
    }

    // No valid cache — fetch fresh
    fetchAndCacheBlueprint(false);
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
        ) : error ? (
          <div className="max-w-lg mx-auto px-5 pt-12 text-center">
            <p className="text-text-secondary font-body text-sm leading-relaxed">{error}</p>
          </div>
        ) : chart ? (
          <div className="max-w-lg mx-auto px-5 animate-fade-in">
            {/* Natal Chart — open by default, shows Sun/Moon/Rising hero */}
            <CollapsibleSection title="Natal Chart" defaultOpen={true}>
              <NatalSection planets={chart.natal} />
            </CollapsibleSection>

            {/* Human Design */}
            <CollapsibleSection title="Human Design">
              <div className="space-y-4 mt-2">
                {/* Type — hero display */}
                {chart.human_design.type && (
                  <div className="pb-4 mb-1 border-b border-forest-border/40">
                    <p className="text-text-secondary text-[10px] font-body tracking-wider uppercase mb-1">Type</p>
                    <p className="text-amber-sun font-heading text-3xl leading-tight">{chart.human_design.type}</p>
                    {HD_TYPE_MEANINGS[chart.human_design.type] && (
                      <p className="text-text-secondary/50 text-xs font-body leading-snug mt-1">{HD_TYPE_MEANINGS[chart.human_design.type]}</p>
                    )}
                  </div>
                )}
                <HDRow label="Strategy" value={chart.human_design.strategy} meaning={HD_STRATEGY_MEANINGS[chart.human_design.strategy]} />
                <HDRow label="Authority" value={chart.human_design.authority} meaning={Object.entries(HD_AUTHORITY_MEANINGS).find(([k]) => chart.human_design.authority.includes(k) || k.includes(chart.human_design.authority))?.[1] || HD_AUTHORITY_MEANINGS[chart.human_design.authority]} />
                <HDRow label="Profile" value={chart.human_design.profile} meaning={(() => { const num = chart.human_design.profile.match(/^(\d\/\d)/)?.[1]; return num ? HD_PROFILE_MEANINGS[num] : undefined; })()} />
                {chart.human_design.incarnation_cross && (
                  <HDRow label="Cross" value={chart.human_design.incarnation_cross} />
                )}

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
                      <p key={ch} className="text-text-primary text-sm font-body">· {ch}</p>
                    ))}
                  </div>
                </div>
              </div>
            </CollapsibleSection>

            {/* Numerology */}
            {chart.numerology && (
              <CollapsibleSection title="Numerology">
                <NumerologySection data={chart.numerology} />
              </CollapsibleSection>
            )}

            {/* Gene Keys */}
            <CollapsibleSection title="Gene Keys">
              <div className="space-y-5 mt-2">
                {Object.values(chart.gene_keys).filter(Boolean).map((gk) => (
                  <div key={gk!.name} className="bg-forest-card rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-amber-sun text-xs font-body tracking-wider uppercase">{gk!.name}</span>
                      <span className="text-text-secondary text-xs font-body">· Gate {gk!.gate}</span>
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

function NumerologySection({ data }: { data: NumerologyData }) {
  const numbers = [
    { label: "Life Path", value: data.life_path, key: String(data.life_path) },
    { label: "Expression", value: data.expression, key: String(data.expression) },
    { label: "Soul Urge", value: data.soul_urge, key: String(data.soul_urge) },
    { label: `Personal Year ${data.current_year}`, value: data.personal_year, key: String(data.personal_year) },
  ];

  return (
    <div className="space-y-3 mt-2">
      {numbers.map(({ label, value, key }) => (
        <div
          key={label}
          className="flex items-center gap-4 py-3 border-b border-forest-border/40 last:border-0"
        >
          <span className="text-amber-sun font-heading text-3xl w-10 text-center leading-none">
            {value}
          </span>
          <div className="flex-1">
            <p className="text-text-secondary text-[10px] font-body tracking-wider uppercase">{label}</p>
            <p className="text-text-secondary/60 text-xs font-body mt-0.5">
              {data.short_meanings[key] || ""}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function HDRow({ label, value, highlight, meaning }: { label: string; value: string; highlight?: boolean; meaning?: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-text-secondary text-xs font-body tracking-wider uppercase w-24 shrink-0 pt-0.5">{label}</span>
      <div className="flex-1">
        <span className={`font-body text-sm ${highlight ? "text-amber-sun font-medium" : "text-text-primary"}`}>
          {value}
        </span>
        {meaning && (
          <p className="text-text-secondary/50 text-xs font-body leading-snug mt-0.5">{meaning}</p>
        )}
      </div>
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
