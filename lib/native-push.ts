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
 *   - Logout clears this app's delivered notifications (they may name the
 *     leaving member's forecast) and releases this device's binding on
 *     the backend, and
 *     invalidates any registration in flight (if a bind lands after
 *     logout, it is undone). A release that cannot be confirmed (offline,
 *     backend down) stays pending and is retried, and the install stays
 *     unregistered with the OS meanwhile. See "session" below.
 *   - OS register/unregister calls are serialised across sessions, so a
 *     signed-out member's late registration cleanup always finishes before
 *     the next member registers.
 *   - Registration listeners are removed after every attempt; the tap
 *     handler is attached once and can be detached.
 *   - Android is off until an FCM sender exists on the backend: no prompt,
 *     no registration.
 */

import type { PluginListenerHandle } from "@capacitor/core";
import { apiFetch } from "./api";
import { onAccountSignOut } from "./account-session";

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
    const PushNotifications = await loadPlugin();
    const { receive } = await PushNotifications.checkPermissions();
    if (receive === "granted") return "granted";
    if (receive === "denied") return "denied";
    return "prompt";
  } catch {
    return "unsupported";
  }
}

// ---------------------------------------------------------------- session
//
// Binding records. While a member is signed in, this install keeps the
// device token it bound plus a random release secret chosen once per
// sign-in and sent with every bind (the backend stores only its digest).
// At logout the binding moves to a pending-release list that survives
// relaunch. A pending release is retried (launch, resume, back online)
// until the backend confirms it, and it needs no auth token: the secret
// is the proof. Until every pending release is confirmed this install
// stays unregistered with the OS for remote notifications (logout calls
// unregister), so the signed-out phone cannot show the previous member's
// note even while the backend still holds the old binding.

// The binding this install made for the signed-in member: JSON {t, s}.
// Older builds stored the bare device token here (no secret).
const DEVICE_TOKEN_KEY = "solray_native_push_device";
// Release secret for the current sign-in.
const SESSION_SECRET_KEY = "solray_native_push_secret";
// Bindings released at logout but not yet confirmed by the backend.
const PENDING_RELEASE_KEY = "solray_native_push_pending_release";

export interface PushBinding {
  t: string;
  s: string | null;
}

// Bumped on every logout. A registration that started under an older
// session must not bind (or must undo its bind) once the member is gone.
let sessionEpoch = 0;
let inflight: { authToken: string; epoch: number; promise: Promise<boolean> } | null = null;
let lastSyncAt = 0;
// The bind request on the wire, if any. A release waits for it to settle
// so it cannot reach the backend before the bind it is meant to undo.
let bindRequest: Promise<unknown> | null = null;
let flushing: Promise<boolean> | null = null;

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    if (value === null || value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch { /* storage unavailable */ }
}

function readBinding(): PushBinding | null {
  let raw: string | null = null;
  try { raw = localStorage.getItem(DEVICE_TOKEN_KEY); } catch { return null; }
  if (!raw) return null;
  if (raw.startsWith("{")) {
    try {
      const v = JSON.parse(raw);
      if (v && typeof v.t === "string" && v.t) return { t: v.t, s: typeof v.s === "string" && v.s ? v.s : null };
    } catch { /* fall through */ }
    return null;
  }
  return { t: raw, s: null }; // legacy bare token
}

function writeBinding(b: PushBinding | null): void {
  writeJson(DEVICE_TOKEN_KEY, b);
}

function randomSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** The release secret for this sign-in, created on first use. */
function sessionSecret(): string {
  try {
    const existing = localStorage.getItem(SESSION_SECRET_KEY);
    if (existing && /^[A-Za-z0-9_-]{32,128}$/.test(existing)) return existing;
    const fresh = randomSecret();
    localStorage.setItem(SESSION_SECRET_KEY, fresh);
    return fresh;
  } catch {
    return randomSecret();
  }
}

