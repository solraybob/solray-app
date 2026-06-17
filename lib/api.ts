// Trim defensively. The Vercel env var got saved with a trailing newline,
// which made fetches fail with "Failed to fetch" because the resulting URL
// had a literal \n inside it. trim() strips any whitespace.
import { clearUserScopedCaches } from "./local-cache";

const API_URL = ((process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").trim()).trim();

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
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

export async function apiFetch(
  path: string,
  options: RequestInit = {},
  token?: string | null
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

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    // 401 = dead session (expired or invalid token). Previously the app kept
    // the stale token in storage, so /today bounced the user to /login and
    // /login bounced them back to /today (it still saw a token): an infinite
    // loop that parked expired users on a broken screen. Treat a 401 as a
    // clean logout: wipe the dead session and send them to login, where there
    // is now nothing to bounce back with. Centralized here so it covers every
    // screen, not just /today.
    if (res.status === 401 && typeof window !== "undefined") {
      try {
        localStorage.removeItem("solray_token");
        localStorage.removeItem("solray_user");
        // Wipe the full per-user cache namespace, not just forecast/blueprint,
        // so a dead session never leaves another account's cycles, avatar,
        // astrocartography, chat, etc. readable. Shared with the login path.
        clearUserScopedCaches();
      } catch (_) { /* ignore storage errors */ }
      if (!window.location.pathname.startsWith("/login")) {
        window.location.replace("/login?expired=1");
      }
    }
    const err = await res.json().catch(() => ({ detail: "Request failed" }));
    throw new ApiError(err.detail || `HTTP ${res.status}`, res.status);
  }

  return res.json();
}
