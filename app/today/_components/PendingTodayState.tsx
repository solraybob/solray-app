"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n";
import { type Planet } from "../_lib/today-data";
import { PlanetCard } from "./PlanetCard";

// Honest "your daily reading is being prepared" state. Renders the
// live sky (real planet positions) plus a quiet card explaining the
// reading is still being written. Never shows invented tags, energy,
// or a fake day title. Replaces the previous MOCK_FORECAST fallback.
export function PendingTodayState({ planets }: { planets: Planet[] }) {
  const { t } = useT();
  const [retrying, setRetrying] = useState(false);
  // Re-run the forecast fetch through the same path pull-to-refresh uses,
  // so there is one refetch implementation, and a visible way to try again
  // for members who do not know the pull gesture.
  const retry = () => {
    if (retrying) return;
    setRetrying(true);
    const done = () => setRetrying(false);
    window.dispatchEvent(new CustomEvent("solray:refresh", { detail: { done } }));
  };
  return (
    <div className="max-w-lg lg:max-w-3xl mx-auto px-5">
      <div style={{ paddingTop: 18, paddingBottom: 28 }}>
        <h1
          className="font-heading"
          style={{ fontSize: 28, fontWeight: 900, letterSpacing: "-.02em", lineHeight: 1.15, color: "rgb(var(--rgb-text-primary))" }}
        >
          {t("today.pending_title")}
        </h1>
        <p className="font-body" style={{ fontSize: 17, lineHeight: 1.62, fontWeight: 500, marginTop: 10, color: "rgb(var(--rgb-text-secondary))" }}>
          {t("today.pending_body")}
        </p>
        <button
          onClick={retry}
          disabled={retrying}
          className="w-full py-4 px-8 rounded-full text-[14px] tracking-[0.3em] uppercase font-bold disabled:opacity-50"
          style={{ marginTop: 22, background: "rgb(var(--rgb-text-primary))", color: "rgb(var(--rgb-bg-deep))", border: "1.5px solid rgb(var(--rgb-text-primary))" }}
        >
          {retrying ? (
            <span className="inline-block w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin align-middle" />
          ) : t("common.retry")}
        </button>
      </div>

      <div style={{ borderTop: "1px solid rgb(var(--rgb-border))" }}>
        <p
          className="font-body uppercase"
          style={{ paddingBlock: 16, fontSize: 11.5, fontWeight: 700, letterSpacing: "0.2em", color: "rgb(var(--rgb-text-muted))" }}
        >
          {t("today.sky_now")}
        </p>
      </div>
      <div
        className="-mx-5 px-5 overflow-x-auto"
        style={{ WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}
        // Mouse-wheel users on desktop can't scroll horizontal strips by
        // default. Convert vertical wheel deltas into horizontal scroll
        // when the cursor is over this strip. Touch and trackpad pan
        // gestures still work natively because deltaX is non-zero on
        // those, and we only intercept when deltaX is zero.
        onWheel={(e) => {
          if (e.deltaY !== 0 && e.deltaX === 0) {
            const el = e.currentTarget as HTMLDivElement;
            // Only hijack if there's somewhere to scroll horizontally.
            if (el.scrollWidth > el.clientWidth) {
              el.scrollLeft += e.deltaY;
            }
          }
        }}
      >
        <div className="flex gap-2.5 pb-3" style={{ width: "max-content" }}>
          {planets.map((planet) => (
            <PlanetCard key={planet.name} planet={planet} />
          ))}
        </div>
      </div>
    </div>
  );
}
