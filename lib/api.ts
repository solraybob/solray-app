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

export async function apiFetch(
  path: string,
  options: RequestInit = {},
  token?: string | null
) {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
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
