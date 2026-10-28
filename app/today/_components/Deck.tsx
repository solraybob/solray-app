"use client";

import { useState, useRef } from "react";
import { activeCardIndex } from "@/lib/deck";

export function Deck({ children, count }: { children: React.ReactNode; count: number }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [here, setHere] = useState(0);
  // The lit dot is the card whose centre is nearest the track's centre,
  // measured from the cards themselves rather than from an assumed stride,
  // so it is right at every width (and the last dot lights at the end even
  // when the last card cannot scroll fully to the centre).
  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    const cards = (Array.from(el.children) as HTMLElement[]).map((c) => ({ left: c.offsetLeft, width: c.offsetWidth }));
    setHere(activeCardIndex(el.scrollLeft, el.clientWidth, el.scrollWidth, cards, count));
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: "1 1 0", minHeight: 0 }}>
      <div
        ref={ref}
        onScroll={onScroll}
        style={{
          flex: "1 1 0",
          minHeight: 0,
          display: "flex",
          gap: 16,
          overflowX: "auto",
          overflowY: "hidden",
          scrollSnapType: "x mandatory",
          WebkitOverflowScrolling: "touch",
          scrollbarWidth: "none",
          // The track runs edge to edge (it bleeds 20px past the page
          // gutter on each side) and pads 40px on each side, so a card at
          // 100% of the content box sits exactly in the middle with the
          // same 40px either side, and the next card peeks in by the gap.
          position: "relative",
          margin: "0 -20px",
          padding: "18px 40px 16px",
          scrollPaddingInline: 40,
          alignItems: "stretch",
        }}
      >
        {children}
      </div>
      {count > 1 && (
        // The lit dot grows (scale 1.15) and wears a 3.5px halo; the deck box
        // above clips its overflow, so the row carries room for both or the
        // halo is cut flat along the bottom.
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 11, padding: "6px 0 8px" }}>
          {Array.from({ length: count }).map((_, i) => (
            <i
              key={i}
              style={{
                width: 9,
                height: 9,
                borderRadius: "50%",
                display: "block",
                boxSizing: "border-box",
                border: "1.4px solid rgb(var(--rgb-text-primary) / 0.24)",
                background: i === here ? "rgb(var(--rgb-amber))" : "none",
                borderColor: i === here ? "rgb(var(--rgb-amber))" : "rgb(var(--rgb-text-primary) / 0.24)",
                transform: i === here ? "scale(1.15)" : "none",
                boxShadow: i === here ? "0 0 0 3.5px rgb(var(--rgb-text-primary) / 0.075)" : "none",
                transition: "background .25s ease, border-color .25s ease, transform .25s ease",
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
