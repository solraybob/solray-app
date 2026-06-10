// Trim defensively. The Vercel env var got saved with a trailing newline,
// which made fetches fail with "Failed to fetch" because the resulting URL
// had a literal \n inside it. trim() strips any whitespace.
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

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    "X-Local-Date": localDateString(),
    ...(tz ? { "X-Timezone": tz } : {}),
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
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const k = localStorage.key(i);
          if (k && (k.startsWith("solray_forecast") || k.startsWith("solray_blueprint"))) {
            localStorage.removeItem(k);
          }
        }
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
