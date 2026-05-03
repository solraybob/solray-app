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
    <ShareOffscreenWrapper containerRef={containerRef}>
      <ShareCard data={data} />
    </ShareOffscreenWrapper>
  );
}

/**
 * Generic off-screen wrapper for any 1080x1920 share card variant.
 * Lets multiple surfaces (hero, energy bars, future chart minimal,
 * future Souls invite) share the same capture pipeline without each
 * surface re-implementing the off-screen positioning logic.
 */
export function ShareOffscreenWrapper({
  children,
  containerRef,
}: {
  children: React.ReactNode;
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
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// EnergyBarsCard
// ---------------------------------------------------------------------------

export interface EnergyBarsCardData {
  dateLabel: string;
  energy: { mental: number; emotional: number; physical: number; intuitive: number };
}

const ENERGY_COLORS_FOR_CARD = {
  Mental:    "#9babb9", // mist
  Emotional: "#d47a52", // ember
  Physical:  "#8a9e66", // moss
  Intuitive: "#9b86a0", // wisteria
} as const;

/**
 * Spotify-Wrapped style daily energy share. Four bars with the
 * user's mental / emotional / physical / intuitive scores out of 10.
 *
 * Privacy: energy values are derived from transit math, not personal
 * birth details. No identifying information on the card. The bars
 * + the date + Solray branding are all that ships.
 */
export function EnergyBarsCard({ data }: { data: EnergyBarsCardData }) {
  // Same display-pct mapping as the live energy bars so the share
  // card matches what the user just looked at on /today.
  const toDisplayPct = (v: number) => 50 + (Math.max(0, Math.min(10, v)) / 10) * 45;

  const rows: { label: keyof typeof ENERGY_COLORS_FOR_CARD; value: number }[] = [
    { label: "Mental",    value: data.energy.mental },
    { label: "Emotional", value: data.energy.emotional },
    { label: "Physical",  value: data.energy.physical },
    { label: "Intuitive", value: data.energy.intuitive },
  ];

  return (
    <div
      style={{
        width: "1080px",
        height: "1920px",
        background: "#050f08",
        position: "relative",
        overflow: "hidden",
        fontFamily: "'Cormorant Garamond', Georgia, serif",
      }}
    >
      {/* Date eyebrow */}
      <div
        style={{
          position: "absolute",
          top: "120px",
          left: 0,
          right: 0,
          textAlign: "center",
          fontFamily: "'Inter', system-ui, sans-serif",
          fontSize: "26px",
          letterSpacing: "0.34em",
          textTransform: "uppercase",
          color: "rgba(243, 146, 48, 0.85)",
        }}
      >
        {data.dateLabel}
      </div>

      {/* Title */}
      <div
        style={{
          position: "absolute",
          top: "240px",
          left: 0,
          right: 0,
          textAlign: "center",
          fontFamily: "'Cormorant Garamond', Georgia, serif",
          fontSize: "78px",
          fontWeight: 300,
          fontStyle: "italic",
          letterSpacing: "-0.01em",
          color: "#f2ecd8",
        }}
      >
        Today&apos;s Vibe
      </div>

      {/* Bars block, centered vertically in the lower half */}
      <div
        style={{
          position: "absolute",
          top: "470px",
          left: "120px",
          right: "120px",
          display: "flex",
          flexDirection: "column",
          gap: "60px",
        }}
      >
        {rows.map(({ label, value }) => {
          const pct = toDisplayPct(value);
          const color = ENERGY_COLORS_FOR_CARD[label];
          return (
            <div key={label}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  marginBottom: "22px",
                  fontFamily: "'Inter', system-ui, sans-serif",
                }}
              >
                <span
                  style={{
                    fontSize: "30px",
                    letterSpacing: "0.28em",
                    textTransform: "uppercase",
                    color: "#a8b8ab",
                    fontWeight: 400,
                  }}
                >
                  {label}
                </span>
                <span
                  style={{
                    fontFamily: "'Cormorant Garamond', Georgia, serif",
                    fontSize: "60px",
                    fontWeight: 300,
                    color: "#f2ecd8",
                    lineHeight: 1,
                  }}
                >
                  {value}
                  <span
                    style={{
                      fontSize: "30px",
                      color: "#a8b8ab",
                      opacity: 0.6,
                      marginLeft: "6px",
                    }}
                  >
                    /10
                  </span>
                </span>
              </div>
              {/* Bar track */}
              <div
                style={{
                  width: "100%",
                  height: "8px",
                  background: "rgba(168, 184, 171, 0.10)",
                  borderRadius: "999px",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${pct}%`,
                    height: "100%",
                    background: color,
                    borderRadius: "999px",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Hairline accent + brand */}
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
      <div
        style={{
          position: "absolute",
          bottom: "120px",
          left: 0,
          right: 0,
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
