"use client";

/**
 * AstroGlyphs — minimalist SVG line-art versions of the 12 zodiac signs and
 * the classical planets. We draw these as path data instead of using the
 * unicode glyphs (♈-♓, ☉-♇) because those render as color emoji on iOS and
 * many Android builds, which conflicts with Solray's no-emoji rule.
 *
 * Every glyph is designed in a 24x24 viewBox with a 1px stroke, meant to
 * look clean at ~16-18 px on screen. Stroke color is inherited via
 * `currentColor` so callers can recolor in one line.
 */

import React from "react";

// Sign glyphs keyed by zero-based index (0 = Aries, 11 = Pisces).
// Hand-drawn minimalist line art, not traditional typography.
const SIGN_PATHS: Record<number, React.ReactElement> = {
  // Aries: two curved horns meeting at center
  0: (
    <>
      <path d="M 4 16 Q 4 6 9 6 Q 12 6 12 12" fill="none" />
      <path d="M 20 16 Q 20 6 15 6 Q 12 6 12 12" fill="none" />
    </>
  ),
  // Taurus: circle with horns on top
  1: (
    <>
      <circle cx={12} cy={15} r={5} fill="none" />
      <path d="M 5 9 Q 12 3 19 9" fill="none" />
    </>
  ),
  // Gemini: Roman II with top and bottom bars
  2: (
    <>
      <path d="M 7 5 H 17 M 7 19 H 17 M 10 5 V 19 M 14 5 V 19" fill="none" />
    </>
  ),
  // Cancer: two circles with curling tails (simplified 69)
  3: (
    <>
      <circle cx={8} cy={10} r={2.2} fill="none" />
      <circle cx={16} cy={14} r={2.2} fill="none" />
      <path d="M 4 10 Q 4 6 8 6" fill="none" />
      <path d="M 20 14 Q 20 18 16 18" fill="none" />
    </>
  ),
  // Leo: spiral head with descending tail
  4: (
    <>
      <circle cx={10} cy={10} r={4} fill="none" />
      <path d="M 14 11 C 17 13 19 16 19 19" fill="none" />
    </>
  ),
  // Virgo: M with an inward curl on the last stroke
  5: (
    <>
      <path d="M 4 19 V 7 L 9 16 V 7 L 14 16 V 7" fill="none" />
      <path d="M 14 16 Q 18 16 18 12 Q 18 8 14 10" fill="none" />
    </>
  ),
  // Libra: horizontal bar with a dome above
  6: (
    <>
      <path d="M 4 19 H 20" fill="none" />
      <path d="M 6 14 H 18" fill="none" />
      <path d="M 8 14 A 4 4 0 0 1 16 14" fill="none" />
    </>
  ),
  // Scorpio: M with arrow-tail flicking up
  7: (
    <>
      <path d="M 4 19 V 8 L 8 14 L 12 8 V 19 L 16 15 L 20 18" fill="none" />
      <path d="M 20 18 L 20 14 M 20 18 L 16 18" fill="none" />
    </>
  ),
  // Sagittarius: diagonal arrow with a crossbar
  8: (
    <>
      <path d="M 5 19 L 19 5" fill="none" />
      <path d="M 19 5 L 14 5 M 19 5 L 19 10" fill="none" />
      <path d="M 9 15 L 15 9" fill="none" />
    </>
  ),
  // Capricorn: V with a curling tail
  9: (
    <>
      <path d="M 4 6 L 10 18 L 14 10" fill="none" />
      <path d="M 14 10 Q 18 10 18 14 Q 18 18 14 18 Q 16 16 14 14" fill="none" />
    </>
  ),
  // Aquarius: two wavy lines
  10: (
    <>
      <path d="M 4 10 Q 7 6 10 10 T 16 10 T 20 10" fill="none" />
      <path d="M 4 16 Q 7 12 10 16 T 16 16 T 20 16" fill="none" />
    </>
  ),
  // Pisces: two arcs joined by a bar
  11: (
    <>
      <path d="M 5 5 Q 9 12 5 19" fill="none" />
      <path d="M 19 5 Q 15 12 19 19" fill="none" />
      <path d="M 6 12 H 18" fill="none" />
    </>
  ),
};

