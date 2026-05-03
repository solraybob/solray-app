"use client";

/**
 * ShareCard — Instagram-Story-shaped (1080x1920) share image of the
 * day. Renders to an off-screen DOM node so html2canvas can capture
 * it; never visible to the user directly.
 *
 * Design notes per Codex's UX strategy memo:
 *   - Looks like a Solray asset on someone else's feed, not a generic
 *     horoscope screenshot. Cormorant Garamond, forest deep
 *     background, single amber accent, generous space.
 *   - Zero private birth data. No birth date, time, location, or
 *     specific natal placement names that would identify the person.
 *     We share the day_title (poetic, generic-feeling on its surface)
 *     and the date, that's it.
 *   - Solray branding at the bottom so anyone who sees it on
 *     Instagram knows what app it came from.
 *
 * Codex UX hook 6: share cards are the highest-ceiling organic
 * growth lever in the product. The constraint is that they must look
 * top-tier; a mediocre card hurts the brand. This is a v1 that holds
 * the standard.
 */

import { type RefObject } from "react";

export interface ShareCardData {
  dayTitle: string;
  imageSrc: string;
  dateLabel: string; // e.g. "Saturday, 3 May"
}

/**
 * The visible card itself. Rendered into a fixed-size 1080x1920
 * container by ShareCardCanvas below. All sizes here are in CSS
 * pixels at the 1080-wide canvas, so a 60px font on this card is
 * proportionally about the same as a 20px font on a 360px-wide
 * mobile viewport.
 */
export default function ShareCard({ data }: { data: ShareCardData }) {
  return (
    <div
      style={{
        width: "1080px",
        height: "1920px",
        position: "relative",
        background: "#050f08", // forest deep, hardcoded for screenshot context
        overflow: "hidden",
        fontFamily: "'Cormorant Garamond', Georgia, serif",
      }}
    >
      {/* Background hero image, top half, with deep gradient down to
          forest deep. Same image used on the Today page hero. */}
      <div style={{ position: "absolute", inset: 0, height: "60%" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={data.imageSrc}
          alt=""
          crossOrigin="anonymous"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(to bottom, rgba(5,15,8,0.0) 0%, rgba(5,15,8,0.45) 40%, rgba(5,15,8,0.95) 75%, rgba(5,15,8,1) 100%)",
          }}
        />
      </div>

      {/* Eyebrow: date, top-left */}
      <div
        style={{
          position: "absolute",
          top: "84px",
          left: "0",
          right: "0",
          textAlign: "center",
          fontFamily: "'Inter', system-ui, sans-serif",
          fontSize: "26px",
          letterSpacing: "0.34em",
          textTransform: "uppercase",
          color: "rgba(243, 146, 48, 0.85)",
          fontWeight: 400,
        }}
      >
        {data.dateLabel}
      </div>

      {/* Center: day title, oversize Cormorant italic */}
      <div
        style={{
          position: "absolute",
          top: "55%",
          left: "0",
          right: "0",
          padding: "0 80px",
          textAlign: "center",
          color: "#f2ecd8",
          fontStyle: "italic",
          fontWeight: 300,
          fontSize: "108px",
          lineHeight: 1.1,
          letterSpacing: "-0.01em",
          transform: "translateY(-30%)",
          textShadow: "0 2px 24px rgba(0,0,0,0.6)",
        }}
      >
        {data.dayTitle}
      </div>

      {/* Hairline accent above brand */}
      <div
        style={{
          position: "absolute",
          bottom: "210px",
          left: "50%",
          transform: "translateX(-50%)",
          width: "60px",
          height: "1px",
          background: "rgba(243, 146, 48, 0.35)",
        }}
      />

      {/* Brand: Solray + url */}
      <div
        style={{
          position: "absolute",
          bottom: "120px",
          left: "0",
          right: "0",
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontSize: "60px",
            fontWeight: 300,
            letterSpacing: "0.18em",
            color: "#f2ecd8",
            marginBottom: "14px",
          }}
        >
          SOLRAY
        </div>
        <div
          style={{
            fontFamily: "'Inter', system-ui, sans-serif",
            fontSize: "24px",
            letterSpacing: "0.25em",
            color: "rgba(168, 184, 171, 0.7)",
            textTransform: "lowercase",
          }}
        >
          solray.ai
        </div>
      </div>
    </div>
  );
}

/**
 * Renders the share card into an off-screen container so html2canvas
 * can capture it. The container is fixed-positioned far off-screen
 * and given an explicit pixel size so html2canvas measures correctly.
 */
export function ShareCardOffscreen({
  data,
  containerRef,
}: {
  data: ShareCardData;
  containerRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      ref={containerRef as RefObject<HTMLDivElement>}
      style={{
        position: "fixed",
        top: "-99999px",
        left: "-99999px",
        width: "1080px",
        height: "1920px",
        zIndex: -1,
        pointerEvents: "none",
      }}
      aria-hidden
    >
      <ShareCard data={data} />
    </div>
  );
}
