"use client";

/**
 * lib/analytics.ts — privacy-respecting analytics client.
 *
 * What this DOES track:
 *   - Funnel events (signup steps, subscribe taps, etc.)
 *   - Feature usage (chat opened, soul invite sent)
 *   - Subscription state transitions
 *
 * What this NEVER tracks:
 *   - Chat content
 *   - Birth data (already in user record, no need to duplicate)
 *   - Free-text user input of any kind
 *   - Cross-site identifiers, fingerprints, or third-party trackers
 *
 * Privacy controls:
 *   1. localStorage flag `solray_analytics_opt_out=1` short-circuits
 *      every call. The user toggles this from /profile/settings.
 *   2. Backend mirrors the same flag on the User row; even if the
 *      client sends an event, the server drops it when the user has
 *      opted out. Defense in depth.
 *   3. No event is fired without an authenticated token. Anonymous
 *      events are out of scope for v1 — keeps the threat model tight.
 *
 * Reliability:
 *   - track() is fire-and-forget. The user flow is never blocked by an
 *     analytics failure. Network errors are silently swallowed; the
 *     event is just lost (we'd rather lose data than crash the app).
 *   - Session id is generated once per browser session and reused for
 *     every event in that session, so funnel analyses can group events
 *     into sessions without us tracking anything cross-session.
 */

import { apiFetch } from "./api";

// ─────────────────────────────────────────────────────────────────────────────
// Session id — sessionStorage-backed, regenerated on tab close.
// ─────────────────────────────────────────────────────────────────────────────

const SESSION_KEY = "solray_analytics_session";
const OPT_OUT_KEY = "solray_analytics_opt_out";

let cachedSessionId: string | null = null;

function getSessionId(): string {
  if (cachedSessionId) return cachedSessionId;
  if (typeof window === "undefined") {
    // Server-side render (shouldn't happen since this is "use client",
    // but defensive). Generate a one-shot id; never persisted.
    return "ssr-" + Math.random().toString(36).slice(2, 12);
  }
  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) {
      cachedSessionId = existing;
      return existing;
    }
  } catch { /* sessionStorage may be disabled */ }

  const fresh =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `s_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  try {
    sessionStorage.setItem(SESSION_KEY, fresh);
  } catch { /* ignore */ }
  cachedSessionId = fresh;
  return fresh;
}

// ─────────────────────────────────────────────────────────────────────────────
// Opt-out helpers — exported so the settings page can wire the toggle.
// ─────────────────────────────────────────────────────────────────────────────

export function isAnalyticsOptedOut(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(OPT_OUT_KEY) === "1";
  } catch {
    return false;
  }
}

export function setAnalyticsOptedOut(value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (value) localStorage.setItem(OPT_OUT_KEY, "1");
    else localStorage.removeItem(OPT_OUT_KEY);
  } catch { /* ignore */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// Track — the only function the rest of the app calls.
// ─────────────────────────────────────────────────────────────────────────────

interface TrackProps {
  // Permissive on purpose: callers pass small primitives only. There's
  // no enforcement here on the client; the server does its own truncation.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [k: string]: any;
}

export async function track(
  eventName: string,
  props?: TrackProps,
  token?: string | null,
): Promise<void> {
  if (typeof window === "undefined") return;
  if (!token) return;                      // anon events not tracked in v1
  if (isAnalyticsOptedOut()) return;

  // Strict event-name format: snake_case ASCII. Mirrors the server's
  // Pydantic regex — keeps the schema clean and prevents PII-via-event-name.
  if (!/^[a-z0-9_]+$/.test(eventName) || eventName.length > 64) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[analytics] skipping invalid event name: ${eventName}`);
    }
    return;
  }

  try {
    await apiFetch(
      "/analytics/event",
      {
        method: "POST",
        body: JSON.stringify({
          event_name: eventName,
          session_id: getSessionId(),
          props: props ?? null,
        }),
      },
      token,
    );
  } catch {
    // Best effort. Never let an analytics failure surface to the user.
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// trackOnce — for events that should fire only once per browser, ever.
// e.g. today_first_view: fire the first time a user reaches /today, then
// never again. We use localStorage so it's truly per-device-per-user.
// ─────────────────────────────────────────────────────────────────────────────

export async function trackOnce(
  eventName: string,
  props?: TrackProps,
  token?: string | null,
): Promise<void> {
  if (typeof window === "undefined") return;
  const k = `solray_track_once_${eventName}`;
  try {
    if (localStorage.getItem(k) === "1") return;
  } catch { /* ignore */ }
  await track(eventName, props, token);
  try {
    localStorage.setItem(k, "1");
  } catch { /* ignore */ }
}
