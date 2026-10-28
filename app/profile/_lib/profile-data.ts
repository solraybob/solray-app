// Types

export interface RadarValues {
  fire: number;
  earth: number;
  air: number;
  water: number;
  cardinal: number;
  fixed: number;
  mutable: number;
}

export interface NatalAspect {
  planet1: string;
  planet2: string;
  aspect: string;
  orb: number;
}

export interface ProfileData {
  name: string;
  handle: string;
  sunSign: string;
  moonSign: string;
  risingSign: string;
  hdType: string;
  hdProfile: string;
  authority: string;
  incarnationCross: string;
  lifesWorkGate: number;
  lifesWorkGift: string;
  lifesWorkShadow: string;
  evolutionGate: number;
  evolutionGift: string;
  evolutionShadow: string;
  radar: RadarValues;        // proportional percentages, for bar legend
  radarDisplay: RadarValues; // max-normalized per group, for spider shape
  aspects: NatalAspect[];
}

// Sign sets

const FIRE_SIGNS = new Set(["Aries", "Leo", "Sagittarius"]);
const EARTH_SIGNS = new Set(["Taurus", "Virgo", "Capricorn"]);
const AIR_SIGNS = new Set(["Gemini", "Libra", "Aquarius"]);
const WATER_SIGNS = new Set(["Cancer", "Scorpio", "Pisces"]);
const CARDINAL_SIGNS = new Set(["Aries", "Cancer", "Libra", "Capricorn"]);
const FIXED_SIGNS = new Set(["Taurus", "Leo", "Scorpio", "Aquarius"]);
const MUTABLE_SIGNS = new Set(["Gemini", "Virgo", "Sagittarius", "Pisces"]);

function clamp(v: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, v));
}

const POINTS_PER_PLANET = 14;
const POINTS_PER_ANGLE = 20;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function computeRadar(blueprint: any): RadarValues {
  const natal = blueprint?.astrology?.natal ?? {};
  const planets = natal?.planets ?? {};

  // Element + modality counting (raw points)
  const counts = { fire: 0, earth: 0, air: 0, water: 0, cardinal: 0, fixed: 0, mutable: 0 };

  function addSign(sign: string, weight: number) {
    if (FIRE_SIGNS.has(sign)) counts.fire += weight;
    else if (EARTH_SIGNS.has(sign)) counts.earth += weight;
    else if (AIR_SIGNS.has(sign)) counts.air += weight;
    else if (WATER_SIGNS.has(sign)) counts.water += weight;
    if (CARDINAL_SIGNS.has(sign)) counts.cardinal += weight;
    else if (FIXED_SIGNS.has(sign)) counts.fixed += weight;
    else if (MUTABLE_SIGNS.has(sign)) counts.mutable += weight;
  }

  // Regular planets
  Object.values(planets as Record<string, { sign?: string }>).forEach((p) => {
    addSign(p?.sign ?? "", POINTS_PER_PLANET);
  });

  // ASC and MC (higher weight)
  const ascSign = (natal?.ascendant as Record<string, string> | undefined)?.sign ?? "";
  const mcSign = (natal?.mc as Record<string, string> | undefined)?.sign ?? "";
  if (ascSign) addSign(ascSign, POINTS_PER_ANGLE);
  if (mcSign) addSign(mcSign, POINTS_PER_ANGLE);

  // Proportional partition: elements share 100% of the element total,
  // modalities share 100% of the modality total. No single element can
  // be 100% unless it literally accounts for every point in the chart.
  const totalElement = counts.fire + counts.earth + counts.air + counts.water || 1;
  const totalModality = counts.cardinal + counts.fixed + counts.mutable || 1;

  return {
    fire: clamp(Math.round((counts.fire / totalElement) * 100)),
    earth: clamp(Math.round((counts.earth / totalElement) * 100)),
    air: clamp(Math.round((counts.air / totalElement) * 100)),
    water: clamp(Math.round((counts.water / totalElement) * 100)),
    cardinal: clamp(Math.round((counts.cardinal / totalModality) * 100)),
    fixed: clamp(Math.round((counts.fixed / totalModality) * 100)),
    mutable: clamp(Math.round((counts.mutable / totalModality) * 100)),
  };
}

