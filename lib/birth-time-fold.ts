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
//
// utc_offset is a number of hours east of UTC (1.0, 0.0, 5.5, -3.5) and the
// options always come first, then second.
//
// Existing members: GET /users/me carries
//   birth_time_check: {status: "ok" | "ambiguous" | "nonexistent",
//                      fold: "first" | "second" | null,
//                      options: [...same shape...], needs_confirmation: bool}
// Stored charts are never moved by the server. When needs_confirmation is
// true the app asks once (a gentle prompt, and the chooser in Settings) and
// confirms through PATCH /users/birth with birth_time_fold, or, for a
// nonexistent time, asks the member to correct the time.

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

function foldChoices(raw: unknown): FoldChoice[] {
  const list = Array.isArray(raw) ? raw : [];
  const options: FoldChoice[] = [];
  for (const fold of ["first", "second"] as const) {
    const o = list.find((x) => x && typeof x === "object" && (x as { fold?: unknown }).fold === fold) as { utc_offset?: unknown } | undefined;
    options.push({ fold, offset: formatUtcOffset(o?.utc_offset) });
  }
  return options;
}

export interface StoredBirthTimeCheck {
  status: "ok" | "ambiguous" | "nonexistent";
  fold: BirthFold | null;
  options: FoldChoice[];
  needsConfirmation: boolean;
}

/**
 * The saved birth time's clock-change check from a /users/me payload (top
 * level, or under profile). Anything missing or unknown reads as "ok, nothing
 * to ask", so an older server never triggers a prompt.
 */
export function storedBirthTimeCheck(me: unknown): StoredBirthTimeCheck {
  const none: StoredBirthTimeCheck = { status: "ok", fold: null, options: [], needsConfirmation: false };
  const o = (me && typeof me === "object" ? me : {}) as Record<string, unknown>;
  const p = (o.profile && typeof o.profile === "object" ? o.profile : {}) as Record<string, unknown>;
  const raw = (o.birth_time_check ?? p.birth_time_check) as Record<string, unknown> | undefined;
  if (!raw || typeof raw !== "object") return none;
  const status = raw.status === "ambiguous" || raw.status === "nonexistent" ? raw.status : "ok";
  const fold = raw.fold === "first" || raw.fold === "second" ? raw.fold : null;
  if (status === "ok") return { ...none, fold };
  return {
    status,
    fold,
    options: status === "ambiguous" ? foldChoices(raw.options) : [],
    needsConfirmation: raw.needs_confirmation === true,
  };
}

/** The clock-change problem a failed birth request reports, if any. */
export function birthTimeIssue(err: unknown): BirthTimeIssue | null {
  const { status, detail } = detailOf(err);
  if (status !== 400 || !detail || typeof detail !== "object" || Array.isArray(detail)) return null;
  const d = detail as { code?: unknown; options?: unknown };
  if (d.code === BIRTH_TIME_NONEXISTENT) return { kind: "nonexistent" };
  if (d.code !== BIRTH_TIME_AMBIGUOUS) return null;
  return { kind: "ambiguous", options: foldChoices(d.options) };
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
