/**
 * Shared blueprint parser. Extracted from app/profile/page.tsx so the
 * connection profile page (/profile/[id]) can render the same depth
 * (NatalWheel, BodyGraph, Gene Keys, Numerology) without duplicating
 * the parser logic.
 *
 * Tomorrow refactor: app/profile/page.tsx should also import from here
 * and the inline copy can go. For now both versions exist — this one
 * is the canonical one going forward.
 */

export const PLANET_SYMBOLS: Record<string, string> = {
  Sun: "Su", Moon: "Mo", Mercury: "Me", Venus: "Ve", Mars: "Ma",
  Jupiter: "Ju", Saturn: "Sa", Uranus: "Ur", Neptune: "Ne", Pluto: "Pl",
  NorthNode: "Nd", Chiron: "Ch", Ceres: "Ce", ASC: "As",
};

export function formatDegree(d: number): string {
  const deg = Math.floor(d);
  const min = Math.round((d - deg) * 60);
  return `${deg}°${String(min).padStart(2, "0")}'`;
}

export const HD_TYPE_MEANINGS: Record<string, string> = {
  "Generator": "You're built to respond. Your energy is sustainable when you love what you do.",
  "Manifesting Generator": "You're built to respond and move fast. Multiple things at once is your nature.",
  "Projector": "You're built to guide. Wait for the invitation before sharing your wisdom.",
  "Manifestor": "You're built to initiate. Inform the people around you before you act.",
  "Reflector": "You're a mirror for your community. You need a full lunar cycle before major decisions.",
};

export const HD_AUTHORITY_MEANINGS: Record<string, string> = {
  "Sacral": "Your gut knows before your mind does. The yes or no in your body is your truth.",
  "Emotional": "You need time. Never decide in the heat or the low. Clarity comes in waves.",
  "Solar Plexus": "You need time. Never decide in the heat or the low. Clarity comes in waves.",
  "Splenic": "A quiet whisper in the moment. It only speaks once. Trust the first feeling.",
  "Self-Projected": "Talk it through out loud. Your truth emerges in your own voice.",
  "Mental / Sounding Board": "Discuss it with people you trust. The answer comes through conversation.",
  "Ego": "You know what you want when you commit from the heart. Only commit when it's real.",
  "Lunar": "You reflect your environment. One full moon cycle before any major decision.",
};

export const HD_PROFILE_MEANINGS: Record<string, string> = {
  "1/3": "Investigator / Martyr. You learn by researching and by trial and error.",
  "1/4": "Investigator / Opportunist. You build through deep foundations and trusted networks.",
  "2/4": "Hermit / Opportunist. You need solitude to develop mastery, then your network calls you out.",
  "2/5": "Hermit / Heretic. You need alone time but people project practical solutions onto you.",
  "3/5": "Martyr / Heretic. You learn through experience and are seen as a practical problem-solver.",
  "3/6": "Martyr / Role Model. First half of life: trial and error. Second half: becoming the example.",
  "4/6": "Opportunist / Role Model. Your network is everything. You become a trusted authority.",
  "5/1": "Heretic / Investigator. People project savior qualities onto you.",
  "5/2": "Heretic / Hermit. Called out of solitude to solve others' problems.",
  "6/2": "Role Model / Hermit. Three life phases: trial, retreat, role model.",
  "6/3": "Role Model / Martyr. Experience-driven. You live it before you teach it.",
};

