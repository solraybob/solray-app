"use client";

/**
 * Native push notifications for the Capacitor shell.
 *
 * A no-op on the web. Inside the native shell:
 *
 *   - We never ask for notification permission at sign-up. The member is
 *     asked (our own short sheet first, then the system prompt) only after
 *     they have seen value: a Today reading on a later day, or a first
 *     Oracle reply. See components/NativePushBootstrap.tsx.
 *   - When permission is already granted we re-register with the OS on
 *     every launch and on resume (throttled), and bind the CURRENT device
 *     token to the signed-in member. The backend binding is idempotent and
 *     moves a token to its newest owner, so a token change or a second
 *     account on the same phone is always picked up. There is no permanent
 *     "already registered" flag any more.
 *   - A bind only counts when the backend answers {subscribed: true}.
 *     Anything else is a failure and is retried on the next launch/resume.
 *   - Logout releases this device's token on the backend before the
 *     session is discarded, and invalidates any registration in flight
 *     (if a bind lands after logout, it is undone).
 *   - Registration listeners are removed after every attempt; the tap
 *     handler is attached once and can be detached.
 *   - Android is off until an FCM sender exists on the backend: no prompt,
 *     no registration.
 */

import type { PluginListenerHandle } from "@capacitor/core";
import { apiFetch } from "./api";

// The device token this install last bound, so logout can release it.
const DEVICE_TOKEN_KEY = "solray_native_push_device";
// Legacy per-user "registered" flags from the old flow; swept on logout.
const LEGACY_REGISTERED_PREFIX = "solray_native_push_registered";

// Platforms with a working backend sender. Android joins when FCM ships.
const PUSH_PLATFORMS: ReadonlyArray<"ios" | "android"> = ["ios"];

const REGISTRATION_TIMEOUT_MS = 10000;
const RESUME_SYNC_MIN_INTERVAL_MS = 60 * 60 * 1000;

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

/** True only where we can actually deliver a push today (iOS shell). */
export function isNativePushSupported(): boolean {
  if (!isRunningInCapacitor()) return false;
  const p = getNativePlatform();
  return p !== "web" && PUSH_PLATFORMS.includes(p);
}

export type NativePushPermission = "granted" | "denied" | "prompt" | "unsupported";

export async function getNativePushPermission(): Promise<NativePushPermission> {
  if (!isNativePushSupported()) return "unsupported";
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const { receive } = await PushNotifications.checkPermissions();
    if (receive === "granted") return "granted";
    if (receive === "denied") return "denied";
    return "prompt";
  } catch {
    return "unsupported";
  }
}

// ---------------------------------------------------------------- session

// Bumped on every logout. A registration that started under an older
// session must not bind (or must undo its bind) once the member is gone.
let sessionEpoch = 0;
let inflight: { authToken: string; promise: Promise<boolean> } | null = null;
let lastSyncAt = 0;

function readStoredDeviceToken(): string | null {
  try {
    return localStorage.getItem(DEVICE_TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeStoredDeviceToken(deviceToken: string | null): void {
  try {
    if (deviceToken) localStorage.setItem(DEVICE_TOKEN_KEY, deviceToken);
    else localStorage.removeItem(DEVICE_TOKEN_KEY);
  } catch { /* storage unavailable */ }
}

function sweepLegacyFlags(): void {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(LEGACY_REGISTERED_PREFIX)) localStorage.removeItem(k);
    }
  } catch { /* storage unavailable */ }
}

// Plain fetch, not apiFetch: the leaving member's token may already be dead
// (account deletion, expiry), and apiFetch turns a 401 into a redirect to
// /login, which must never hijack the navigation that follows a logout.
const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").trim();

async function unbindOnServer(authToken: string, deviceToken: string): Promise<void> {
  try {
    await fetch(`${API_URL}/push/native-unsubscribe`, {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ device_token: deviceToken }),
    });
  } catch {
    // Best effort. If this misses, the next account to sign in on this
    // phone takes the token over on the backend anyway.
  }
}

/**
 * Logout: release this device's push binding for the member who is
 * leaving, using their still-valid auth token, and cancel any registration
 * in flight. Call BEFORE the auth token is discarded. Safe on the web.
 */
export function releaseNativePush(authToken: string | null): void {
  sessionEpoch += 1;
  inflight = null;
  lastSyncAt = 0;
  if (typeof window === "undefined") return;
  sweepLegacyFlags();
  const deviceToken = readStoredDeviceToken();
  writeStoredDeviceToken(null);
  if (authToken && deviceToken && isRunningInCapacitor()) {
    void unbindOnServer(authToken, deviceToken);
  }
}

