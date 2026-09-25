"use client";

/**
 * ShareCard — Instagram-Story-shaped (1080x1920) share image of the
 * day. Renders to an off-screen DOM node so html2canvas can capture
 * it; never visible to the user directly.
 *
 * Design notes per Codex's UX strategy memo:
 *   - Looks like a Solray asset on someone else's feed, not a generic
 *     horoscope screenshot. Zen Kaku Gothic New on the paper
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

// The one lockup: lowercase, the orb standing in for the o, set at the
// wordmark's own weight. Sized in px because these cards render at a fixed
// 1080x1920 and are rasterised, not laid out responsively.
function Wordmark({ size }: { size: number }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "baseline",
        fontFamily: 'var(--font-heading), "Zen Kaku Gothic New", system-ui, sans-serif',
        fontSize: `${size}px`,
        fontWeight: 700,
        letterSpacing: "-0.02em",
        color: "#22201C",
        lineHeight: 1,
      }}
    >
      s
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/solray-orb.png"
        alt=""
        style={{
          width: `${Math.round(size * 0.52)}px`,
          height: `${Math.round(size * 0.52)}px`,
          objectFit: "contain",
          margin: "0 0.01em",
          transform: "translateY(0.02em)",
        }}
      />
      lray
    </span>
  );
}

export interface ShareCardData {
  dayTitle: string;
  heroWash: string;
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
        background: "#F5F0E6", // the paper, written out: this card is rasterised
        overflow: "hidden",
        fontFamily: 'var(--font-heading), "Zen Kaku Gothic New", system-ui, sans-serif',
      }}
    >
      {/* The day's wash, the same one the Today hero carries. No photograph:
          a stock sky behind the title was what made the lettering unreadable,
          and it was a different visual language from everything else we make. */}
      <div style={{ position: "absolute", inset: 0, height: "62%", background: data.heroWash }} />

      {/* Eyebrow: date, top-left */}
      <div
        style={{
          position: "absolute",
          top: "84px",
          left: "0",
          right: "0",
          textAlign: "center",
          fontFamily: 'var(--font-body), "Zen Kaku Gothic New", system-ui, sans-serif',
          fontSize: "26px",
          letterSpacing: "0.30em",
          textTransform: "uppercase",
          color: "#6E6659",
          fontWeight: 700,
        }}
      >
        {data.dateLabel}
      </div>

      {/* Center: the day title, at the display weight */}
      <div
        style={{
          position: "absolute",
          top: "55%",
          left: "0",
          right: "0",
          padding: "0 80px",
          textAlign: "center",
          color: "#22201C",
          fontWeight: 900,
          fontSize: "108px",
          lineHeight: 1.06,
          letterSpacing: "-0.042em",
          transform: "translateY(-30%)",
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
          background: "#D9CFB9",
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
        <div style={{ marginBottom: "14px" }}>
          <Wordmark size={64} />
        </div>
        <div
          style={{
            fontFamily: 'var(--font-body), "Zen Kaku Gothic New", system-ui, sans-serif',
            fontSize: "24px",
            letterSpacing: "0.25em",
            color: "#6E6659",
            fontWeight: 700,
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
  Mental:    "#4A2E9E", // mist
  Emotional: "#A34A22", // ember
  Physical:  "#A34A22", // moss
  Intuitive: "#B02E72", // wisteria
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
  const toDisplayPct = (v: number) => Math.round(Math.max(1, Math.min(10, v)) * 9 + 3);

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
        background: "#F5F0E6",
        position: "relative",
        overflow: "hidden",
        fontFamily: 'var(--font-heading), "Zen Kaku Gothic New", system-ui, sans-serif',
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
          fontFamily: 'var(--font-body), "Zen Kaku Gothic New", system-ui, sans-serif',
          fontSize: "26px",
          letterSpacing: "0.34em",
          textTransform: "uppercase",
          color: "rgb(var(--rgb-amber) / 0.85)",
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
          fontFamily: 'var(--font-heading), "Zen Kaku Gothic New", system-ui, sans-serif',
          fontSize: "78px",
          fontWeight: 900,
          letterSpacing: "-0.038em",
          color: "#22201C",
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
                  fontFamily: 'var(--font-body), "Zen Kaku Gothic New", system-ui, sans-serif',
                }}
              >
                <span
                  style={{
                    fontSize: "30px",
                    letterSpacing: "0.28em",
                    textTransform: "uppercase",
                    color: "#5C5548",
                    fontWeight: 500,
                  }}
                >
                  {label}
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-heading), "Zen Kaku Gothic New", system-ui, sans-serif',
                    fontSize: "60px",
                    fontWeight: 700,
                    color: "#22201C",
                    lineHeight: 1,
                  }}
                >
                  {value}
                  <span
                    style={{
                      fontSize: "30px",
                      color: "#5C5548",
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
          background: "#D9CFB9",
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
        <div style={{ marginBottom: "14px" }}>
          <Wordmark size={64} />
        </div>
        <div
          style={{
            fontFamily: 'var(--font-body), "Zen Kaku Gothic New", system-ui, sans-serif',
            fontSize: "24px",
            letterSpacing: "0.25em",
            color: "#6E6659",
            fontWeight: 700,
            textTransform: "lowercase",
          }}
        >
          solray.ai
        </div>
      </div>
    </div>
  );
}


