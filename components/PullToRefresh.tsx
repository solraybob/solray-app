"use client";

import { useEffect, useRef, ReactNode } from "react";
import { usePathname } from "next/navigation";

/**
 * PullToRefresh — iOS-smooth pull-to-refresh.
 *
 * Wraps the page content. On a downward pull from the very top, the content
 * follows the finger with rubber-band resistance and a single centred spinner
 * scales and spins in. Past the threshold it dispatches a SOFT refresh
 * ('solray:refresh') that pages re-fetch in place, then springs back. There is
 * NO document reload, so no white flash and no blanked screen.
 *
 * Refresh contract: listeners get event.detail.done() to call when their
 * refetch settles; a fallback timer releases the UI if nothing responds.
 *
 * Gesture ownership mirrors SwipeNavigator: vertical lock, ignores inputs and
 * multitouch, only arms at scrollTop 0, and yields to any nested scroll
 * container that still has room above. Disabled entirely on /chat.
 */

const ARM_PX = 8;            // downward px before the pull engages
const TRIGGER_PX = 72;       // visual travel that arms a refresh
const MAX_TRANSLATE_PX = 92; // hard cap on how far content follows
const HOLD_PX = 56;          // resting offset while refreshing
const RESISTANCE = 0.45;
const MIN_REFRESH_MS = 480;  // keep the spinner long enough to read as real
const FALLBACK_MS = 2200;    // release even if no page answers

function rubberBand(raw: number) {
  return Math.min(MAX_TRANSLATE_PX, raw * RESISTANCE);
}

export default function PullToRefresh({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const wrapRef = useRef<HTMLDivElement>(null);
  const spinnerRef = useRef<HTMLDivElement>(null);

  // A chat does not need pull-to-refresh, and reloading it wipes the live
  // conversation. Disable the gesture there.
  const disabled = !!pathname && pathname.startsWith("/chat");

  useEffect(() => {
    if (disabled) return;
    const content = wrapRef.current;
    const spinner = spinnerRef.current;
    if (!content || !spinner) return;

    const armed = { v: false };
    const vertical = { v: false };
    const decided = { v: false };
    const refreshing = { v: false };
    const startX = { v: 0 };
    const startY = { v: 0 };
    const pulled = { v: 0 };

    const hasRoomAbove = (target: EventTarget | null) => {
      let node: Element | null = target instanceof Element ? target : null;
      while (node && node !== content && node !== document.body) {
        if (node instanceof HTMLElement) {
          const oy = getComputedStyle(node).overflowY;
          if ((oy === "auto" || oy === "scroll" || oy === "overlay") &&
              node.scrollHeight > node.clientHeight && node.scrollTop > 0) {
            return true;
          }
        }
        node = node.parentElement;
      }
      return false;
    };

    const setSpinner = (progress: number, spinning: boolean) => {
      spinner.style.opacity = String(Math.min(1, progress));
      spinner.style.transform =
        `translate3d(0, ${-12 + progress * 12}px, 0) scale(${0.6 + progress * 0.4}) rotate(${progress * 300}deg)`;
      spinner.firstElementChild?.classList.toggle("is-refreshing", spinning);
    };

    const reset = () => {
      armed.v = false; vertical.v = false; decided.v = false; pulled.v = 0;
      content.style.transition = "transform 0.46s cubic-bezier(0.34, 1.3, 0.64, 1)";
      content.style.transform = "translate3d(0, 0, 0)";
      spinner.style.transition = "opacity 0.2s ease, transform 0.3s ease";
      setSpinner(0, false);
    };

    const finishRefresh = () => {
      if (!refreshing.v) return;
      refreshing.v = false;
      reset();
    };

    const onStart = (e: TouchEvent) => {
      if (refreshing.v) return;
      if (e.touches.length !== 1) return;
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (window.scrollY > 0) return;
      if (hasRoomAbove(e.target)) return;
      armed.v = true; decided.v = false; vertical.v = false;
      startX.v = e.touches[0].clientX;
      startY.v = e.touches[0].clientY;
      content.style.transition = "none";
    };

    const onMove = (e: TouchEvent) => {
      if (!armed.v || refreshing.v) return;
      const dx = e.touches[0].clientX - startX.v;
      const dy = e.touches[0].clientY - startY.v;

      if (!decided.v && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
        // Only own the gesture if it is clearly a downward pull; otherwise
        // hand it back so SwipeNavigator (horizontal) and scroll behave.
        vertical.v = dy > 0 && Math.abs(dy) > Math.abs(dx) * 1.35;
        decided.v = true;
        if (!vertical.v) { armed.v = false; return; }
      }
      if (!vertical.v) return;
      if (dy <= 0) { content.style.transform = "translate3d(0,0,0)"; pulled.v = 0; return; }

      // We own a downward pull: suppress native overscroll and follow finger.
      e.preventDefault();
      pulled.v = rubberBand(dy);
      content.style.transform = `translate3d(0, ${pulled.v}px, 0)`;
      setSpinner(pulled.v / TRIGGER_PX, false);
    };

    const onEnd = () => {
      if (!armed.v || refreshing.v) return;
      armed.v = false;
      const triggered = vertical.v && pulled.v >= TRIGGER_PX;
      if (!triggered) { reset(); return; }

      // Arm the refresh: hold the content slightly down, spin, dispatch.
      refreshing.v = true;
      content.style.transition = "transform 0.24s cubic-bezier(0.22, 1, 0.36, 1)";
      content.style.transform = `translate3d(0, ${HOLD_PX}px, 0)`;
      spinner.style.transition = "opacity 0.2s ease, transform 0.24s ease";
      setSpinner(1, true);

      const startedAt = performance.now();
      let settled = false;
      const done = () => {
        if (settled) return; settled = true;
        const elapsed = performance.now() - startedAt;
        const wait = Math.max(0, MIN_REFRESH_MS - elapsed);
        window.setTimeout(finishRefresh, wait);
      };
      window.setTimeout(done, FALLBACK_MS); // never get stuck
      window.dispatchEvent(new CustomEvent("solray:refresh", { detail: { done } }));
    };

    content.addEventListener("touchstart", onStart, { passive: true });
    content.addEventListener("touchmove", onMove, { passive: false });
    content.addEventListener("touchend", onEnd, { passive: true });
    content.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      content.removeEventListener("touchstart", onStart);
      content.removeEventListener("touchmove", onMove);
      content.removeEventListener("touchend", onEnd);
      content.removeEventListener("touchcancel", onEnd);
    };
  }, [disabled]);

  return (
    <>
      <div
        ref={spinnerRef}
        aria-hidden
        style={{
          position: "fixed",
          top: "calc(env(safe-area-inset-top, 0px) + 16px)",
          left: "50%",
          width: 28,
          height: 28,
          marginLeft: -14,
          zIndex: 9999,
          pointerEvents: "none",
          opacity: 0,
          transform: "translate3d(0, -12px, 0) scale(0.6)",
          willChange: "transform, opacity",
        }}
      >
        <div className="solray-ptr-spinner" />
      </div>
      <div
        ref={wrapRef}
        style={{
          minHeight: "100%",
          willChange: "transform",
          backfaceVisibility: "hidden",
          WebkitBackfaceVisibility: "hidden",
        }}
      >
        {children}
      </div>
    </>
  );
}
