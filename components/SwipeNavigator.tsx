"use client";

import { useRouter, usePathname } from "next/navigation";
import { useRef, useEffect } from "react";

const NAV_ORDER = ["/today", "/chat", "/souls", "/profile"];

// Drag tracks 1:1 for valid swipes — finger position = page position.
// Only edges (no page to go to) get heavy rubber-band resistance.
const EDGE_RESISTANCE   = 0.10;

// Commit triggers if the page has traveled this far (px) OR the finger
// is moving fast enough (px/ms). Whichever comes first wins.
const COMMIT_PX         = 48;
const COMMIT_VELOCITY   = 0.28; // px/ms — roughly a light flick

// How far off-screen the new page starts on entrance.
// 18% feels native (tight), 28% feels like a web app.
const ENTRANCE_OFFSET   = "18%";

export default function SwipeNavigator({ children }: { children: React.ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();
  const wrapRef  = useRef<HTMLDivElement>(null);

  // Touch state
  const startX    = useRef(0);
  const startY    = useRef(0);
  const prevX     = useRef(0);
  const prevT     = useRef(0);
  const velocity  = useRef(0);   // px/ms, positive = rightward
  const dragging  = useRef(false);
  const horizontal= useRef(false);
  const liveDx    = useRef(0);
  const committed = useRef(false); // prevents double-fire on touchend

  const idx     = NAV_ORDER.indexOf(pathname);
  const canNext = idx !== -1 && idx < NAV_ORDER.length - 1;
  const canPrev = idx !== -1 && idx > 0;

  // ── Entrance animation on every route change ────────────────────────────────
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const dir = sessionStorage.getItem("swipe_dir");
    sessionStorage.removeItem("swipe_dir");

    if (dir) {
      // Page starts at a small offset in the incoming direction, fully opaque.
      // A tight easeOutExpo (0.22,1,0.36,1) snaps to rest quickly — feels
      // like native iOS: fast initial deceleration, almost no overshoot.
      const from = dir === "forward" ? ENTRANCE_OFFSET : `-${ENTRANCE_OFFSET}`;
      el.style.transition = "none";
      el.style.opacity    = "0.88";
      el.style.transform  = `translateX(${from})`;

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          el.style.transition =
            "transform 0.32s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.2s ease";
          el.style.transform = "translateX(0)";
          el.style.opacity   = "1";
        });
      });
    } else {
      // Tab tap: instant reset, no animation needed
      el.style.transition = "none";
      el.style.transform  = "translateX(0)";
      el.style.opacity    = "1";
    }
  }, [pathname]);

  // ── Touch handlers ──────────────────────────────────────────────────────────
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    // If the touch target is inside a horizontally scrollable container,
    // hand the gesture back to native scroll.
    const isInsideHScroll = (target: EventTarget | null): boolean => {
      let node = target as HTMLElement | null;
      while (node && node !== el) {
        const s = window.getComputedStyle(node);
        if (
          (s.overflowX === "auto" || s.overflowX === "scroll") &&
          node.scrollWidth > node.clientWidth
        ) return true;
        node = node.parentElement;
      }
      return false;
    };

    const onStart = (e: TouchEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (isInsideHScroll(e.target)) return;

      const t = e.touches[0];
      startX.current    = t.clientX;
      startY.current    = t.clientY;
      prevX.current     = t.clientX;
      prevT.current     = performance.now();
      velocity.current  = 0;
      liveDx.current    = 0;
      dragging.current  = false;
      horizontal.current= false;
      committed.current = false;
      el.style.transition = "none";
    };

    const onMove = (e: TouchEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (committed.current) return;

      const t  = e.touches[0];
      const dx = t.clientX - startX.current;
      const dy = t.clientY - startY.current;

      // Update velocity with an exponential moving average for smooth tracking
      const now = performance.now();
      const dt  = now - prevT.current;
      if (dt > 0) {
        const instant = (t.clientX - prevX.current) / dt;
        // 0.65 old / 0.35 new — enough lag to kill jitter, enough freshness
        // to catch flicks
        velocity.current = velocity.current * 0.65 + instant * 0.35;
      }
      prevX.current = t.clientX;
      prevT.current = now;

      // Lock gesture direction on first significant movement
      if (!dragging.current && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
        horizontal.current = Math.abs(dx) > Math.abs(dy) * 1.4;
        dragging.current   = true;
      }

      if (!horizontal.current) return;

      // Take over native scroll once we own a horizontal gesture
      e.preventDefault();

      // 1:1 tracking for valid directions — page follows finger exactly.
      // Heavy rubber band only at the edges where there's nowhere to go.
      const atEdge  = (dx > 0 && !canPrev) || (dx < 0 && !canNext);
      const factor  = atEdge ? EDGE_RESISTANCE : 1.0;
      const effective = dx * factor;

      liveDx.current = effective;
      el.style.transform = `translateX(${effective}px)`;
    };

    const onEnd = () => {
      if (!horizontal.current || !dragging.current || committed.current) return;

      const dx  = liveDx.current;
      const vel = velocity.current;

      const goForward = dx < 0;

      // Commit if distance threshold OR velocity threshold met, in the same direction
      const distOk = Math.abs(dx) >= COMMIT_PX;
      const velOk  = Math.abs(vel) >= COMMIT_VELOCITY &&
                     (vel < 0) === goForward;

      if ((distOk || velOk) && idx !== -1) {
        const target = idx + (goForward ? 1 : -1);

        if (target >= 0 && target < NAV_ORDER.length) {
          committed.current = true;

          // Continue the motion from where the page already is — no jump.
          // Use a short, sharp ease-in so it feels like the finger threw it.
          const flyTo = goForward ? "-58%" : "58%";
          el.style.transition =
            "transform 0.19s cubic-bezier(0.4, 0, 1, 1), opacity 0.15s ease";
          el.style.transform = `translateX(${flyTo})`;
          el.style.opacity   = "0.5";

          sessionStorage.setItem("swipe_dir", goForward ? "forward" : "back");
          setTimeout(() => router.push(NAV_ORDER[target]), 175);
          return;
        }
      }

      // Below threshold — spring back with a gentle overshoot.
      // cubic-bezier(0.34, 1.3, 0.64, 1) gives a small, satisfying bounce.
      el.style.transition =
        "transform 0.46s cubic-bezier(0.34, 1.3, 0.64, 1), opacity 0.22s ease";
      el.style.transform = "translateX(0)";
      el.style.opacity   = "1";
      dragging.current   = false;
    };

    el.addEventListener("touchstart", onStart,  { passive: true  });
    el.addEventListener("touchmove",  onMove,   { passive: false });
    el.addEventListener("touchend",   onEnd,    { passive: true  });
    el.addEventListener("touchcancel",onEnd,    { passive: true  });

    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove",  onMove);
      el.removeEventListener("touchend",   onEnd);
      el.removeEventListener("touchcancel",onEnd);
    };
  }, [pathname, router, idx, canNext, canPrev]);

  return (
    <div
      ref={wrapRef}
      style={{
        width: "100%",
        minHeight: "100%",
        willChange: "transform, opacity",
        backfaceVisibility: "hidden",
        WebkitBackfaceVisibility: "hidden",
        // Promote to its own compositor layer — eliminates repaint lag
        transform: "translateZ(0)",
      }}
    >
      {children}
    </div>
  );
}
