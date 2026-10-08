import { apiFetch } from "./api";
import { accountKey, captureAccount } from "./account-session";

const PUSH_ENABLED_KEY = "solray_push_enabled";

/**
 * Check if user has already enabled push notifications
 */
export function isPushEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(accountKey(PUSH_ENABLED_KEY)) === "true";
}

/**
 * Request notification permission and subscribe to push
 */
export async function subscribeToPushNotifications(token: string): Promise<boolean> {
  // The account this belongs to, captured before the permission prompt and
  // the service worker awaits: the subscription is sent and recorded for it
  // or not at all.
  const acct = captureAccount();
  try {
    // Check if the browser supports service workers and push notifications
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      console.warn("Push notifications not supported");
      return false;
    }

    // Request notification permission
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      console.log("Notification permission denied");
      return false;
    }

    // Register/get the service worker
    const registration = await navigator.serviceWorker.ready;

    // Subscribe to push notifications
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      // VAPID public key will be added later, for now just set up the flow
    });

    // Send subscription to backend
    await apiFetch(
      "/push/subscribe",
      {
        method: "POST",
        body: JSON.stringify({
          subscription: subscription.toJSON(),
        }),
      },
      token,
      { generation: acct.generation },
    );
    if (!acct.live) return false;

    // Mark as enabled in localStorage
    localStorage.setItem(accountKey(PUSH_ENABLED_KEY), "true");

    return true;
  } catch (error) {
    console.error("Failed to subscribe to push notifications:", error);
    return false;
  }
}

/**
 * Register the service worker if not already registered
 */
export async function registerServiceWorker(): Promise<boolean> {
  if (typeof window === "undefined") return false;

  try {
    if (!("serviceWorker" in navigator)) {
      console.warn("Service Workers not supported");
      return false;
    }

    const registration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
    });

    console.log("Service Worker registered:", registration);
    return true;
  } catch (error) {
    console.error("Service Worker registration failed:", error);
    return false;
  }
}
