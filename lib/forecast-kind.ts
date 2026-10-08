// What a /forecast/today answer (or a cached copy of one) is, shared by
// Today and the widget so they can never disagree about it (Codex out20-5):
//  - "complete": the day's reading is all there; the only kind ever shown
//    as the reading and the only kind ever cached;
//  - "consent": the member has not agreed to AI processing, so the server
//    sent the sky without the reading (ai_consent_required);
//  - "pending": the reading is not written yet (or a cached copy is partial).

export type ForecastKind = "complete" | "consent" | "pending";

export function forecastKind(data: unknown): ForecastKind {
  if (!data || typeof data !== "object") return "pending";
  const d = data as Record<string, unknown>;
  if (d.ai_consent_required === true || d._consent === true) return "consent";
  if (d._pending === true) return "pending";
  if (d.day_title && d.reading && d.tags && d.energy) return "complete";
  return "pending";
}

/** The member's local calendar day ("YYYY-MM-DD"): the day a forecast is
 *  for, and its cache key. Not toISOString (UTC). */
export function localDayKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
