"use client";

/**
 * AnalyticsTracker, mounted once in the root layout.
 *
 * Captures two things through the existing privacy-respecting analytics
 * pipeline (lib/analytics.ts), so the Business Hub can show time-in-app and
 * time-per-page:
 *
 *   page_view  fired on every route change, props { page }
 *   heartbeat  fired every HEARTBEAT_MS while the tab is actually VISIBLE,
 *              props { page }. Time-on-page is reconstructed server-side as
 *              count(heartbeat) * HEARTBEAT_SECONDS.
 *
 * Privacy: track() already short-circuits on opt-out and requires an auth
 * token, and the only prop sent is a bounded page label (never a URL with
 * ids, never content). Heartbeats pause when the tab is hidden, so an idle
 * background tab does not inflate the numbers.
 */

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { track, HEARTBEAT_MS } from "@/lib/analytics";

// Bounded set of page labels so the page dimension never becomes high
// cardinality. Dynamic segments (e.g. /profile/[id]) collapse to the base.
const KNOWN_PAGES = [
  "today", "chat", "souls", "profile", "chart", "onboard", "login",
  "subscribe", "first-mirror", "settings", "verify-email", "reset-password",
];

function pageLabel(path: string | null): string {
  if (!path || path === "/") return "home";
  const first = path.split("/").filter(Boolean)[0] || "home";
  return KNOWN_PAGES.includes(first) ? first : "other";
}

function getToken(): string | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage.getItem("solray_token") : null;
  } catch {
    return null;
  }
}

export default function AnalyticsTracker() {
  const pathname = usePathname();
  const pageRef = useRef<string>("");

  // page_view on every route change.
  useEffect(() => {
    const page = pageLabel(pathname);
    pageRef.current = page;
    const token = getToken();
    if (token) void track("page_view", { page }, token);
  }, [pathname]);

  // heartbeat while visible. One interval for the app's lifetime; it always
  // reads the current page from the ref, so it follows navigation.
  useEffect(() => {
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      const token = getToken();
      if (token && pageRef.current) void track("heartbeat", { page: pageRef.current }, token);
    }, HEARTBEAT_MS);
    return () => clearInterval(id);
  }, []);

  return null;
}
