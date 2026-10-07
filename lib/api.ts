// Trim defensively. The Vercel env var got saved with a trailing newline,
// which made fetches fail with "Failed to fetch" because the resulting URL
// had a literal \n inside it. trim() strips any whitespace.
import { clearUserScopedCaches } from "./local-cache";
import { errorText } from "./errors";
import { bindAccount, bumpAuthGeneration, getAuthGeneration, isCurrentGeneration, runAccountSignOutHooks, StaleAccountError } from "./account-session";
import { AI_CONSENT_REQUIRED_CODE, UNDER_MINIMUM_AGE_CODE, openAiConsentSheet } from "./ai-consent";

const API_URL = ((process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").trim()).trim();

export class ApiError extends Error {
  status: number;
  /** Machine-readable code when the backend sent detail: {code, message},
   *  e.g. "ai_consent_required", "ai_daily_limit". */
  code?: string;
  /** The server's full `detail`, for errors that carry more than a code
   *  (e.g. the two offsets of an ambiguous birth time). */
  detail?: unknown;
  constructor(message: string, status: number, code?: string, detail?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.detail = detail;
    this.name = "ApiError";
  }
}

/** True when the API refused because the member has not agreed to AI processing. */
export function isAiConsentError(e: unknown): boolean {
  return e instanceof ApiError && e.status === 403 && e.code === AI_CONSENT_REQUIRED_CODE;
}

/**
 * True when the API refused because the account is under the minimum age
 * (16): 400 at signup or on a birth-date update, 403 on an AI route or the
 * consent POST. Never a billing problem, never a reason for the paywall.
 */
export function isUnderMinimumAgeError(e: unknown): boolean {
  return e instanceof ApiError && (e.status === 400 || e.status === 403) && e.code === UNDER_MINIMUM_AGE_CODE;
}

/** Pulls `code` out of a FastAPI detail object, if there is one. */
export function detailCode(detail: unknown): string | undefined {
  if (detail && typeof detail === "object" && !Array.isArray(detail)) {
    const c = (detail as Record<string, unknown>).code;
    if (typeof c === "string") return c;
  }
  return undefined;
}

// The user's wall-clock calendar date (YYYY-MM-DD). The backend keys daily
// forecasts by this instead of server-UTC "today", so a user in Sydney gets
// Wednesday's forecast on her Wednesday morning, not Tuesday's. Built from
// local date parts on purpose: toISOString() would convert back to UTC.
function localDateString(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

// Requests in flight, so an update reload can wait until nothing (an
// Oracle reply, a save) would be cut off. A request counts from the moment
// it is sent until its answer has been read in full, not just until the
// headers arrive. Raw fetches outside apiFetch (chat sync, voice, a chart
// calculation, sign-up) are counted through trackRequest.
let inflight = 0;
export function apiBusy(): boolean {
  return inflight > 0;
}

/** Counts `work` (a raw request and the reading of its answer) as busy. */
export async function trackRequest<T>(work: () => Promise<T>): Promise<T> {
  inflight += 1;
  try {
    return await work();
  } finally {
    inflight -= 1;
  }
}

export interface ApiFetchExtra {
  /**
   * A 401 on this call means "wrong password", not "dead session" (the
   * account-deletion re-check). The session is kept; the caller shows it.
   */
  keepSessionOn401?: boolean;
  /**
   * The account generation this request belongs to, when it was decided
   * earlier than the call (a write queued behind others). If that account
   * has signed out by the time the request would start, it is not sent:
   * StaleAccountError. Defaults to the generation at call time.
   */
  generation?: number;
  /**
   * A load the member did not ask for (a screen fetching in the background).
   * A consent 403 on it opens the consent sheet only when the member has not
   * already said "Not now" this session.
   */
  quietConsent?: boolean;
}

export async function apiFetch(
  path: string,
  options: RequestInit = {},
  token?: string | null,
  extra: ApiFetchExtra = {},
) {
  // IANA timezone of the device (e.g. "Europe/Madrid"). The backend stores
  // it lazily and uses it to pre-generate forecasts for the user's LOCAL
  // date, so mornings east of UTC hit the cache instead of regenerating.
  let tz = "";
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch { /* very old browsers: header simply omitted */ }

  // Display mode: "standalone" when the app is opened from the home screen
  // (installed PWA), the iOS standalone flag, or the native shell; "browser"
  // otherwise. The backend stamps home-screen adoption from this on the daily
  // forecast call. Best-effort; omitted if the APIs are unavailable.
  let displayMode = "";
  try {
    const w = window as unknown as { navigator?: { standalone?: boolean }; Capacitor?: unknown };
    const standalone =
      (typeof window !== "undefined" && window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
      w?.navigator?.standalone === true ||
      !!w?.Capacitor;
    displayMode = standalone ? "standalone" : "browser";
  } catch { /* SSR or unsupported: header omitted */ }

  // Native platform: "ios" | "android" only when running inside the Capacitor
  // native shell (NOT a standalone PWA, which is still the web flow). The
  // backend uses this to route native sign-ups through Apple/Play billing
  // instead of granting the web-only 5-day server trial.
  let nativePlatform = "";
  try {
    const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string } })?.Capacitor;
    const p = cap?.getPlatform?.();
    if (p === "ios" || p === "android") nativePlatform = p;
  } catch { /* not native: header omitted */ }

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    "X-Local-Date": localDateString(),
    ...(tz ? { "X-Timezone": tz } : {}),
    ...(displayMode ? { "X-Display-Mode": displayMode } : {}),
    ...(nativePlatform ? { "X-Platform": nativePlatform } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  // Requests made with a token belong to the account that was signed in
  // when they started. If the account changes before the answer arrives,
  // the answer is dropped (StaleAccountError) so it can never be written
  // into the next account's screens or caches, and its 401 can never sign
  // the next account out.
  const startedGen = typeof extra.generation === "number" ? extra.generation : getAuthGeneration();
  const accountBound = !!token;
  if (accountBound && !isCurrentGeneration(startedGen)) {
    throw new StaleAccountError();
  }

  inflight += 1;
  try {
    return await finishApiFetch(path, options, headers, startedGen, accountBound, extra, token ?? null);
  } finally {
    inflight -= 1;
  }
}

async function finishApiFetch(
  path: string,
  options: RequestInit,
  headers: HeadersInit,
  startedGen: number,
  accountBound: boolean,
  extra: ApiFetchExtra,
  token: string | null,
) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  if (accountBound && !isCurrentGeneration(startedGen)) {
    throw new StaleAccountError();
  }

  if (!res.ok) {
    // The generation this error belongs to. The handled 401 below ends the
    // session itself and moves the generation on purpose; its caller still
    // gets the 401 (not a stale-account drop).
    let ownGen = startedGen;
    // 401 = dead session (expired or invalid token). Previously the app kept
    // the stale token in storage, so /today bounced the user to /login and
    // /login bounced them back to /today (it still saw a token): an infinite
    // loop that parked expired users on a broken screen. Treat a 401 as a
    // clean logout: wipe the dead session and send them to login, where there
    // is now nothing to bounce back with. Centralized here so it covers every
    // screen, not just /today.
    if (res.status === 401 && accountBound && !extra.keepSessionOn401 && typeof window !== "undefined") {
      // Session-end work (native push release) runs before storage is wiped.
      runAccountSignOutHooks(token);
      try {
        localStorage.removeItem("solray_token");
        localStorage.removeItem("solray_user");
        // Wipe the full per-user cache namespace, not just forecast/blueprint,
        // so a dead session never leaves another account's cycles, avatar,
        // astrocartography, chat, etc. readable. Shared with the login path.
        clearUserScopedCaches();
      } catch (_) { /* ignore storage errors */ }
      ownGen = bumpAuthGeneration();
      // Signed out: this tab no longer writes into any member's caches.
      bindAccount(null);
      if (!window.location.pathname.startsWith("/login")) {
        window.location.replace("/login?expired=1");
      }
    }
    const err = await res.json().catch(() => ({ detail: "Request failed" }));
    // The account may have changed while the body was decoding: then this
    // error belongs to nobody here (no consent sheet, no failure handling).
    if (accountBound && !isCurrentGeneration(ownGen)) {
      throw new StaleAccountError();
    }
    const code = detailCode(err?.detail);
    // Third-party AI consent missing: open the consent sheet wherever the
    // member is. The caller still gets the error and keeps its own state.
    if (res.status === 403 && code === AI_CONSENT_REQUIRED_CODE) {
      openAiConsentSheet({ quiet: extra.quietConsent === true });
    }
    throw new ApiError(errorText(err?.detail, `HTTP ${res.status}`), res.status, code, err?.detail);
  }

  const data = await res.json();
  if (accountBound && !isCurrentGeneration(startedGen)) {
    throw new StaleAccountError();
  }
  return data;
}
