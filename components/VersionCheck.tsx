"use client";

import { useEffect, useRef } from "react";
import { apiBusy } from "@/lib/api";
import { hasTypedDraft, installDraftTracking } from "@/lib/draft-guard";

/**
 * VersionCheck
 *
 * Auto-reload the PWA when a new deploy is live, so users on long-lived
 * sessions pick up changes without clearing site data or closing the tab.
 *
 * How it works:
 *   1. At build time, next.config.mjs embeds the current build id
 *      (VERCEL_GIT_COMMIT_SHA on Vercel) into NEXT_PUBLIC_BUILD_ID, so this
 *      component ships to the client with a frozen id.
 *   2. While the tab is visible, it polls /api/build-id every 60 seconds
 *      plus on every window focus and visibility change.
 *   3. If the server returns a different id, a newer deploy is live on the
 *      edge, so we reload the page to swap in the new bundle.
 *
 * The reload waits until it cannot cost the member anything: no field
 * focused, no field holding text they typed (a chat draft, a half-filled
 * form), and no API request in flight (an Oracle reply on its way). Until
 * then it stays pending and is retried every few seconds and whenever the
 * page is hidden or shown again. Reloading on the first blur used to throw
 * away a typed message the moment the member tapped elsewhere.
 */

const EMBEDDED_BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID || "unknown";
const POLL_INTERVAL_MS = 60_000;

export default function VersionCheck() {
  const pendingReload = useRef(false);
  const lastCheckedAt = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const isUserTyping = () => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        el.isContentEditable
      );
    };

    // Any field holding text the member typed and has not sent or saved.
    // Tracked from input events (lib/draft-guard): a controlled React
    // field's defaultValue follows its value, so comparing the two misses
    // exactly the drafts that matter (the chat box, a half-filled form).
    const stopDraftTracking = installDraftTracking(document);
    const hasDraft = () => {
      try { return hasTypedDraft(); } catch { return true; }
    };

    const safeToReload = () => !isUserTyping() && !hasDraft() && !apiBusy();

    const doReload = () => {
      if (cancelled) return;
      if (!safeToReload()) {
        pendingReload.current = true;
        return;
      }
      pendingReload.current = false;
      window.location.reload();
    };

    const check = async () => {
      if (cancelled) return;
      // Throttle: skip if we just checked (for example two events firing
      // back to back on tab focus).
      const now = Date.now();
      if (now - lastCheckedAt.current < 5_000) return;
      lastCheckedAt.current = now;

      try {
        const res = await fetch("/api/build-id", {
          cache: "no-store",
          headers: { "cache-control": "no-cache" },
        });
        if (!res.ok) return;
        const data = (await res.json()) as { buildId?: string };
        const serverId = data?.buildId;
        if (!serverId || serverId === "unknown") return;
        if (EMBEDDED_BUILD_ID === "unknown") return;
        if (serverId !== EMBEDDED_BUILD_ID) {
          doReload();
        }
      } catch {
        // Offline or transient error. Try again on the next tick.
      }
    };

    const retryPending = () => {
      if (pendingReload.current) doReload();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") check();
      retryPending();
    };
    const onFocus = () => check();
    const pendingTimer = setInterval(retryPending, 5_000);

    // Kick off one check right after mount, then poll.
    check();
    timer = setInterval(check, POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      stopDraftTracking();
      if (timer) clearInterval(timer);
      clearInterval(pendingTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return null;
}