// ---------------------------------------------------------------------------
// SoulsInviteCard
// ---------------------------------------------------------------------------

export interface SoulsInviteCardData {
  // The inviter's permanent code, shown on the card so a friend who joins is
  // attributed to them. No personal name appears anywhere on the card.
  code?: string;
}

/**
 * Souls invite share card. The viral lever Codex's UX memo named as
 * the highest-ceiling growth surface in the product.
 *
 * Use case: Bob wants to invite a friend (who is NOT yet on Solray)
 * to connect with him in the Souls feature. He generates this card,
 * sends it via Instagram DM or Messages, friend sees a beautiful
 * Solray asset that says "Bob invited you to read the dynamic
 * between you," friend taps through to solray.ai, signs up, connects.
 *
 * Design intent: feels personal, never spammy. Single line of copy,
 * inviter's name as the emotional anchor, "between you" as the hook.
 * No charts, no astrology language on the card itself, the framework
 * lives behind the link.
 *
 * Privacy: only the inviter's first name on the card. The inviter
 * consents by tapping share. No recipient data, no birth data.
 */
export function SoulsInviteCard({ data }: { data: SoulsInviteCardData }) {
  const code = (data.code || "").trim();

  return (
    <div
      style={{
        width: "1080px",
        height: "1920px",
        background: "#F5F0E6",
        position: "relative",
        overflow: "hidden",
        fontFamily: 'var(--font-heading), "Zen Kaku Gothic New", system-ui, sans-serif',
      }}
    >
      {/* Soft amber glow, the same warm light as the app. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(circle at 50% 40%, rgb(var(--rgb-amber) / 0.10) 0%, rgb(var(--rgb-amber) / 0) 55%)",
        }}
      />

      {/* Eyebrow */}
      <div
        style={{
          position: "absolute",
          top: "300px",
          left: 0,
          right: 0,
          textAlign: "center",
          fontFamily: 'var(--font-body), "Zen Kaku Gothic New", system-ui, sans-serif',
          fontSize: "26px",
          letterSpacing: "0.30em",
          textTransform: "uppercase",
          fontWeight: 700,
          color: "#6E6659",
        }}
      >
        You are invited
      </div>

      {/* Brand lockup, exactly the website: sun, SOLRAY, living by design. */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: 0,
          right: 0,
          transform: "translateY(-50%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/solray-orb.png"
          alt=""
          width={300}
          height={300}
          style={{ width: "300px", height: "300px", objectFit: "contain", marginBottom: "44px", filter: "drop-shadow(0 22px 30px rgb(var(--rgb-indigo) / .28))" }}
        />
        <Wordmark size={130} />
        <div
          style={{
            fontFamily: 'var(--font-heading), "Zen Kaku Gothic New", system-ui, sans-serif',
            fontWeight: 700,
            fontSize: "48px",
            letterSpacing: "-0.02em",
            color: "#5C5548",
            marginTop: "18px",
          }}
        >
          living by design
        </div>
      </div>

      {/* Subline, no name. */}
      <div
        style={{
          position: "absolute",
          top: "72%",
          left: 0,
          right: 0,
          textAlign: "center",
          padding: "0 120px",
          fontFamily: 'var(--font-heading), "Zen Kaku Gothic New", system-ui, sans-serif',
          fontSize: "50px",
          fontWeight: 700,
          lineHeight: 1.3,
          letterSpacing: "-0.02em",
          color: "#5C5548",
        }}
      >
        Read your chart against today,
        <br />
        and the people in your life.
      </div>

      {/* Invite code + url. */}
      <div
        style={{ position: "absolute", bottom: "140px", left: 0, right: 0, textAlign: "center" }}
      >
        {code ? (
          <div
            style={{
              fontFamily: 'var(--font-heading), "Zen Kaku Gothic New", system-ui, sans-serif',
              fontSize: "44px",
              fontWeight: 700,
              letterSpacing: "0.06em",
              color: "#22201C",
              marginBottom: "18px",
            }}
          >
            join with code{" "}
            <span style={{ color: "rgb(var(--rgb-amber) / 0.95)", letterSpacing: "0.18em" }}>{code}</span>
          </div>
        ) : null}
        <div
          style={{
            fontFamily: 'var(--font-body), "Zen Kaku Gothic New", system-ui, sans-serif',
            fontSize: "26px",
            letterSpacing: "0.25em",
            color: "#6E6659",
            fontWeight: 700,
            textTransform: "lowercase",
          }}
        >
          solray.ai
        </div>
      </div>
    </div>
  );
}