export function readPendingReleases(): PushBinding[] {
  const v = readJson<unknown>(PENDING_RELEASE_KEY);
  if (!Array.isArray(v)) return [];
  return v.filter((b): b is PushBinding =>
    !!b && typeof b.t === "string" && !!b.t && typeof b.s === "string" && !!b.s);
}

function addPendingRelease(b: PushBinding): void {
  if (!b.s) return;
  const list = readPendingReleases();
  if (!list.some((x) => x.t === b.t && x.s === b.s)) list.push(b);
  writeJson(PENDING_RELEASE_KEY, list);
}

function removePendingRelease(b: PushBinding): void {
  const list = readPendingReleases().filter((x) => !(x.t === b.t && x.s === b.s));
  writeJson(PENDING_RELEASE_KEY, list.length ? list : null);
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

// Legacy bindings (made before release secrets) can only be released with
// the leaving member's auth token, once, at logout. The OS unregistration
// at logout still stops delivery on this phone if that call misses.
async function unbindOnServer(authToken: string, deviceToken: string): Promise<void> {
  try {
    await fetch(`${API_URL}/push/native-unsubscribe`, {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ device_token: deviceToken }),
    });
  } catch { /* best effort, see above */ }
}

type ReleaseOutcome = "done" | "retry";

async function releaseOnServer(b: PushBinding): Promise<ReleaseOutcome> {
  try {
    const res = await fetch(`${API_URL}/push/native-release`, {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device_token: b.t, release_secret: b.s }),
    });
    if (res.ok) {
      const body = await res.json().catch(() => null);
      return body && body.released === true ? "done" : "retry";
    }
    // A request the backend rejects as malformed can never succeed; drop
    // it rather than retry forever. Timeouts, rate limits and 5xx retry.
    if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) return "done";
    return "retry";
  } catch {
    return "retry"; // offline
  }
}

/**
 * Send every pending logout release. Resolves true when none is left.
 * Waits for a bind on the wire first, so a release never overtakes it.
 * Safe to call often (launch, resume, back online); single-flight.
 */
export function flushPendingReleases(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(true);
  if (flushing) return flushing;
  const run = (async () => {
    if (bindRequest) await bindRequest.catch(() => undefined);
    for (const b of readPendingReleases()) {
      if ((await releaseOnServer(b)) === "done") removePendingRelease(b);
    }
    return readPendingReleases().length === 0;
  })();
  const p: Promise<boolean> = run.finally(() => {
    if (flushing === p) flushing = null;
  });
  flushing = p;
  return p;
}

export function hasPendingReleases(): boolean {
  return readPendingReleases().length > 0;
}

// OS registration state is one per install, shared by every session. Each
// register (with any undo it needs) and each unregister runs alone, in the
// order it was asked for. Without this, a previous member's registration
// whose OS callback is still pending could finish and undo itself AFTER the
// next member's registration succeeded, leaving the new member bound on the
// backend but unregistered with the OS. The queue is enqueued synchronously,
// so a logout's unregister is always ordered before any later sign-in.
let osQueue: Promise<unknown> = Promise.resolve();

function withOsLock<T>(op: () => Promise<T>): Promise<T> {
  const run = osQueue.then(op, op);
  osQueue = run.catch(() => undefined);
  return run;
}

async function unregisterWithOsNow(): Promise<void> {
  if (!isNativePushSupported()) return;
  try {
    const PushNotifications = await loadPlugin();
    await PushNotifications.unregister();
  } catch { /* plugin missing or not registered */ }
}

/** Stop OS-level delivery to this install (no network needed). */
function unregisterWithOs(): Promise<void> {
  return withOsLock(unregisterWithOsNow);
}

/**
 * Remove this app's notifications from Notification Center, so a note
 * written for the member who is leaving is not left on the phone for the
 * next person to read. Runs at once, outside the OS queue.
 */