// Planet glyphs keyed by canonical name used in the backend.
const PLANET_PATHS: Record<string, React.ReactElement> = {
  // Sun: circle with center dot
  Sun: (
    <>
      <circle cx={12} cy={12} r={8} fill="none" />
      <circle cx={12} cy={12} r={1.6} fill="currentColor" stroke="none" />
    </>
  ),
  // Moon: waxing crescent
  Moon: (
    <>
      <path d="M 16 4 A 9 9 0 1 0 16 20 A 6 6 0 1 1 16 4 Z" fill="none" />
    </>
  ),
  // Mercury: horned circle with cross below
  Mercury: (
    <>
      <path d="M 7 3 A 5 5 0 0 0 17 3" fill="none" />
      <circle cx={12} cy={10} r={4} fill="none" />
      <path d="M 12 14 V 21 M 9 18 H 15" fill="none" />
    </>
  ),
  // Venus: circle over cross
  Venus: (
    <>
      <circle cx={12} cy={8} r={5} fill="none" />
      <path d="M 12 13 V 21 M 9 17 H 15" fill="none" />
    </>
  ),
  // Mars: circle with arrow pointing upper right
  Mars: (
    <>
      <circle cx={10} cy={14} r={5} fill="none" />
      <path d="M 13.5 10.5 L 20 4" fill="none" />
      <path d="M 20 4 L 15 4 M 20 4 L 20 9" fill="none" />
    </>
  ),
  // Jupiter: "4"-like curve with horizontal cross
  Jupiter: (
    <>
      <path d="M 5 9 Q 8 4 12 8 V 20" fill="none" />
      <path d="M 4 20 H 20" fill="none" />
    </>
  ),
  // Saturn: cross on top with an "h"-tail
  Saturn: (
    <>
      <path d="M 8 4 V 20 M 4 8 H 12" fill="none" />
      <path d="M 12 12 Q 16 12 16 16 Q 16 20 12 20" fill="none" />
    </>
  ),
  // Uranus: H-shape with circle below
  Uranus: (
    <>
      <path d="M 6 4 V 12 M 18 4 V 12 M 6 12 H 18 M 12 12 V 17" fill="none" />
      <circle cx={12} cy={19} r={2} fill="none" />
    </>
  ),
  // Neptune: trident
  Neptune: (
    <>
      <path d="M 5 6 V 10 Q 5 14 12 14 Q 19 14 19 10 V 6" fill="none" />
      <path d="M 12 4 V 20 M 8 18 H 16" fill="none" />
    </>
  ),
  // Pluto: circle over cross with dome above
  Pluto: (
    <>
      <path d="M 7 10 A 5 5 0 0 1 17 10 V 14 H 7 Z" fill="none" />
      <path d="M 12 14 V 21 M 9 18 H 15" fill="none" />
    </>
  ),
};

interface GlyphProps {
  type: "sign" | "planet";
  id: number | string;
  x: number;
  y: number;
  size: number;
  color: string;
  strokeWidth?: number;
  opacity?: number;
}

/**
 * Renders a sign or planet glyph centered at (x, y).
 *
 * Internally scales the 24x24 source path by (size / 24) and translates so
 * the glyph is visually centered. `color` is applied to both stroke and
 * currentColor-filled bits (like the Sun's center dot).
 */
export function Glyph({ type, id, x, y, size, color, strokeWidth = 1, opacity = 1 }: GlyphProps) {
  const element = type === "sign" ? SIGN_PATHS[id as number] : PLANET_PATHS[id as string];
  if (!element) return null;
  const scale = size / 24;
  return (
    <g
      transform={`translate(${x - size / 2} ${y - size / 2}) scale(${scale})`}
      stroke={color}
      strokeWidth={strokeWidth / scale}
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity={opacity}
      style={{ color }}
    >
      {element}
    </g>
  );
}

export default Glyph;
