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

const NATIVE_PUSH_REGISTERED_KEY = "solray_native_push_registered";

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
 * Idempotent: safe to call multiple times. Once a token has been
 * registered for this device + user pair, we skip re-registration to
 * avoid spamming the backend on every app launch.
 */
export async function registerNativePush(token: string): Promise<void> {
  if (!isRunningInCapacitor()) return;
  if (typeof window === "undefined") return;

  // Already registered this session? Skip the round trip.
  try {
    if (localStorage.getItem(NATIVE_PUSH_REGISTERED_KEY) === "1") return;
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
      localStorage.setItem(NATIVE_PUSH_REGISTERED_KEY, "1");
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