async function clearDeliveredNotifications(): Promise<void> {
  if (!isNativePushSupported()) return;
  try {
    const PushNotifications = await loadPlugin();
    await PushNotifications.removeAllDeliveredNotifications();
  } catch { /* plugin missing */ }
}

/**
 * Logout: release this device's push binding for the member who is
 * leaving, and cancel any registration in flight. Call BEFORE the auth
 * token is discarded. Safe on the web.
 *
 * The binding is queued as a pending release (kept until the backend
 * confirms it) and the install is unregistered with the OS at once, so a
 * logout while offline or during a backend outage cannot leave the
 * signed-out phone receiving the previous member's notes.
 */
export function releaseNativePush(authToken: string | null): void {
  sessionEpoch += 1;
  inflight = null;
  lastSyncAt = 0;
  if (typeof window === "undefined") return;
  sweepLegacyFlags();
  const binding = readBinding();
  writeBinding(null);
  try { localStorage.removeItem(SESSION_SECRET_KEY); } catch { /* ignore */ }
  if (!isRunningInCapacitor()) return;
  if (binding?.s) addPendingRelease(binding);
  else if (binding && authToken) void unbindOnServer(authToken, binding.t);
  void clearDeliveredNotifications();
  void unregisterWithOs();
  void flushPendingReleases();
}

// A dead session wiped by a 401 is a sign-out too: release the binding.
onAccountSignOut(releaseNativePush);

// ----------------------------------------------------------- registration

type PushPlugin = typeof import("@capacitor/push-notifications").PushNotifications;

let pluginOverride: PushPlugin | null = null;

async function loadPlugin(): Promise<PushPlugin> {
  if (pluginOverride) return pluginOverride;
  const { PushNotifications } = await import("@capacitor/push-notifications");
  return PushNotifications;
}

/** Tests only: stand in for the native plugin. */
export function __setPushPluginForTests(p: unknown): void {
  pluginOverride = p as PushPlugin | null;
}

