"use client";

/**
 * AstroGlyphs — SVG line-art for the 12 zodiac signs and classical planets.
 *
 * Unicode glyphs (♈-♓, ☉-♇) render as color emoji on iOS and many Android
 * builds, which conflicts with Solray's no-emoji rule. Every symbol here is
 * hand-drawn in a 24x24 viewBox with round caps/joins, designed to stay clean
 * at 12-18px on screen.
 */

import React from "react";

// ---------------------------------------------------------------------------
// Zodiac sign paths (index 0 = Aries … 11 = Pisces)
// ---------------------------------------------------------------------------
const SIGN_PATHS: Record<number, React.ReactElement> = {
  // Aries ♈ — two horn arcs sweeping up from a shared center, meeting at a Y
  0: (
    <>
      <path d="M 12 17 C 7 16 4 10 6 5 C 7 2 10 2 12 6" fill="none" />
      <path d="M 12 17 C 17 16 20 10 18 5 C 17 2 14 2 12 6" fill="none" />
    </>
  ),

  // Taurus ♉ — circle with wide arching horns above
  1: (
    <>
      <circle cx={12} cy={15} r={5} fill="none" />
      <path d="M 7 15 C 7 6 17 6 17 15" fill="none" />
    </>
  ),

  // Gemini ♊ — twin pillars with gently curved top and bottom rails
  2: (
    <>
      <path d="M 5 4 Q 12 2 19 4" fill="none" />
      <path d="M 5 20 Q 12 22 19 20" fill="none" />
      <path d="M 9 4 V 20" fill="none" />
      <path d="M 15 4 V 20" fill="none" />
    </>
  ),

  // Cancer ♋ — interlocking 6-9: two offset circles with curling tails
  3: (
    <>
      <circle cx={9.5} cy={9.5} r={3.5} fill="none" />
      <circle cx={14.5} cy={14.5} r={3.5} fill="none" />
      <path d="M 6 9.5 C 4 6.5 6.5 4 9.5 5.5" fill="none" />
      <path d="M 18 14.5 C 20 17.5 17.5 20 14.5 18.5" fill="none" />
    </>
  ),

  // Leo ♌ — circle with a spiral curling tail
  4: (
    <>
      <circle cx={9} cy={11} r={5} fill="none" />
      <path d="M 14 11 C 18 11 20 14 20 17 C 20 20 17 21 15 20 C 13 19 13 17 15 17" fill="none" />
    </>
  ),

  // Virgo ♍ — three arch-tops, last right leg closes into a loop
  5: (
    <>
      <path d="M 4 7 V 19" fill="none" />
      <path d="M 4 7 C 4 3 9 3 9 7 V 19" fill="none" />
      <path d="M 9 7 C 9 3 14 3 14 7 V 14 C 14 20 20 20 20 14 C 20 10 17 9 14 11" fill="none" />
    </>
  ),

  // Libra ♎ — dome arc resting on two horizon lines
  6: (
    <>
      <path d="M 7 13 C 7 6 17 6 17 13" fill="none" />
      <path d="M 3 13 H 21" fill="none" />
      <path d="M 3 19 H 21" fill="none" />
    </>
  ),

  // Scorpio ♏ — three arched humps, tail sweeps into a downward arrow
  7: (
    <>
      <path d="M 3 15 V 7 C 3 3 8 3 8 7 C 8 3 13 3 13 7 V 12" fill="none" />
      <path d="M 13 12 L 20 18" fill="none" />
      <path d="M 16 14 L 20 18 L 17 22" fill="none" />
    </>
  ),

  // Sagittarius ♐ — diagonal arrow pointing upper-right with clean arrowhead
  8: (
    <>
      <path d="M 5 19 L 19 5" fill="none" />
      <path d="M 12 5 H 19 V 12" fill="none" />
    </>
  ),

  // Capricorn ♑ — V left leg descends, right horn curves into a fish tail
  9: (
    <>
      <path d="M 4 5 L 11 17" fill="none" />
      <path d="M 11 17 C 14 17 16 14 16 11 C 16 8 14 7 12 8" fill="none" />
      <path d="M 11 5 C 17 4 21 7 20 12 C 19 16 17 18 15 18" fill="none" />
    </>
  ),

  // Aquarius ♒ — two parallel wave-lines
  10: (
    <>
      <path d="M 3 9 Q 6 5 9 9 Q 12 13 15 9 Q 18 5 21 9" fill="none" />
      <path d="M 3 15 Q 6 11 9 15 Q 12 19 15 15 Q 18 11 21 15" fill="none" />
    </>
  ),

  // Pisces ♓ — two opposing arcs connected by a center bar
  11: (
    <>
      <path d="M 7 3 C 3 7 3 17 7 21" fill="none" />
      <path d="M 17 3 C 21 7 21 17 17 21" fill="none" />
      <path d="M 5 12 H 19" fill="none" />
    </>
  ),
};

