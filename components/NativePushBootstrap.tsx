"use client";

/**
 * NativePushBootstrap
 *
 * Mounted once inside AuthProvider. Does nothing on the web or on Android
 * (no FCM sender yet). In the iOS shell:
 *
 *   1. Attaches the push-tap handler once (detached on unmount).
 *   2. Retries any logout release still pending (launch, resume, back
 *      online), see lib/native-push.
 *   3. On launch, login and resume: if the member already allowed
 *      notifications, binds the current device token (syncNativePush).
 *      Never prompts.
 *   4. Asks only after THIS member has seen value, never at sign-up:
 *        - their first Oracle reply (chat dispatches "solray:oracle-reply"),
 *        - or a Today reading actually displayed on a later day than their
 *          first one (Today dispatches "solray:reading-shown" only once a
 *          complete reading is on screen; entering the route counts for
 *          nothing).
 *      Eligibility is stored per member (lib/push-eligibility). The sheet
 *      appears on Today, a moment after a reading is shown. "Yes" shows
 *      the system prompt; "Not now" waits ten days, and we offer at most
 *      three times. If the OS has already been answered (granted or
 *      denied) the sheet never shows.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/i18n";
import {
  attachNativePushHandlers,
  flushPendingReleases,
  getNativePushPermission,
  isNativePushSupported,
  requestNativePushPermission,
  syncNativePush,
  ORACLE_REPLY_EVENT,
  READING_SHOWN_EVENT,
} from "@/lib/native-push";
import {
  mayOfferPushAsk,
  noteOracleReply,
  noteReadingShown,
  recordSoftAsk,
  sweepLegacyEligibility,
} from "@/lib/push-eligibility";

const SHOW_DELAY_MS = 2500;

export default function NativePushBootstrap() {
  const { token, user, loading } = useAuth();
  const { t } = useT();
  const pathname = usePathname();
  const [showAsk, setShowAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const tokenRef = useRef<string | null>(null);
  tokenRef.current = token;
  const memberId = token && user?.id ? user.id : null;
  const memberRef = useRef<string | null>(null);
  memberRef.current = memberId;
  const pathRef = useRef<string | null>(null);
  pathRef.current = pathname;

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

  // 2. Pending logout releases: on launch, on resume and when back online.
  useEffect(() => {
    if (!isNativePushSupported()) return;
    sweepLegacyEligibility();
    void flushPendingReleases();
    const retry = () => { void flushPendingReleases(); };
    const onVisible = () => { if (document.visibilityState === "visible") retry(); };
    window.addEventListener("online", retry);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", retry);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // 3. Bind the current device token on launch/login, and on resume.
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

  // 4a. An Oracle reply counts as value for the member it was for.
  useEffect(() => {
    if (!isNativePushSupported()) return;
    const onReply = () => {
      if (memberRef.current) noteOracleReply(memberRef.current);
    };
    window.addEventListener(ORACLE_REPLY_EVENT, onReply);
    return () => window.removeEventListener(ORACLE_REPLY_EVENT, onReply);
  }, []);

  // 4b. A reading shown on Today: record it for this member, then offer the
  //     sheet a moment later if they qualify.
  useEffect(() => {
    if (!isNativePushSupported()) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onReading = () => {
      const member = memberRef.current;
      if (!member || pathRef.current !== "/today") return;
      noteReadingShown(member);
      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => {
        timer = null;
        if (memberRef.current !== member || pathRef.current !== "/today") return;
        if (!mayOfferPushAsk(member)) return;
        if ((await getNativePushPermission()) !== "prompt") return;
        if (memberRef.current === member && pathRef.current === "/today") setShowAsk(true);
      }, SHOW_DELAY_MS);
    };
    window.addEventListener(READING_SHOWN_EVENT, onReading);
    return () => {
      window.removeEventListener(READING_SHOWN_EVENT, onReading);
      if (timer) clearTimeout(timer);
    };
  }, []);

  // Leaving Today, signing out or switching account closes the sheet.
  useEffect(() => {
    setShowAsk(false);
  }, [memberId]);
  useEffect(() => {
    if (pathname !== "/today" || !token) setShowAsk(false);
  }, [pathname, token]);

  const onYes = useCallback(async () => {
    if (!token || !memberId) return;
    setBusy(true);
    recordSoftAsk(memberId);
    try {
      await requestNativePushPermission(token);
    } finally {
      setBusy(false);
      setShowAsk(false);
    }
  }, [token, memberId]);

  const onNotNow = useCallback(() => {
    if (memberId) recordSoftAsk(memberId);
    setShowAsk(false);
  }, [memberId]);

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
