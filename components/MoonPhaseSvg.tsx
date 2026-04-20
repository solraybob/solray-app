"use client";

/**
 * MoonPhaseSvg
 *
 * Dormant component. Not currently imported anywhere. Kept because the
 * moon phase is deliberately the single emoji-allowed element in the
 * Solray UI (see MoonCycleBar in app/today/page.tsx); if that policy
 * ever flips, for example to match a surface where color emoji clash
 * with a forest-dark background, this component renders the phase as
 * pure SVG with an amber lit side over a dark disk.
 *
 * phase is a value in [0, 1]:
 *   0.00  new moon       (dark)
 *   0.25  first quarter  (right half lit)
 *   0.50  full moon      (entirely lit)
 *   0.75  third quarter  (left half lit)
 *
 * Path construction:
 *   - Outer limb is always a semicircle of radius r on the lit side.
 *   - Terminator is an ellipse with horizontal semi-axis |cos(2 pi phase)| * r.
 *   - Sweep flags flip between crescent (mag > 0) and gibbous (mag < 0)
 *     and again between waxing (phase < 0.5) and waning (phase >= 0.5).
 */

interface MoonPhaseSvgProps {
  phase: number;
  size?: number;
  lit?: string;
  dark?: string;
  stroke?: string;
}

export default function MoonPhaseSvg({
  phase,
  size = 22,
  lit = "#f0dcc0",
  dark = "#141f1a",
  stroke = "rgba(240,220,192,0.35)",
}: MoonPhaseSvgProps) {
  const r = size / 2 - 0.75;
  const p = ((phase % 1) + 1) % 1;

  const mag = Math.cos(p * 2 * Math.PI);
  const absMag = Math.abs(mag);
  const waxing = p < 0.5;

  const sweep1 = waxing ? 1 : 0;
  const sweep2 = waxing ? (mag > 0 ? 1 : 0) : (mag > 0 ? 0 : 1);

  const path =
    `M 0 ${-r} ` +
    `A ${r} ${r} 0 0 ${sweep1} 0 ${r} ` +
    `A ${absMag * r} ${r} 0 0 ${sweep2} 0 ${-r} Z`;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`}
      aria-hidden="true"
      style={{ display: "inline-block", verticalAlign: "middle" }}
    >
      <circle cx={0} cy={0} r={r} fill={dark} />
      <path d={path} fill={lit} />
      <circle cx={0} cy={0} r={r} fill="none" stroke={stroke} strokeWidth={0.8} />
    </svg>
  );
}