// Max-normalized radar values, used only for the spider chart shape.
// Within each group (elements, modalities) the dominant axis reaches 100%,
// giving the polygon a full, readable shape regardless of how balanced the chart is.
function computeRadarDisplay(proportional: RadarValues): RadarValues {
  const maxE = Math.max(proportional.fire, proportional.earth, proportional.air, proportional.water, 1);
  const maxM = Math.max(proportional.cardinal, proportional.fixed, proportional.mutable, 1);
  return {
    fire:     clamp(Math.round((proportional.fire / maxE) * 100)),
    earth:    clamp(Math.round((proportional.earth / maxE) * 100)),
    air:      clamp(Math.round((proportional.air / maxE) * 100)),
    water:    clamp(Math.round((proportional.water / maxE) * 100)),
    cardinal: clamp(Math.round((proportional.cardinal / maxM) * 100)),
    fixed:    clamp(Math.round((proportional.fixed / maxM) * 100)),
    mutable:  clamp(Math.round((proportional.mutable / maxM) * 100)),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseProfile(blueprint: any): ProfileData {
  const natal = blueprint?.astrology?.natal ?? {};
  const hd = blueprint?.human_design ?? {};
  const gk = blueprint?.gene_keys ?? {};
  const user = blueprint?.user ?? {};
  // Name and username stored in cache with underscore prefix
  const _cachedName = blueprint?._name || "";
  const _cachedUsername = blueprint?._username || "";

  const sunSign = natal?.planets?.Sun?.sign ?? "";
  const moonSign = natal?.planets?.Moon?.sign ?? "";
  const risingSign = natal?.ascendant?.sign ?? "";

  // Honest defaults: zero gate, empty gift/shadow when data is missing.
  // Previous version hardcoded { gate: 64, gift: "Imagination", shadow:
  // "Confusion" } and { gate: 63, gift: "Inquiry", shadow: "Doubt" } as
  // initial values, which would render to the user as if those were
  // their actual Gene Keys whenever the blueprint failed to load. The
  // user pays for personalised data, so any unknown field stays empty
  // and the UI hides what it cannot honestly fill.
  let lifesWork: { gate: number; gift: string; shadow: string } = { gate: 0, gift: "", shadow: "" };
  let evolution: { gate: number; gift: string; shadow: string } = { gate: 0, gift: "", shadow: "" };

  if (gk.lifes_work) {
    lifesWork = { gate: gk.lifes_work.gate ?? 0, gift: gk.lifes_work.gift ?? "", shadow: gk.lifes_work.shadow ?? "" };
  } else if (gk.natal_gene_keys) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vals = Object.values(gk.natal_gene_keys as Record<string, any>).sort((a: any, b: any) => a.gate - b.gate);
    if (vals[0]) lifesWork = { gate: vals[0].gate, gift: vals[0].gift ?? "", shadow: vals[0].shadow ?? "" };
    if (vals[1]) evolution = { gate: vals[1].gate, gift: vals[1].gift ?? "", shadow: vals[1].shadow ?? "" };
  }
  if (gk.evolution) {
    evolution = { gate: gk.evolution.gate ?? 0, gift: gk.evolution.gift ?? "", shadow: gk.evolution.shadow ?? "" };
  }

  const crossLabel = hd?.incarnation_cross?.name ?? hd?.incarnation_cross?.label ?? hd?.incarnation_cross ?? "";
  // Honest empty when name/handle is missing. UI is responsible for
  // hiding or placeholdering empty strings. Previous defaults of
  // "Your Name" and "you" rendered prominently as if they were the
  // user's actual identity when the blueprint or profile failed to
  // load.
  const name = _cachedName || user?.name || blueprint?.name || "";
  const handle = _cachedUsername || user?.handle || blueprint?.handle || user?.email?.split("@")[0] || "";

  // Parse natal aspects with orb filtering
  const MAJOR_ASPECTS = new Set(["trine", "sextile", "conjunction", "opposition", "square"]);
  const rawAspects: NatalAspect[] = blueprint?.astrology?.natal?.aspects ?? [];
  const aspects = rawAspects.filter((a) => {
    const type = a.aspect?.toLowerCase() ?? "";
    if (MAJOR_ASPECTS.has(type)) return a.orb <= 8;
    if (type === "quincunx") return a.orb <= 3;
    return a.orb <= 2;
  });

  return {
    name,
    handle,
    sunSign,
    moonSign,
    risingSign,
    hdType: hd?.type ?? "",
    hdProfile: hd?.profile ?? "",
    authority: hd?.authority ?? "",
    incarnationCross: typeof crossLabel === "string" ? crossLabel : String(crossLabel),
    lifesWorkGate: lifesWork.gate,
    lifesWorkGift: lifesWork.gift,
    lifesWorkShadow: lifesWork.shadow,
    evolutionGate: evolution.gate,
    evolutionGift: evolution.gift,
    evolutionShadow: evolution.shadow,
    radar: computeRadar(blueprint),
    radarDisplay: computeRadarDisplay(computeRadar(blueprint)),
    aspects,
  };
}