// ---------------------------------------------------------------------------
// Planet paths keyed by backend name
// ---------------------------------------------------------------------------
const PLANET_PATHS: Record<string, React.ReactElement> = {
  // ASC — ascending arrow rising from a horizontal base
  ASC: (
    <>
      <path d="M 4 20 H 20" fill="none" />
      <path d="M 12 18 V 5" fill="none" />
      <path d="M 7 10 L 12 5 L 17 10" fill="none" />
    </>
  ),

  // Sun ☉ — circle with filled center dot
  Sun: (
    <>
      <circle cx={12} cy={12} r={8} fill="none" />
      <circle cx={12} cy={12} r={1.8} fill="currentColor" stroke="none" />
    </>
  ),

  // Moon ☽ — waxing crescent (large arc eclipsed by smaller)
  Moon: (
    <>
      <path d="M 16 4 A 9 9 0 1 0 16 20 A 6 6 0 1 1 16 4 Z" fill="none" />
    </>
  ),

  // Mercury ☿ — horned arc above a circle, cross below
  Mercury: (
    <>
      <path d="M 7 4 A 5 5 0 0 0 17 4" fill="none" />
      <circle cx={12} cy={11} r={4} fill="none" />
      <path d="M 12 15 V 21 M 9 18 H 15" fill="none" />
    </>
  ),

  // Venus ♀ — circle above a cross
  Venus: (
    <>
      <circle cx={12} cy={8} r={5} fill="none" />
      <path d="M 12 13 V 21 M 9 17 H 15" fill="none" />
    </>
  ),

  // Mars ♂ — circle with upper-right arrow
  Mars: (
    <>
      <circle cx={10} cy={14} r={5} fill="none" />
      <path d="M 14 10 L 20 4" fill="none" />
      <path d="M 14 4 H 20 V 10" fill="none" />
    </>
  ),

  // Jupiter ♃ — curved left arm crossing a vertical stroke at a horizontal bar
  Jupiter: (
    <>
      <path d="M 15 3 V 21" fill="none" />
      <path d="M 4 15 H 21" fill="none" />
      <path d="M 4 15 C 4 8 8 4 14 4" fill="none" />
    </>
  ),

  // Saturn ♄ — vertical stroke with a cross-arm near top and hook at bottom-right
  Saturn: (
    <>
      <path d="M 10 3 V 21 M 6 8 H 14" fill="none" />
      <path d="M 14 14 Q 18 14 18 18 Q 18 22 14 22" fill="none" />
    </>
  ),

  // Uranus ♅ — H-frame with a small circle beneath the crossbar
  Uranus: (
    <>
      <path d="M 6 3 V 12 M 18 3 V 12 M 6 12 H 18 M 12 12 V 17" fill="none" />
      <circle cx={12} cy={20} r={2.5} fill="none" />
    </>
  ),

  // Neptune ♆ — trident: upward fork on a cross with a base
  Neptune: (
    <>
      <path d="M 12 3 V 21 M 8 19 H 16" fill="none" />
      <path d="M 4 9 C 4 5 12 3 12 9" fill="none" />
      <path d="M 20 9 C 20 5 12 3 12 9" fill="none" />
      <path d="M 8 7 V 11 M 16 7 V 11" fill="none" />
    </>
  ),

  // Pluto ♇ — dome over a circle over a cross
  Pluto: (
    <>
      <path d="M 7 9 A 5 5 0 0 1 17 9" fill="none" />
      <circle cx={12} cy={13} r={3} fill="none" />
      <path d="M 12 16 V 22 M 9 19 H 15" fill="none" />
    </>
  ),

  // NorthNode — upward horseshoe with base circles
  NorthNode: (
    <>
      <path d="M 5 16 V 10 A 7 7 0 0 1 19 10 V 16" fill="none" />
      <circle cx={5} cy={16} r={2} fill="none" />
      <circle cx={19} cy={16} r={2} fill="none" />
    </>
  ),

  // Chiron — key-like: vertical line with a K-shaped curve
  Chiron: (
    <>
      <path d="M 8 3 V 21" fill="none" />
      <path d="M 8 10 C 11 8 16 9 17 12 C 18 15 14 17 8 15" fill="none" />
    </>
  ),
};

// ---------------------------------------------------------------------------
// Glyph renderer
// ---------------------------------------------------------------------------

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
 * Renders a sign or planet glyph centered at (x, y) inside an existing SVG.
 * All paths are drawn in a 24x24 source viewBox; this component scales and
 * translates to place them at the requested size and position.
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