/** Ask the OS for the current device token. Listeners are always removed. */
async function obtainDeviceToken(): Promise<string | null> {
  const PushNotifications = await loadPlugin();
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

async function registerAndBind(authToken: string, epoch: number): Promise<boolean> {
  // A previous member's release must be confirmed before this install
  // registers with the OS again; until then it stays silent.
  if (!(await flushPendingReleases())) return false;
  if (epoch !== sessionEpoch) return false;

  // Register with the OS under the OS lock, and undo it inside the same
  // turn if the member logged out meanwhile, so the next member's
  // registration cannot start until this one is fully settled.
  const deviceToken = await withOsLock(async () => {
    if (epoch !== sessionEpoch) return null;
    const t = await obtainDeviceToken();
    if (epoch !== sessionEpoch) {
      // Logged out while the OS was registering: undo that registration.
      if (t) await unregisterWithOsNow();
      return null;
    }
    return t;
  });
  if (epoch !== sessionEpoch) return false;
  if (!deviceToken) return false;

  // Record the binding BEFORE the request, so a logout while it is on the
  // wire knows what to release, whether or not the backend committed it.
  const binding: PushBinding = { t: deviceToken, s: sessionSecret() };
  const previous = readBinding();
  if (previous && previous.s && previous.t !== deviceToken) addPendingRelease(previous);
  writeBinding(binding);

  const request = apiFetch(
    "/push/native-subscribe",
    {
      method: "POST",
      body: JSON.stringify({
        device_token: deviceToken,
        platform: getNativePlatform(),
        app_version: process.env.NEXT_PUBLIC_BUILD_ID || null,
        release_secret: binding.s,
      }),
    },
    authToken,
  );
  bindRequest = request;
  let res: { subscribed?: unknown } | null = null;
  try {
    res = await request;
  } catch (err) {
    // apiFetch throws StaleAccountError when the member logged out while
    // the bind was on the wire, and network errors can arrive after the
    // backend committed. Either way, if the session ended, release it.
    if (epoch !== sessionEpoch) {
      addPendingRelease(binding);
      void flushPendingReleases();
      return false;
    }
    throw err;
  } finally {
    if (bindRequest === request) bindRequest = null;
  }
  if (epoch !== sessionEpoch) {
    addPendingRelease(binding);
    void flushPendingReleases();
    return false;
  }
  if (!res || res.subscribed !== true) return false;
  if (previous && previous.s && previous.t !== deviceToken) void flushPendingReleases();
  return true;
}

function runRegistration(authToken: string, epoch: number): Promise<boolean> {
  if (epoch !== sessionEpoch) return Promise.resolve(false);
  if (inflight && inflight.authToken === authToken && inflight.epoch === epoch) return inflight.promise;
  const promise: Promise<boolean> = registerAndBind(authToken, epoch)
    .catch((err) => {
      // Missing entitlement, simulator, network blip, 503 from the
      // backend: nothing is cached, so the next launch/resume retries.
      console.warn("[native-push] registration failed", err);
      return false;
    })
    .finally(() => {
      if (inflight && inflight.promise === promise) inflight = null;
    });
  inflight = { authToken, epoch, promise };
  return promise;
}

/**
 * Launch / login / resume: if the member already allowed notifications,
 * bind the current device token. Never shows a permission prompt.
 * `force` skips the resume throttle (used on launch and login).
 */
export async function syncNativePush(authToken: string, force = false): Promise<boolean> {
  if (!authToken || !isNativePushSupported()) return false;
  // The session this sync belongs to, captured before any await: a logout
  // during the permission check must not start a registration for it.
  const epoch = sessionEpoch;
  if (!force && Date.now() - lastSyncAt < RESUME_SYNC_MIN_INTERVAL_MS) return false;
  if ((await getNativePushPermission()) !== "granted") return false;
  if (epoch !== sessionEpoch) return false;
  lastSyncAt = Date.now();
  return runRegistration(authToken, epoch);
}

/**
 * The member said yes on our sheet: show the system prompt, and bind the
 * token if they allow. Returns true when the device is bound.
 */
export async function requestNativePushPermission(authToken: string): Promise<boolean> {
  if (!authToken || !isNativePushSupported()) return false;
  const epoch = sessionEpoch;
  try {
    const PushNotifications = await loadPlugin();
    const perm = await PushNotifications.requestPermissions();
    if (perm.receive !== "granted") return false;
  } catch {
    return false;
  }
  if (epoch !== sessionEpoch) return false;
  lastSyncAt = Date.now();
  return runRegistration(authToken, epoch);
}

// ------------------------------------------------------------ value signal

/** Window event chat fires when an Oracle reply arrives (see the bootstrap). */
export const ORACLE_REPLY_EVENT = "solray:oracle-reply";

/** Window event Today fires once a complete reading is on screen. */
export const READING_SHOWN_EVENT = "solray:reading-shown";

/** Tell the push bootstrap the member just got an Oracle reply. Cheap no-op off-native. */
export function signalOracleReply(): void {
  if (typeof window === "undefined" || !isNativePushSupported()) return;
  try { window.dispatchEvent(new Event(ORACLE_REPLY_EVENT)); } catch { /* ignore */ }
}

/**
 * Tell the push bootstrap a complete Today reading is displayed (not a
 * skeleton, an error or a still-preparing state). Cheap no-op off-native.
 */
export function signalReadingShown(): void {
  if (typeof window === "undefined" || !isNativePushSupported()) return;
  try { window.dispatchEvent(new Event(READING_SHOWN_EVENT)); } catch { /* ignore */ }
}

// ------------------------------------------------------------------- taps

/**
 * Route taps on a delivered push (default /today). Returns a detach
 * function so the caller can clean up.
 */
export async function attachNativePushHandlers(): Promise<() => void> {
  if (!isNativePushSupported()) return () => undefined;
  try {
    const PushNotifications = await loadPlugin();
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