export function normaliseCentreName(key: string): string {
  const MAP: Record<string, string> = {
    G: "G Centre", SolarPlexus: "Solar Plexus", Head: "Head", Ajna: "Ajna",
    Throat: "Throat", Heart: "Heart / Ego", Sacral: "Sacral", Spleen: "Spleen", Root: "Root",
  };
  return MAP[key] ?? key;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

export type ParsedPlanet = {
  planet: string;
  symbol: string;
  sign: string;
  degree: string;
  longitude: number;
  house: number;
  retrograde?: boolean;
};

export type ParsedHumanDesign = {
  type: string;
  strategy: string;
  authority: string;
  profile: string;
  incarnation_cross: string;
  defined_centres: string[];
  undefined_centres: string[];
  key_channels: string[];
};

export type ParsedGeneKey = {
  name: string;
  gate: number;
  shadow: string;
  gift: string;
  siddhi: string;
};

export type ParsedNumerology = {
  life_path: number;
  expression: number;
  soul_urge: number;
  personal_year: number;
  current_year: number;
  short_meanings: Record<string, string>;
};

export type ParsedChart = {
  natal: ParsedPlanet[];
  ascLongitude: number | null;
  houseCusps: number[];
  human_design: ParsedHumanDesign;
  hd_gates: number[];
  hd_channels: Array<[number, number]>;
  numerology: ParsedNumerology | null;
  gene_keys: Record<string, ParsedGeneKey>;
};

export function parseBlueprintForChart(blueprint: any): ParsedChart {
  const natal = blueprint?.astrology?.natal;
  const hd = blueprint?.human_design;
  const gk = blueprint?.gene_keys;
  const numRaw = blueprint?.numerology;

  const planetsRaw: ParsedPlanet[] = [];
  if (natal?.planets) {
    for (const [name, data] of Object.entries(natal.planets as Record<string, any>)) {
      const d = data as any;
      if (!d.sign || d.sign === 'Unknown' || d.longitude === null) continue;
      planetsRaw.push({
        planet: name,
        symbol: PLANET_SYMBOLS[name] ?? "●",
        sign: d.sign,
        degree: formatDegree(d.degree),
        longitude: d.longitude,
        house: d.house,
        retrograde: d.retrograde,
      });
    }
  }
  if (natal?.ascendant) {
    planetsRaw.push({
      planet: "ASC",
      symbol: "↑",
      sign: natal.ascendant.sign,
      degree: formatDegree(natal.ascendant.degree),
      longitude: natal.ascendant.longitude,
      house: 1,
    });
  }

  const ascLongitude: number | null = natal?.ascendant?.longitude ?? null;
  const houseCusps: number[] = Array.isArray(natal?.house_cusps)
    ? (natal.house_cusps as any[]).map((h) => (typeof h === "number" ? h : h?.longitude)).filter((n) => typeof n === "number")
    : [];

  const keyChannels: string[] = hd?.defined_channels
    ? (hd.defined_channels as Array<any>).map((ch: any) => {
        if (Array.isArray(ch)) return `Channel ${ch[0]}-${ch[1]}: ${ch[2]}`;
        if (ch && typeof ch === 'object') return `Channel ${ch.gate_a}-${ch.gate_b}: ${ch.name}`;
        return String(ch);
      })
    : [];

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

  const PROFILE_NAMES: Record<string, string> = {
    "1/3": "Investigator / Martyr", "1/4": "Investigator / Opportunist",
    "2/4": "Hermit / Opportunist", "2/5": "Hermit / Heretic",
    "3/5": "Martyr / Heretic", "3/6": "Martyr / Role Model",
    "4/1": "Opportunist / Investigator", "4/6": "Opportunist / Role Model",
    "5/1": "Heretic / Investigator", "5/2": "Heretic / Hermit",
    "6/2": "Role Model / Hermit", "6/3": "Role Model / Martyr",
  };
  const rawProfile = hd?.profile ?? "";
  const profileDisplay = rawProfile && PROFILE_NAMES[rawProfile] ? `${rawProfile}: ${PROFILE_NAMES[rawProfile]}` : rawProfile;
  const crossLabel = hd?.incarnation_cross?.name ?? hd?.incarnation_cross?.label ?? hd?.incarnation_cross ?? "";

  const humanDesign: ParsedHumanDesign = {
    type: hd?.type ?? "",
    strategy: hd?.strategy ?? "",
    authority: hd?.authority ?? "",
    profile: profileDisplay,
    incarnation_cross: typeof crossLabel === "string" ? crossLabel : String(crossLabel),
    defined_centres: definedCentres,
    undefined_centres: undefinedCentres,
    key_channels: keyChannels,
  };

  const gkBuild = (name: string, data: any): ParsedGeneKey | undefined =>
    data ? { name, gate: data.gate ?? 0, shadow: data.shadow ?? "", gift: data.gift ?? "", siddhi: data.siddhi ?? "" } : undefined;

  const geneKeys: Record<string, ParsedGeneKey> = {};
  if (gk?.lifes_work || gk?.evolution) {
    const lw = gkBuild("Life's Work", gk.lifes_work); if (lw) geneKeys.lifes_work = lw;
    const ev = gkBuild("Evolution",   gk.evolution);  if (ev) geneKeys.evolution = ev;
    const ra = gkBuild("Radiance",    gk.radiance);   if (ra) geneKeys.radiance = ra;
    const pu = gkBuild("Purpose",     gk.purpose);    if (pu) geneKeys.purpose = pu;
    const at = gkBuild("Attraction",  gk.attraction); if (at) geneKeys.attraction = at;
    const iq = gkBuild("IQ",          gk.iq);         if (iq) geneKeys.iq = iq;
    const eq = gkBuild("EQ",          gk.eq);         if (eq) geneKeys.eq = eq;
  } else if (gk?.natal_gene_keys) {
    const natalGK = gk.natal_gene_keys as Record<string, any>;
    const cc = hd?.conscious_chart || {};
    const uc = hd?.unconscious_chart || {};
    const profileMap: Array<{ name: string; gateKey: string | null }> = [
      { name: "Life's Work", gateKey: cc.Sun?.gate       != null ? String(cc.Sun.gate)       : null },
      { name: "Evolution",   gateKey: cc.Earth?.gate     != null ? String(cc.Earth.gate)     : null },
      { name: "Radiance",    gateKey: uc.Sun?.gate       != null ? String(uc.Sun.gate)       : null },
      { name: "Purpose",     gateKey: uc.Earth?.gate     != null ? String(uc.Earth.gate)     : null },
      { name: "Attraction",  gateKey: cc.Venus?.gate     != null ? String(cc.Venus.gate)     : null },
      { name: "IQ",          gateKey: cc.SouthNode?.gate != null ? String(cc.SouthNode.gate) : null },
      { name: "EQ",          gateKey: cc.Moon?.gate      != null ? String(cc.Moon.gate)      : null },
    ];
    profileMap.forEach(({ name, gateKey }) => {
      if (!gateKey) return;
      const entry = natalGK[gateKey];
      if (entry) {
        const key = name.toLowerCase().replace(/[' ]/g, '_');
        geneKeys[key] = { name, gate: entry.gate, shadow: entry.shadow ?? "", gift: entry.gift ?? "", siddhi: entry.siddhi ?? "" };
      }
    });
  }

  const numerology: ParsedNumerology | null = numRaw ? {
    life_path: numRaw.life_path ?? 0,
    expression: numRaw.expression ?? 0,
    soul_urge: numRaw.soul_urge ?? 0,
    personal_year: numRaw.personal_year ?? 0,
    current_year: numRaw.current_year ?? new Date().getFullYear(),
    short_meanings: numRaw.short_meanings ?? {},
  } : null;

  const hdGates: number[] = Array.isArray((hd as any)?.defined_gates)
    ? ((hd as any).defined_gates as any[]).map((g) => (typeof g === "number" ? g : parseInt(g, 10))).filter((n) => Number.isFinite(n))
    : [];

  const hdChannels: Array<[number, number]> = Array.isArray((hd as any)?.defined_channels)
    ? ((hd as any).defined_channels as any[]).map((ch) => {
        if (Array.isArray(ch)) return [Number(ch[0]), Number(ch[1])] as [number, number];
        if (ch && typeof ch === "object") return [Number(ch.gate_a), Number(ch.gate_b)] as [number, number];
        return [0, 0] as [number, number];
      }).filter(([a, b]) => a > 0 && b > 0)
    : [];

  return {
    natal: planetsRaw,
    ascLongitude,
    houseCusps,
    human_design: humanDesign,
    hd_gates: hdGates,
    hd_channels: hdChannels,
    numerology,
    gene_keys: geneKeys,
  };
}
