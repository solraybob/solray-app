"use client";

import { useEffect, useState, useRef } from "react";

/**
 * PullToRefresh
 *
 * Standard iOS/Android pull-to-refresh gesture. Drag down from the top of
 * the page to reload.
 *
 * The subtle bit: pages like /chat have an inner scrollable container for
 * the message list, while the window itself never scrolls. If we only
 * checked window.scrollY, pulling down inside the chat to reveal older
 * messages would look identical to a pull-to-refresh and the page would
 * reload out from under the user. To avoid this we walk up from the touch
 * target and if any ancestor scroll container still has content to reveal
 * above (scrollTop > 0), we let that container take the gesture and do
 * not arm the refresh.
 *
 * We also require a small downward movement before showing the spinner so
 * a simple tap at the top of the screen does not flash a spinner.
 */

const MAX_PULL = 120;
const TRIGGER_DISTANCE = 100;
const ARM_THRESHOLD = 8; // px of downward drag before we show the spinner

export default function PullToRefresh() {
  const [pulling, setPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const armedRef = useRef(false);
  const startYRef = useRef(0);

  useEffect(() => {
    const isInsideScrollableWithRoomAbove = (target: EventTarget | null) => {
      let node: Element | null =
        target instanceof Element ? (target as Element) : null;
      while (node && node !== document.body && node !== document.documentElement) {
        if (node instanceof HTMLElement) {
          const style = window.getComputedStyle(node);
          const oy = style.overflowY;
          const canScroll =
            (oy === "auto" || oy === "scroll" || oy === "overlay") &&
            node.scrollHeight > node.clientHeight;
          if (canScroll && node.scrollTop > 0) {
            return true;
          }
        }
        node = node.parentElement;
      }
      return false;
    };

    const handleTouchStart = (e: TouchEvent) => {
      // Ignore multi-touch: a pinch or two-finger scroll is not a pull.
      if (e.touches.length !== 1) return;
      // Window itself must be at the top.
      if (window.scrollY > 10) return;
      // A nested scrollable with content above takes the gesture.
      if (isInsideScrollableWithRoomAbove(e.target)) return;

      armedRef.current = true;
      startYRef.current = e.touches[0].clientY;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!armedRef.current) return;
      if (e.touches.length !== 1) {
        armedRef.current = false;
        setPulling(false);
        setPullDistance(0);
        return;
      }

      const currentY = e.touches[0].clientY;
      const raw = currentY - startYRef.current;

      // Upward drag cancels the gesture; let the rest of the page behave
      // normally (for example so a JS-driven overscroll does not linger).
      if (raw < 0) {
        armedRef.current = false;
        setPulling(false);
        setPullDistance(0);
        return;
      }

      if (raw < ARM_THRESHOLD) return;

      if (!pulling) setPulling(true);
      setPullDistance(Math.min(raw, MAX_PULL));
    };

    const handleTouchEnd = () => {
      if (!armedRef.current) return;
      armedRef.current = false;

      const triggered = pullDistance > TRIGGER_DISTANCE;
      setPulling(false);
      setPullDistance(0);

      if (triggered) {
        window.location.reload();
      }
    };

    const opts: AddEventListenerOptions = { passive: true };
    document.addEventListener("touchstart", handleTouchStart, opts);
    document.addEventListener("touchmove", handleTouchMove, opts);
    document.addEventListener("touchend", handleTouchEnd, opts);
    document.addEventListener("touchcancel", handleTouchEnd, opts);

    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
      document.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [pulling, pullDistance]);

  if (!pulling || pullDistance === 0) return null;

  const percentage = (pullDistance / MAX_PULL) * 100;
  const rotation = (percentage / 100) * 360;

  return (
    <div
      style={{
        position: "fixed",
        top: pullDistance - 40,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 9999,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: "50%",
          border: "3px solid #f39230",
          borderTopColor: "transparent",
          transform: `rotate(${rotation}deg)`,
          opacity: Math.min(1, percentage / 100),
        }}
      />
      {percentage > 80 && (
        <div
          style={{
            marginTop: 8,
            fontSize: "14px",
            color: "#f39230",
            textAlign: "center",
            whiteSpace: "nowrap",
            opacity: (percentage - 80) / 20,
          }}
        >
          Release to refresh
        </div>
      )}
    </div>
  );
}
