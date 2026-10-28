import { forecastKind } from "@/lib/forecast-kind";

// The ruling planet colours the day, drawn from the orb rather than from a
// stock photograph. The photographs were storm clouds and star fields behind
// a near-black title, which is how the hero lettering became unreadable; they
// were also six different visual languages on one screen. One wash each, the
// orb's own pigments at a whisper, on the paper the rest of the app is made of.
const PLANET_HERO_WASH: Record<string, string> = {
  sun:     "radial-gradient(ellipse 78% 120% at 50% 0%, rgba(252,180,156,.30), transparent 72%)",
  moon:    "radial-gradient(ellipse 78% 120% at 50% 0%, rgb(var(--rgb-indigo) / .22), transparent 72%)",
  mercury: "radial-gradient(ellipse 78% 120% at 50% 0%, rgba(74,46,158,.20), transparent 72%)",
  venus:   "radial-gradient(ellipse 78% 120% at 50% 0%, rgba(176,46,114,.22), transparent 72%)",
  mars:    "radial-gradient(ellipse 78% 120% at 50% 0%, rgb(var(--rgb-ember) / .24), transparent 72%)",
  jupiter: "radial-gradient(ellipse 78% 120% at 50% 0%, rgba(230,141,94,.24), transparent 72%)",
  saturn:  "radial-gradient(ellipse 78% 120% at 50% 0%, rgba(74,46,158,.16), transparent 72%)",
  uranus:  "radial-gradient(ellipse 78% 120% at 50% 0%, rgb(var(--rgb-amber) / .22), transparent 72%)",
  neptune: "radial-gradient(ellipse 78% 120% at 50% 0%, rgba(74,46,158,.24), transparent 72%)",
  pluto:   "radial-gradient(ellipse 78% 120% at 50% 0%, rgba(176,46,114,.16), transparent 72%)",
  default: "radial-gradient(ellipse 78% 120% at 50% 0%, rgb(var(--rgb-indigo) / .20), transparent 72%)",
};

export interface Planet {
  name: string;
  symbol: string;
  sign: string;
  degree: string;
  retrograde?: boolean;
}

interface EnergyLevels {
  mental: number;
  emotional: number;
  physical: number;
  intuitive: number;
}

export interface LunarEvent {
  type: "New Moon" | "Full Moon";
  sign: string;
  degree: number;
  house: number;
  house_meaning: string;
  date: string;
  days_until: number;
  is_today: boolean;
  note: string;
}

interface TagDetails {
  astrology: string;
  human_design: string;
  gene_keys: string;
}

interface ForecastData {
  day_title: string;
  reading: string;
  tags: {
    astrology: string;
    human_design: string;
    gene_keys: string;
  };
  tag_details?: TagDetails;
  energy: EnergyLevels;
  planets: Planet[];
  morning_greeting?: string;
  lunar_event?: LunarEvent;
  _pending?: false;
}

// Discriminated union for the "AI not ready yet but transits ARE live"
// case. The previous version of this file shipped a hardcoded
// MOCK_FORECAST and showed it whenever the AI fields were missing or
// the network failed. That is fictional content presented as a real
// reading. Removed in May 2026 after a cross-agent review surfaced it.
// The honest pattern is: when AI is pending, show the live planet
// data with explicit "your reading is being written" copy; when the
// network fails entirely, show an error state, never invented copy.
interface PreparingForecast {
  _pending: true;
  planets: Planet[];
  lunar_event?: LunarEvent;
  // The member has not agreed to AI processing: the server sent the sky
  // without the reading (ai_consent_required). Today shows the sky, the
  // cycles and a quiet card that asks for the agreement. Never cached.
  _consent?: true;
}

export type ForecastView = ForecastData | PreparingForecast;

// Extract dominant planet from astrology tag string
function getDominantPlanet(astrologyTag: string): string {
  const planetNames = ["sun", "moon", "mars", "jupiter", "saturn", "mercury", "venus", "uranus", "neptune", "pluto"];
  const lowercaseTag = astrologyTag.toLowerCase();
  for (const planet of planetNames) {
    if (lowercaseTag.includes(planet)) {
      return planet;
    }
  }
  return "sun"; // default
}

export interface DeckCycle {
  transit_planet: string;
  natal_point: string;
  aspect: string;
  phase: "applying" | "separating";
  peak: string;
  title: string;
  summary: string | null;
}

// Unused since 9 Oct 2026 (plain Now card). One line naming the day: the aspect the reading is built on, and where the
// Moon is. This replaces a separate moon card and a separate tag chip.
function skyLine(f: { tags?: { astrology?: string }; planets: Planet[] }, t: (key: string) => string): string {
  const moon = f.planets.find((pl) => pl.name === "Moon");
  const parts = [f.tags?.astrology];
  // In the member's language, like the Sky Now cards ("Luna en Virgo").
  if (moon?.sign) parts.push(`${t("moon.moon_in")} ${t(`signs.${moon.sign.toLowerCase()}`)}`);
  return parts.filter((p) => typeof p === "string" && p.trim()).join("  ·  ");
}

