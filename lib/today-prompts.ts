/**
 * lib/today-prompts.ts — Generate three tappable Chat prompts from today's forecast.
 *
 * The empty Chat state was previously a pulsing logo and the Higher
 * Self's greeting, then a blank input. Codex's UX strategy memo
 * pointed out that the highest-leverage move on the first-session
 * loop is to give the user an immediate next-thing to ask, pulled
 * from what they JUST read on Today. This module computes those
 * three prompts deterministically (no LLM call) from the forecast
 * data already cached in localStorage.
 *
 * The prompts are designed to be specific enough that they could
 * only have been generated for THIS user on THIS day:
 *   1. Anchored on the dominant transit ("Tell me more about
 *      Saturn squaring my Sun today")
 *   2. Anchored on the highest or lowest energy reading
 *      ("Why is my mental energy so low today?")
 *   3. Anchored on the day_title or reading first sentence
 *      ("What does 'let the wave pass' actually mean for me right now?")
 *
 * Each returned prompt has a `topic` (used as the chat session
 * label) and a `question` (the actual seeded message).
 */

import { fill } from "./i18n";
import { tx } from "./astro-i18n";
import { accountKey } from "./account-session";

/** Translator from useT(), so the prompts follow the member's language. */
type Translate = (key: string) => string;

export interface ChatPrompt {
  topic: string;
  question: string;
}

interface TodayForecast {
  day_title?: string;
  reading?: string;
  tags?: { astrology?: string; human_design?: string; gene_keys?: string };
  energy?: { mental?: number; emotional?: number; physical?: number; intuitive?: number };
  dominant_transit?: string;
  hd_gate_today?: { gate?: number; shadow?: string; gift?: string };
}


/**
 * Pick the energy bar most worth asking about. Heuristic:
 * - If any value is <= 4, pick that one (low ones are usually more
 *   pressing than high ones).
 * - Else pick the highest.
 * - Tie-break by category preference: emotional > intuitive > physical > mental.
 */
function pickEnergyFocus(energy: TodayForecast["energy"]): { key: string; value: number } | null {
  if (!energy) return null;
  const entries = Object.entries(energy)
    .filter(([, v]) => typeof v === "number") as [string, number][];
  if (entries.length === 0) return null;
  const lows = entries.filter(([, v]) => v <= 4);
  const pool = lows.length > 0 ? lows : entries;
  pool.sort((a, b) => {
    if (lows.length > 0) return a[1] - b[1]; // lowest first
    return b[1] - a[1]; // highest first
  });
  return { key: pool[0][0], value: pool[0][1] };
}

/**
 * Try to extract a single quoted phrase from the day_title that
 * could become a "what does X actually mean" question. Falls back
 * to using the whole title when no clean phrase is available.
 */
function extractTitlePhrase(dayTitle: string): string {
  const trimmed = dayTitle.trim().replace(/[.!?]+$/, "");
  // If the title is short enough, use the whole thing.
  if (trimmed.length <= 36) return trimmed.toLowerCase();
  // Otherwise take the first clause (up to comma or to 36 chars).
  const comma = trimmed.indexOf(",");
  if (comma > 0 && comma < 36) return trimmed.slice(0, comma).toLowerCase();
  return trimmed.slice(0, 36).toLowerCase().trim();
}

/**
 * Normalize a transit string ("Saturn opposition natal Sun") into a
 * clean phrase fit for a question. Best-effort; falls back to using
 * the raw string when parsing fails.
 */
