"use client";

/**
 * NativePushBootstrap
 *
 * Mounted once inside AuthProvider. Does nothing on the web or on Android
 * (no FCM sender yet). In the iOS shell:
 *
 *   1. Attaches the push-tap handler once (detached on unmount).
 *   2. On launch, login and resume: if the member already allowed
 *      notifications, binds the current device token (syncNativePush).
 *      Never prompts.
 *   3. Asks only after the member has seen value, never at sign-up:
 *        - their first Oracle reply (chat dispatches "solray:oracle-reply"),
 *        - or opening Today on a later day than their first Today.
 *      Once value is seen, a short sheet appears on Today explaining the one
 *      note we send. "Yes" shows the system prompt; "Not now" waits ten
 *      days, and we offer at most three times. If the OS has already been
 *      answered (granted or denied) the sheet never shows.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/i18n";
import {
  attachNativePushHandlers,
  getNativePushPermission,
  isNativePushSupported,
  requestNativePushPermission,
  syncNativePush,
  ORACLE_REPLY_EVENT,
} from "@/lib/native-push";

const VALUE_SEEN_KEY = "solray_push_value_seen";
const FIRST_TODAY_KEY = "solray_push_first_today";
const SOFT_ASK_KEY = "solray_push_soft_ask";

const SOFT_ASK_MAX = 3;
const SOFT_ASK_SNOOZE_MS = 10 * 24 * 60 * 60 * 1000;
const SHOW_DELAY_MS = 2500;

function localDay(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function read(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function write(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* storage unavailable */ }
}

function softAskState(): { count: number; at: number } {
  try {
    const raw = read(SOFT_ASK_KEY);
    if (!raw) return { count: 0, at: 0 };
    const v = JSON.parse(raw);
    return { count: Number(v.count) || 0, at: Number(v.at) || 0 };
  } catch {
    return { count: 0, at: 0 };
  }
}

function softAskAllowed(): boolean {
  const s = softAskState();
  if (s.count >= SOFT_ASK_MAX) return false;
  return !s.at || Date.now() - s.at >= SOFT_ASK_SNOOZE_MS;
}

function recordSoftAsk(): void {
  const s = softAskState();
  write(SOFT_ASK_KEY, JSON.stringify({ count: s.count + 1, at: Date.now() }));
}

export default function NativePushBootstrap() {
  const { token, loading } = useAuth();
  const { t } = useT();
  const pathname = usePathname();
  const [showAsk, setShowAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const tokenRef = useRef<string | null>(null);
  tokenRef.current = token;

  // 1. Tap handler, once.
  useEffect(() => {
    if (!isNativePushSupported()) return;
    let detach: (() => void) | null = null;
    let cancelled = false;
    void attachNativePushHandlers().then((fn) => {
      if (cancelled) fn();
      else detach = fn;
    });
    return () => {
      cancelled = true;
      if (detach) detach();
    };
  }, []);

  // 2. Bind the current device token on launch/login, and on resume.
  useEffect(() => {
    if (loading || !token || !isNativePushSupported()) return;
    void syncNativePush(token, true);
    const onVisible = () => {
      if (document.visibilityState === "visible" && tokenRef.current) {
        void syncNativePush(tokenRef.current);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [token, loading]);

  // 3a. First Oracle reply counts as value.
  useEffect(() => {
    if (!isNativePushSupported()) return;
    const onReply = () => write(VALUE_SEEN_KEY, "1");
    window.addEventListener(ORACLE_REPLY_EVENT, onReply);
    return () => window.removeEventListener(ORACLE_REPLY_EVENT, onReply);
  }, []);

  // 3b. Today on a later day counts as value; the sheet itself only ever
  //     appears on Today, a moment after the reading has had time to load.
  useEffect(() => {
    if (loading || !token || pathname !== "/today" || !isNativePushSupported()) return;
    const today = localDay();
    const first = read(FIRST_TODAY_KEY);
    if (!first) write(FIRST_TODAY_KEY, today);
    else if (first < today) write(VALUE_SEEN_KEY, "1");

    let cancelled = false;
    const timer = setTimeout(async () => {
      if (cancelled || read(VALUE_SEEN_KEY) !== "1" || !softAskAllowed()) return;
      if ((await getNativePushPermission()) !== "prompt") return;
      if (!cancelled) setShowAsk(true);
    }, SHOW_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pathname, token, loading]);

  // Leaving Today or signing out closes the sheet.
  useEffect(() => {
    if (pathname !== "/today" || !token) setShowAsk(false);
  }, [pathname, token]);

  const onYes = useCallback(async () => {
    if (!token) return;
    setBusy(true);
    recordSoftAsk();
    try {
      await requestNativePushPermission(token);
    } finally {
      setBusy(false);
      setShowAsk(false);
    }
  }, [token]);

  const onNotNow = useCallback(() => {
    recordSoftAsk();
    setShowAsk(false);
  }, []);

  if (!showAsk) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-labelledby="push-ask-title">
      <div className="absolute inset-0 bg-forest-deep/80 backdrop-blur-sm" onClick={onNotNow} />
      <div
        className="relative w-full max-w-lg bg-forest-dark border-t border-forest-border rounded-t-3xl px-6 pt-6"
        style={{ paddingBottom: "calc(var(--sab, 0px) + 32px)" }}
      >
        <div className="w-10 h-1 bg-forest-border rounded-full mx-auto mb-6" />
        <h3 id="push-ask-title" className="font-heading text-text-primary" style={{ fontSize: "1.15rem", fontWeight: 700 }}>
          {t("push.native_ask_title")}
        </h3>
        <p className="font-body text-text-secondary text-[16px] mt-2" style={{ lineHeight: 1.5 }}>
          {t("push.native_ask_body")}
        </p>
        <div className="mt-6 space-y-3">
          <button
            onClick={onYes}
            disabled={busy}
            className="w-full px-5 py-4 bg-forest-card border border-forest-border rounded-2xl font-body text-text-primary font-semibold text-[17px] disabled:opacity-50"
          >
            {t("push.native_ask_yes")}
          </button>
          <button
            onClick={onNotNow}
            disabled={busy}
            className="w-full px-5 py-3 font-body text-text-muted text-[15px]"
          >
            {t("push.native_ask_later")}
          </button>
        </div>
      </div>
    </div>
  );
}
