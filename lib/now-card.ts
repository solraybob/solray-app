// The Now card's words (Batch I experiment).
//
// Today's first card shows the day's title and the opening of the full
// reading. The plain-language version (card_title / card_body from
// GET /forecast/today/plain, no chart vocabulary) is being tried in
// /admin/now-card side by side with it before anything changes for members.
//
// Switching members to the plain card later is this one line. With it on,
// Today fetches /forecast/today/plain after the reading is on screen and
// shows the plain words when they arrive; until then, and whenever the plain
// card is missing or was rejected, the card keeps today's words. "Go deeper"
// always hands the Oracle the FULL reading either way.
export const PLAIN_NOW_CARD_FOR_MEMBERS = false;

export type PlainNowCardStatus = "ok" | "no_reading" | "pending" | "rejected" | "unavailable";

export interface PlainNowCard {
  status: PlainNowCardStatus;
  date: string;
  language: string;
  card_title: string | null;
  card_body: string | null;
  cached?: boolean;
  source?: { day_title: string; language: string };
}

export const NOW_CARD_BODY_MAX = 220;

/** The card carries the opening of the reading, not all of it; "Go deeper"
 *  is what hands the whole thing to the Oracle. */
export function firstLines(reading?: string): string {
  if (!reading) return "";
  const first = reading.split(/\n\n+/)[0].trim();
  if (first.length <= NOW_CARD_BODY_MAX) return first;
  const cut = first.slice(0, NOW_CARD_BODY_MAX);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf(", "));
  return (stop > 120 ? cut.slice(0, stop + 1) : cut.trimEnd()) + (stop > 120 ? "" : "…");
}

/** A plain card that can be shown: status ok and both fields non-empty. */
export function usablePlainCard(p: PlainNowCard | null | undefined): p is PlainNowCard & { card_title: string; card_body: string } {
  return !!p && p.status === "ok"
    && typeof p.card_title === "string" && p.card_title.trim().length > 0
    && typeof p.card_body === "string" && p.card_body.trim().length > 0;
}

/** Title and body for the Now card: the plain words when the flag is on and
 *  a usable plain card is here, otherwise today's title and the reading's
 *  opening, exactly as members see it now. */
export function nowCardContent(
  forecast: { day_title: string; reading: string },
  plain: PlainNowCard | null | undefined,
  plainEnabled: boolean = PLAIN_NOW_CARD_FOR_MEMBERS,
): { title: string; body: string; plain: boolean } {
  if (plainEnabled && usablePlainCard(plain)) {
    return { title: plain.card_title.trim(), body: plain.card_body.trim(), plain: true };
  }
  return { title: forecast.day_title, body: firstLines(forecast.reading), plain: false };
}
