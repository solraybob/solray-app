"use client";

/**
 * Native push notification registration for the Capacitor wrapper.
 *
 * This file is a NO-OP when running on the web. It only kicks in when
 * Solray is loaded inside the Capacitor native shell on iOS or Android.
 *
 * Flow:
 *   1. App detects it's running inside Capacitor (`Capacitor.isNativePlatform()`).
 *   2. Requests the system notification permission (iOS shows a prompt;
 *      Android 13+ shows a prompt; older Android grants implicitly).
 *   3. Calls register() which triggers APNs (iOS) / FCM (Android) and
 *      gives us back the device token.
 *   4. Sends the token to the backend at POST /push/native-subscribe.
 *      The backend stores it against the authenticated user and uses
 *      it to send pushes via APNs / FCM later.
 *
 * Where this is called: see app/layout.tsx (or a dedicated client effect)
 * after the user logs in. We don't auto-register before login because we
 * have nothing useful to push to an anonymous user, and the prompt would
 * burn the user's "allow notifications" permission with no payoff.
 */

import { apiFetch } from "./api";

// User-scoped key. Codex audit P1.4: the previous global flag meant a
// second user signing in on the same device skipped registration entirely
// because the first user's "registered=1" flag was still in localStorage,
// so they never got pushes. Scope the flag by user id (we'll hash the
// auth token at the call site so we don't store anything user-identifying).
const NATIVE_PUSH_REGISTERED_KEY_BASE = "solray_native_push_registered";

function pushKey(userIdHash: string): string {
  return `${NATIVE_PUSH_REGISTERED_KEY_BASE}:${userIdHash}`;
}

/**
 * Clear the registered-flag for ALL users on this device. Called on logout
 * so the next signed-in user actually re-registers their device against
 * APNs and the backend records THEIR token, not the previous user's.
 */
export function clearNativePushRegistration(): void {
  if (typeof window === "undefined") return;
  try {
    // Sweep every key matching our prefix; cheap because we have under
    // a handful of keys.
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(NATIVE_PUSH_REGISTERED_KEY_BASE)) toRemove.push(k);
    }
    toRemove.forEach((k) => localStorage.removeItem(k));
  } catch { /* localStorage may be unavailable */ }
}

interface CapacitorWindow {
  Capacitor?: {
    isNativePlatform: () => boolean;
    getPlatform: () => "web" | "ios" | "android";
  };
}

export function isRunningInCapacitor(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as CapacitorWindow;
  return Boolean(w.Capacitor?.isNativePlatform?.());
}

/**
 * Returns the Capacitor platform: "ios", "android", or "web".
 * Used by Play Billing / IAP wiring to gate the right CTA per platform.
 */
export function getNativePlatform(): "web" | "ios" | "android" {
  if (typeof window === "undefined") return "web";
  const w = window as unknown as CapacitorWindow;
  return w.Capacitor?.getPlatform?.() ?? "web";
}

/**
 * Lightweight, non-cryptographic hash. Used only to scope a localStorage
 * key per token so we don't write the raw token into storage. Collisions
 * are acceptable here; this is a registration-flag, not authentication.
 */
function shortHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return (h >>> 0).toString(36);
}

/**
 * Idempotent: safe to call multiple times. Once a token has been
 * registered for this device + user pair, we skip re-registration to
 * avoid spamming the backend on every app launch.
 */
export async function registerNativePush(token: string): Promise<void> {
  if (!isRunningInCapacitor()) return;
  if (typeof window === "undefined") return;

  // Already registered this user on this device? Skip the round trip.
  // Per-user scoping prevents the second user on a shared iPhone from
  // silently failing because the first user's flag was still set.
  const userKey = pushKey(shortHash(token));
  try {
    if (localStorage.getItem(userKey) === "1") return;
  } catch { /* localStorage may be unavailable */ }

  try {
    // Dynamic import so the web bundle doesn't eat a Capacitor dependency it
    // doesn't need. Only resolves on native platforms.
    const { PushNotifications } = await import("@capacitor/push-notifications");

    // 1. Permission. iOS will show a one-time prompt the FIRST time we ask;
    //    after that the result is cached at the OS level and we get the
    //    same answer back without bothering the user.
    const perm = await PushNotifications.requestPermissions();
    if (perm.receive !== "granted") {
      // Soft fail. The user can enable it later from settings.
      return;
    }

    // 2. Attach the registration listeners FIRST, then call register().
    //    The previous version of this function awaited register() before
    //    adding listeners, but Capacitor's `registration` event can fire
    //    immediately on platforms where the OS already has the APNs/FCM
    //    token cached. If the listener is registered after that fires,
    //    the event is missed, the promise waits the full 10s timeout,
    //    and the backend never receives the device token. Caught by
    //    Codex audit P2.5.
    const deviceToken = await new Promise<string | null>((resolve) => {
      const timeout = setTimeout(() => resolve(null), 10000);

      PushNotifications.addListener("registration", (t) => {
        clearTimeout(timeout);
        resolve(t.value);
      });

      PushNotifications.addListener("registrationError", () => {
        clearTimeout(timeout);
        resolve(null);
      });

      // Now trigger APNs/FCM. The listeners above will catch whichever
      // event fires, even if it fires synchronously inside register().
      PushNotifications.register().catch(() => {
        clearTimeout(timeout);
        resolve(null);
      });
    });

    if (!deviceToken) return;

    // 4. Send the token to the backend. Backend has a POST /push/native-subscribe
    //    endpoint that maps device_token + platform + user.
    const w = window as unknown as CapacitorWindow;
    const platform = w.Capacitor?.getPlatform() ?? "unknown";

    await apiFetch(
      "/push/native-subscribe",
      {
        method: "POST",
        body: JSON.stringify({
          device_token: deviceToken,
          platform,                                  // 'ios' | 'android'
          app_version: process.env.NEXT_PUBLIC_BUILD_ID || null,
        }),
      },
      token
    );

    try {
      localStorage.setItem(userKey, "1");
    } catch { /* ignore */ }
  } catch (err) {
    // Don't crash the app if the push setup hits an edge case (missing
    // entitlement, simulator without push support, network blip).
    // Worst case: the user just doesn't get pushes this session; we
    // retry on the next cold launch.
    console.warn("[native-push] registration failed", err);
  }
}

/**
 * Listen for incoming push tap actions so we can route the user
 * to the right place in the app (today, chat, etc.).
 */
export async function attachNativePushHandlers(): Promise<void> {
  if (!isRunningInCapacitor()) return;
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");

    PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      // The push payload may carry a `route` field telling us where to
      // send the user. Default is /today (the morning forecast) since
      // that's what most pushes will be about.
      const route = (action.notification.data?.route as string | undefined) || "/today";
      try {
        // Use a hard navigation; this handler runs outside of React's
        // router context and pushState alone can leave the app in a
        // half-loaded state.
        window.location.assign(route);
      } catch {
        /* ignore */
      }
    });
  } catch {
    /* ignore */
  }
}