// The wash for the day's ruling planet
function getHeroWash(astrologyTag: string): string {
  const planet = getDominantPlanet(astrologyTag);
  return PLANET_HERO_WASH[planet] || PLANET_HERO_WASH.default;
}

// Dynamic energy note based on value and dimension
function getEnergyNote(label: string, value: number): string {
  const key = label.toLowerCase() as "mental" | "emotional" | "physical" | "intuitive";
  const notes: Record<typeof key, [string, string, string]> = {
    mental: [
      "Low mental clarity. Slow down decisions.",
      "Moderate focus. Work in shorter bursts.",
      "Sharp and focused. Ideal for complex thinking.",
    ],
    emotional: [
      "Emotionally tender. Protect your energy.",
      "Steady. You can handle most things.",
      "Emotionally open. Connection flows easily.",
    ],
    physical: [
      "Low vitality. Rest is productive today.",
      "Average energy. Pace yourself.",
      "Strong physical energy. Move your body.",
    ],
    intuitive: [
      "Intuition quiet. Rely on facts and plans.",
      "Gut feeling available. Listen carefully.",
      "Intuition heightened. Trust your instincts.",
    ],
  };
  const bucket = notes[key] ?? notes.mental;
  if (value <= 4) return bucket[0];
  if (value <= 7) return bucket[1];
  return bucket[2];
}

// Extended palette, aged pigments. Label stays in text.secondary;
// color does the categorizing, not the type.


// Planet card for the cosmic ticker strip.
// Mapped onto the aged-pigment palette, grouped by modern rulership
// pairs so the paired planets share a hue naturally:
//   Sun          → amber-sun   (the hero stays the hero)
//   Moon ~ Uranus → mist        (silvery cool, sudden awakening)
//   Mercury       → pearl       (quick, luminous, mercurial)
//   Venus ~ Neptune → wisteria  (love, dreams, mysticism)
//   Mars  ~ Pluto   → ember     (warrior fire, transformation heat)
//      wait, Pluto is paired with Saturn below, not Mars. See below.
//   Jupiter       → moss        (expansion, growth, abundance)
//   Saturn ~ Pluto → indigo     (structure, depth, dark cool)
export const PLANET_COLORS: Record<string, string> = {
  Sun:     "rgb(var(--rgb-amber))",  // amber-sun, hero
  Moon:    "rgb(var(--rgb-mist))",  // mist
  Mercury: "var(--pearl)",  // pearl
  Venus:   "rgb(var(--rgb-wisteria))",  // wisteria
  Mars:    "rgb(var(--rgb-ember))",  // ember
  Jupiter: "var(--moss)",  // moss
  Saturn:  "rgb(var(--rgb-mist))",  // indigo
  Uranus:  "rgb(var(--rgb-mist))",  // mist (paired with Moon)
  Neptune: "var(--wisteria)",  // wisteria (paired with Venus)
  Pluto:   "rgb(var(--rgb-mist))",  // indigo (paired with Saturn)
};

export const LUNAR_AUTO_OPEN = false;
export const BREAKTHROUGH_AUTO_OPEN = false;
export const SKY_ECHO_AUTO_OPEN = false;

// Symbol lookup, shared between the two extraction paths.
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
};

function extractPlanets(data: any): Planet[] {
  if (data.planets && Array.isArray(data.planets)) {
    return data.planets;
  }
  return Object.entries(data.transits || {})
    .slice(0, 10)
    .map(([name, p]: [string, any]) => ({
      name,
      symbol: PLANET_SYMBOLS[name] || "·",
      sign: p.sign,
      degree: `${Math.floor(p.degree)}°`,
      retrograde: p.retrograde,
    }));
}

// Parse raw forecast API response. Returns the full ForecastData when
// the AI fields are ready; returns a PreparingForecast (live planets
// only, no AI commentary) when the daily reading has not been generated
// yet. Never returns invented content under any circumstance.
export function parseForecastData(data: any): ForecastView {
  const planets = extractPlanets(data);
  // The same reading of an answer as the widget's (lib/forecast-kind).
  const kind = forecastKind(data);
  if (kind === "complete") {
    return {
      ...data,
      planets,
      tag_details: data.tag_details ?? undefined,
      lunar_event: data.lunar_event ?? undefined,
      _pending: false,
    };
  }
  if (kind === "consent") {
    return { _pending: true, _consent: true, planets, lunar_event: data.lunar_event ?? undefined };
  }
  return { _pending: true, planets };
}

export type PendingInsight = { id: string; title: string; body: string; confidence: number };
export type SkyEcho = {
  match: string;
  moon_phase_bucket: string | null;
  moon_sign: string | null;
  sun_sign: string | null;
  days_ago: number | null;
  excerpt: string;
  created_at: string | null;
};

export function localDayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
