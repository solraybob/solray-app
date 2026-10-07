// Birth times on a night the clocks changed (C5).
//
// When the clocks go back, one hour of local time happens twice, so a birth
// time inside it names two different moments. When they go forward, one
// hour never happens at all. The backend answers registration and
// PATCH /users/birth with:
//   400 {"code": "birth_time_ambiguous", "message", "options": [
//        {"fold": "first", "utc_offset"}, {"fold": "second", "utc_offset"}]}
//   400 {"code": "birth_time_nonexistent", "message"}
// For an ambiguous time the member chooses which of the two it was, and the
// same request is sent again with birth_time_fold: "first" | "second"
// ("first" is the earlier of the two). A nonexistent time is sent back to
// the member to correct.

export type BirthFold = "first" | "second";

export const BIRTH_TIME_AMBIGUOUS = "birth_time_ambiguous";
export const BIRTH_TIME_NONEXISTENT = "birth_time_nonexistent";

export interface FoldChoice {
  fold: BirthFold;
  /** The UTC offset of that occurrence, ready to show ("UTC+2"). */
  offset: string;
}

export type BirthTimeIssue =
  | { kind: "ambiguous"; options: FoldChoice[] }
  | { kind: "nonexistent" };

/**
 * Shows a UTC offset the way a person reads it. Accepts what a backend is
 * likely to send: "+01:00", "+0100", "UTC+1", or a number of hours,
 * minutes or seconds.
 */
export function formatUtcOffset(v: unknown): string {
  let minutes: number | null = null;
  if (typeof v === "number" && isFinite(v)) {
    const a = Math.abs(v);
    minutes = a <= 14 ? v * 60 : a <= 14 * 60 ? v : v / 60;
  } else if (typeof v === "string") {
    const m = v.trim().match(/^(?:UTC|GMT)?\s*([+-−])?\s*(\d{1,2})(?::?(\d{2}))?(?::?\d{2})?$/i);
    if (m) {
      const sign = m[1] === "-" || m[1] === "−" ? -1 : 1;
      minutes = sign * (parseInt(m[2], 10) * 60 + (m[3] ? parseInt(m[3], 10) : 0));
    } else if (v.trim()) {
      return v.trim();
    }
  }
  if (minutes === null) return "";
  minutes = Math.round(minutes);
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const mm = abs % 60;
  return `UTC${sign}${h}${mm ? `:${String(mm).padStart(2, "0")}` : ""}`;
}

function detailOf(err: unknown): { status: number | null; detail: unknown } {
  if (!err || typeof err !== "object") return { status: null, detail: null };
  const e = err as { status?: unknown; detail?: unknown };
  return { status: typeof e.status === "number" ? e.status : null, detail: e.detail };
}

/** The clock-change problem a failed birth request reports, if any. */
export function birthTimeIssue(err: unknown): BirthTimeIssue | null {
  const { status, detail } = detailOf(err);
  if (status !== 400 || !detail || typeof detail !== "object" || Array.isArray(detail)) return null;
  const d = detail as { code?: unknown; options?: unknown };
  if (d.code === BIRTH_TIME_NONEXISTENT) return { kind: "nonexistent" };
  if (d.code !== BIRTH_TIME_AMBIGUOUS) return null;
  const raw = Array.isArray(d.options) ? d.options : [];
  const options: FoldChoice[] = [];
  for (const fold of ["first", "second"] as const) {
    const o = raw.find((x) => x && typeof x === "object" && (x as { fold?: unknown }).fold === fold) as { utc_offset?: unknown } | undefined;
    options.push({ fold, offset: formatUtcOffset(o?.utc_offset) });
  }
  return { kind: "ambiguous", options };
}

export type BirthRequestOutcome<T> =
  | { status: "ok"; value: T; fold: BirthFold | null }
  | { status: "cancelled" }
  | { status: "nonexistent" };

/**
 * Sends a birth request; if the birth time happened twice, asks the member
 * which one (via `choose`, null when they back out) and sends the same
 * request again with that fold. Any other error is thrown as is.
 */
export async function sendBirthRequest<T>(
  send: (fold: BirthFold | null) => Promise<T>,
  choose: (options: FoldChoice[]) => Promise<BirthFold | null>,
): Promise<BirthRequestOutcome<T>> {
  try {
    return { status: "ok", value: await send(null), fold: null };
  } catch (err) {
    const issue = birthTimeIssue(err);
    if (!issue) throw err;
    if (issue.kind === "nonexistent") return { status: "nonexistent" };
    const fold = await choose(issue.options);
    if (!fold) return { status: "cancelled" };
    try {
      return { status: "ok", value: await send(fold), fold };
    } catch (again) {
      // Asked once; a second clock-change answer is not asked again.
      const second = birthTimeIssue(again);
      if (second?.kind === "nonexistent") return { status: "nonexistent" };
      throw again;
    }
  }
}
