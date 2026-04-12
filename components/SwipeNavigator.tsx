"use client";

import { useRouter, usePathname } from "next/navigation";
import { useRef, useEffect } from "react";

const NAV_ORDER = ["/today", "/chat", "/souls", "/profile"];

// How much of the real finger movement translates to screen movement (0–1)
// Lower = heavier, more intentional feel
const DRAG_RESISTANCE = 0.42;

// How many px of dragged distance (after resistance) triggers a page change
const COMMIT_THRESHOLD = 68;

export default function SwipeNavigator({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const wrapRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);
  const startY = useRef(0);
  const dragging = useRef(false);
  const horizontal = useRef(false);
  const liveDx = useRef(0);

  const idx = NAV_ORDER.indexOf(pathname);
  const canNext = idx !== -1 && idx < NAV_ORDER.length - 1;
  const canPrev = idx !== -1 && idx > 0;

  // ── Entrance animation whenever the page changes ──────────────────────────
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const dir = sessionStorage.getItem("swipe_dir");
    sessionStorage.removeItem("swipe_dir");

    if (dir) {
      // Start slightly off-screen in the direction the finger came from
      const from = dir === "forward" ? "28%" : "-28%";
      el.style.transition = "none";
      el.style.opacity = "0.75";
      el.style.transform = `translateX(${from})`;

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          el.style.transition =
            "transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.22s ease";
          el.style.transform = "translateX(0)";
          el.style.opacity = "1";
        });
      });
    } else {
      // Normal nav (bottom tab tap): just reset
      el.style.transition = "none";
      el.style.transform = "translateX(0)";
      el.style.opacity = "1";
    }
  }, [pathname]);

  // ── Touch handlers ─────────────────────────────────────────────────────────
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    // Walk up the DOM from the touch target. If any ancestor is a
    // horizontally scrollable container (overflow-x: auto/scroll), the
    // gesture belongs to that element, not the page navigator.
    const isInsideHScroll = (target: EventTarget | null): boolean => {
      let node = target as HTMLElement | null;
      while (node && node !== el) {
        const style = window.getComputedStyle(node);
        const overflowX = style.overflowX;
        if (
          (overflowX === "auto" || overflowX === "scroll") &&
          node.scrollWidth > node.clientWidth
        ) {
          return true;
        }
        node = node.parentElement;
      }
      return false;
    };

    const onStart = (e: TouchEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (isInsideHScroll(e.target)) return;

      startX.current = e.touches[0].clientX;
      startY.current = e.touches[0].clientY;
      liveDx.current = 0;
      dragging.current = false;
      horizontal.current = false;
      el.style.transition = "none";
    };

    const onMove = (e: TouchEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;

      const dx = e.touches[0].clientX - startX.current;
      const dy = e.touches[0].clientY - startY.current;

      // Lock direction on first meaningful movement
      if (!dragging.current && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
        horizontal.current = Math.abs(dx) > Math.abs(dy) * 1.4;
        dragging.current = true;
      }

      if (!horizontal.current) return;

      // Block native scroll while we own the gesture
      e.preventDefault();

      // Apply resistance. Extra resistance at edges where there's no page to go.
      const atEdge = (dx > 0 && !canPrev) || (dx < 0 && !canNext);
      const factor = atEdge ? 0.08 : DRAG_RESISTANCE;
      const effective = dx * factor;

      liveDx.current = effective;
      el.style.transform = `translateX(${effective}px)`;
    };

    const onEnd = () => {
      if (!horizontal.current || !dragging.current) return;

      const dx = liveDx.current;

      if (Math.abs(dx) >= COMMIT_THRESHOLD && idx !== -1) {
        const goForward = dx < 0;
        const target = idx + (goForward ? 1 : -1);

        if (target >= 0 && target < NAV_ORDER.length) {
          // Fly out in the swipe direction, then navigate
          const flyTo = goForward ? "-52%" : "52%";
          el.style.transition =
            "transform 0.22s cubic-bezier(0.4, 0, 1, 1), opacity 0.18s ease";
          el.style.transform = `translateX(${flyTo})`;
          el.style.opacity = "0.4";

          sessionStorage.setItem("swipe_dir", goForward ? "forward" : "back");

          setTimeout(() => {
            router.push(NAV_ORDER[target]);
          }, 195);
          return;
        }
      }

      // Didn't cross threshold — spring back with a slight overshoot
      el.style.transition =
        "transform 0.42s cubic-bezier(0.34, 1.48, 0.64, 1), opacity 0.2s ease";
      el.style.transform = "translateX(0)";
      el.style.opacity = "1";
      dragging.current = false;
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: true });
    el.addEventListener("touchcancel", onEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [pathname, router, idx, canNext, canPrev]);

  return (
    <div
      ref={wrapRef}
      style={{
        width: "100%",
        minHeight: "100%",
        willChange: "transform",
        backfaceVisibility: "hidden",
      }}
    >
      {children}
    </div>
  );
}
