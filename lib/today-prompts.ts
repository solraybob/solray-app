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

const ENERGY_LABEL: Record<string, string> = {
  mental: "mental clarity",
  emotional: "emotional energy",
  physical: "physical energy",
  intuitive: "intuitive sense",
};

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
function normalizeTransit(raw: string): string {
  const cleaned = raw.replace(/\?+/g, "").trim();
  // Parse "<planet> <aspect> natal <natal_planet>" or similar
  const m = cleaned.match(/^([A-Z][a-z]+)\s+([a-z]+)s?\s+natal\s+([A-Z][a-z]+)/i);
  if (m) {
    const [, planet, aspect, natal] = m;
    return `${planet} ${aspect.toLowerCase()}ing my ${natal}`;
  }
  return cleaned.toLowerCase();
}

/**
 * Generate up to three tappable chat prompts from a cached Today
 * forecast. Returns an empty array when the forecast is missing or
 * too sparse to produce useful prompts.
 */
export function buildTodayPrompts(forecast: TodayForecast | null | undefined): ChatPrompt[] {
  if (!forecast) return [];
  const out: ChatPrompt[] = [];

  // 1. Dominant transit
  if (forecast.dominant_transit) {
    const phrase = normalizeTransit(forecast.dominant_transit);
    out.push({
      topic: "Today's transit",
      question: `What is ${phrase} actually doing to me today?`,
    });
  }

  // 2. Energy focus
  const focus = pickEnergyFocus(forecast.energy);
  if (focus) {
    const label = ENERGY_LABEL[focus.key] || focus.key;
    out.push({
      topic: `${focus.key.charAt(0).toUpperCase() + focus.key.slice(1)} energy`,
      question:
        focus.value <= 4
          ? `My ${label} is at ${focus.value}/10 today. What is underneath that, and what would help?`
          : `My ${label} is at ${focus.value}/10 today. How should I work with this charge?`,
    });
  }

  // 3. Day title or reading
  if (forecast.day_title) {
    const phrase = extractTitlePhrase(forecast.day_title);
    out.push({
      topic: "Today's reading",
      question: `What does "${phrase}" actually mean for me right now?`,
    });
  } else if (forecast.reading) {
    // Fall back to the first sentence of the reading
    const first = forecast.reading.split(/[.!?]/)[0]?.trim();
    if (first && first.length > 10) {
      out.push({
        topic: "Today's reading",
        question: `Can you say more about this: "${first}."`,
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
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as TodayForecast;
  } catch {
    return null;
  }
}