// The backend writes aspects as verbs or adjectives ("conjunct", "squares",
// "opposite"); the translation table and the phrase ("Saturn in square to
// my Sun") use the aspect's name. Every spelling maps to that name.
const ASPECT_NAMES: Record<string, string> = {
  conjunct: "Conjunction", conjuncts: "Conjunction", conjunction: "Conjunction", conjoins: "Conjunction", conjoining: "Conjunction",
  opposite: "Opposition", opposes: "Opposition", oppose: "Opposition", opposing: "Opposition", opposition: "Opposition",
  square: "Square", squares: "Square", squaring: "Square",
  trine: "Trine", trines: "Trine", trining: "Trine",
  sextile: "Sextile", sextiles: "Sextile", sextiling: "Sextile",
  quincunx: "Quincunx", inconjunct: "Quincunx",
  "semi-sextile": "Semi-Sextile", semisextile: "Semi-Sextile",
  "semi-square": "Semi-Square", semisquare: "Semi-Square",
  sesquiquadrate: "Sesquiquadrate", sesquisquare: "Sesquiquadrate",
  quintile: "Quintile", "bi-quintile": "Bi-Quintile", biquintile: "Bi-Quintile",
};

/** The aspect's canonical name ("Conjunction") for any backend spelling, or null. */
export function aspectName(word: string): string | null {
  return ASPECT_NAMES[word.trim().toLowerCase()] ?? null;
}

function normalizeTransit(raw: string, t: Translate, lang: string): string {
  const cleaned = raw.replace(/\?+/g, "").trim();
  // Parse "<planet> <aspect> natal <natal_planet>" or similar
  const m = cleaned.match(/^([A-Z][a-z]+)\s+([a-z-]+)\s+natal\s+([A-Z][a-z]+)/i);
  if (m) {
    const [, planet, aspect, natal] = m;
    const name = aspectName(aspect);
    // An aspect word we do not know is not dressed up as a phrase that
    // would leave it untranslated: the raw line is used instead.
    if (name) {
      const term = (v: string) => (lang === "en" ? v : tx(v, lang));
      return fill(t("prompts.tp_transit_phrase"), {
        planet: term(planet),
        aspect: term(name).toLowerCase(),
        natal: term(natal),
      });
    }
  }
  return cleaned.toLowerCase();
}

/**
 * Generate up to three tappable chat prompts from a cached Today
 * forecast. Returns an empty array when the forecast is missing or
 * too sparse to produce useful prompts.
 */
export function buildTodayPrompts(forecast: TodayForecast | null | undefined, t: Translate, lang: string): ChatPrompt[] {
  if (!forecast) return [];
  const out: ChatPrompt[] = [];

  // 1. Dominant transit
  if (forecast.dominant_transit) {
    const phrase = normalizeTransit(forecast.dominant_transit, t, lang);
    out.push({
      topic: t("prompts.tp_transit_topic"),
      question: fill(t("prompts.tp_transit"), { phrase }),
    });
  }

  // 2. Energy focus
  const focus = pickEnergyFocus(forecast.energy);
  if (focus) {
    const labelKey = `prompts.tp_energy_${focus.key}`;
    const translated = t(labelKey);
    const label = translated === labelKey ? focus.key : translated;
    out.push({
      topic: label.charAt(0).toUpperCase() + label.slice(1),
      question: fill(t(focus.value <= 4 ? "prompts.tp_energy_low" : "prompts.tp_energy_high"), { label, value: focus.value }),
    });
  }

  // 3. Day title or reading
  if (forecast.day_title) {
    const phrase = extractTitlePhrase(forecast.day_title);
    out.push({
      topic: t("prompts.tp_reading_topic"),
      question: fill(t("prompts.tp_reading_phrase"), { phrase }),
    });
  } else if (forecast.reading) {
    // Fall back to the first sentence of the reading
    const first = forecast.reading.split(/[.!?]/)[0]?.trim();
    if (first && first.length > 10) {
      out.push({
        topic: t("prompts.tp_reading_topic"),
        question: fill(t("prompts.tp_reading_more"), { first }),
      });
    }
  }

  return out.slice(0, 3);
}

/**
 * Read today's cached forecast from localStorage. Mirrors the cache
 * key Today writes to. Returns null if no cache exists or parse fails.
 */
export function readCachedForecast(): TodayForecast | null {
  if (typeof window === "undefined") return null;
  try {
    const d = new Date();
    const key = `solray_forecast_${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const raw = localStorage.getItem(accountKey(key));
    if (!raw) return null;
    return JSON.parse(raw) as TodayForecast;
  } catch {
    return null;
  }
}