// ----------------------------------------------------------- registration

/** Ask the OS for the current device token. Listeners are always removed. */
async function obtainDeviceToken(): Promise<string | null> {
  const { PushNotifications } = await import("@capacitor/push-notifications");
  const handles: PluginListenerHandle[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await new Promise<string | null>((resolve) => {
      let settled = false;
      const finish = (value: string | null) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      timer = setTimeout(() => finish(null), REGISTRATION_TIMEOUT_MS);
      // Listeners first, then register(): the registration event can fire
      // immediately when the OS already has the token cached.
      Promise.all([
        PushNotifications.addListener("registration", (t) => finish(t.value || null)),
        PushNotifications.addListener("registrationError", () => finish(null)),
      ])
        .then((hs) => {
          handles.push(...hs);
          if (settled) return;
          return PushNotifications.register();
        })
        .catch(() => finish(null));
    });
  } finally {
    if (timer) clearTimeout(timer);
    await Promise.all(handles.map((h) => h.remove().catch(() => undefined)));
  }
}

async function registerAndBind(authToken: string): Promise<boolean> {
  const epoch = sessionEpoch;
  const deviceToken = await obtainDeviceToken();
  if (!deviceToken || epoch !== sessionEpoch) return false;

  const res = await apiFetch(
    "/push/native-subscribe",
    {
      method: "POST",
      body: JSON.stringify({
        device_token: deviceToken,
        platform: getNativePlatform(),
        app_version: process.env.NEXT_PUBLIC_BUILD_ID || null,
      }),
    },
    authToken,
  );
  if (!res || res.subscribed !== true) return false;

  if (epoch !== sessionEpoch) {
    // The member logged out while this bind was in flight: undo it.
    await unbindOnServer(authToken, deviceToken);
    return false;
  }
  writeStoredDeviceToken(deviceToken);
  return true;
}

function runRegistration(authToken: string): Promise<boolean> {
  if (inflight && inflight.authToken === authToken) return inflight.promise;
  const promise: Promise<boolean> = registerAndBind(authToken)
    .catch((err) => {
      // Missing entitlement, simulator, network blip, 503 from the
      // backend: nothing is cached, so the next launch/resume retries.
      console.warn("[native-push] registration failed", err);
      return false;
    })
    .finally(() => {
      if (inflight && inflight.promise === promise) inflight = null;
    });
  inflight = { authToken, promise };
  return promise;
}

/**
 * Launch / login / resume: if the member already allowed notifications,
 * bind the current device token. Never shows a permission prompt.
 * `force` skips the resume throttle (used on launch and login).
 */
export async function syncNativePush(authToken: string, force = false): Promise<boolean> {
  if (!authToken || !isNativePushSupported()) return false;
  if (!force && Date.now() - lastSyncAt < RESUME_SYNC_MIN_INTERVAL_MS) return false;
  if ((await getNativePushPermission()) !== "granted") return false;
  lastSyncAt = Date.now();
  return runRegistration(authToken);
}

/**
 * The member said yes on our sheet: show the system prompt, and bind the
 * token if they allow. Returns true when the device is bound.
 */
export async function requestNativePushPermission(authToken: string): Promise<boolean> {
  if (!authToken || !isNativePushSupported()) return false;
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const perm = await PushNotifications.requestPermissions();
    if (perm.receive !== "granted") return false;
  } catch {
    return false;
  }
  lastSyncAt = Date.now();
  return runRegistration(authToken);
}

// ------------------------------------------------------------ value signal

/** Window event chat fires when an Oracle reply arrives (see the bootstrap). */
export const ORACLE_REPLY_EVENT = "solray:oracle-reply";

/** Tell the push bootstrap the member just got an Oracle reply. Cheap no-op off-native. */
export function signalOracleReply(): void {
  if (typeof window === "undefined" || !isNativePushSupported()) return;
  try { window.dispatchEvent(new Event(ORACLE_REPLY_EVENT)); } catch { /* ignore */ }
}

// ------------------------------------------------------------------- taps

/**
 * Route taps on a delivered push (default /today). Returns a detach
 * function so the caller can clean up.
 */
export async function attachNativePushHandlers(): Promise<() => void> {
  if (!isNativePushSupported()) return () => undefined;
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const handle = await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      const raw = action.notification.data?.route;
      // Only in-app paths; never navigate to an absolute URL from a payload.
      const route = typeof raw === "string" && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/today";
      try {
        // Hard navigation: this runs outside React's router context.
        window.location.assign(route);
      } catch { /* ignore */ }
    });
    return () => { void handle.remove().catch(() => undefined); };
  } catch {
    return () => undefined;
  }
}
