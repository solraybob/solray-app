"use client";

import { useRouter, usePathname } from "next/navigation";
import { useRef, useEffect } from "react";

// The four main tab pages in left-to-right order
const NAV_ORDER = ["/today", "/chat", "/souls", "/profile"];

// Minimum horizontal distance to register as a page swipe
const MIN_DISTANCE = 72;
// Maximum time for the swipe gesture in ms
const MAX_DURATION = 380;
// Horizontal must be this much larger than vertical to count as a page swipe
const DIRECTION_RATIO = 2.2;

export default function SwipeNavigator({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const touchStartTime = useRef(0);

  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
      // Ignore touches that begin on inputs, textareas, or selects
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;

      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
      touchStartTime.current = Date.now();
    };

    const onTouchEnd = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - touchStartX.current;
      const dy = e.changedTouches[0].clientY - touchStartY.current;
      const dt = Date.now() - touchStartTime.current;

      const isPageSwipe =
        Math.abs(dx) > Math.abs(dy) * DIRECTION_RATIO &&
        Math.abs(dx) > MIN_DISTANCE &&
        dt < MAX_DURATION;

      if (!isPageSwipe) return;

      const idx = NAV_ORDER.indexOf(pathname);
      if (idx === -1) return;

      if (dx < 0 && idx < NAV_ORDER.length - 1) {
        // Swipe left: go to next page
        router.push(NAV_ORDER[idx + 1]);
      } else if (dx > 0 && idx > 0) {
        // Swipe right: go to previous page
        router.push(NAV_ORDER[idx - 1]);
      }
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchend", onTouchEnd);
    };
  }, [pathname, router]);

  return <>{children}</>;
}
