"use client";

import Image from "next/image";

/**
 * The Solray lockup, in one place.
 *
 * Lowercase, set in the display face at 700, the orb standing in for the o at
 * 1ex so it sits on the x-height rather than floating. This is the mark the
 * connector and the website carry; before this component the app had four
 * different ones (a spiky sun PNG, a cropped logo.jpg, SOLRAY letterspaced at
 * weight 300, and this lockup hand-written on the entry pages).
 *
 * `size` is the type size in px; the orb follows it automatically.
 */
export function Wordmark({
  size = 20,
  className = "",
  style,
}: {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      className={`font-heading inline-flex items-baseline ${className}`}
      style={{ fontSize: size, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1, ...style }}
      aria-label="Solray"
    >
      <span aria-hidden>s</span>
      <Image
        src="/solray-orb.png"
        alt=""
        width={Math.round(size)}
        height={Math.round(size)}
        unoptimized
        style={{ width: "1ex", height: "1ex", objectFit: "contain", margin: "0 .01em", transform: "translateY(.02em)" }}
      />
      <span aria-hidden>lray</span>
    </span>
  );
}

/**
 * The orb on its own, for the places that want the mark without the name:
 * a loading state, a takeover, an avatar slot.
 */
export function Orb({
  size = 48,
  className = "",
  style,
}: {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <Image
      src="/solray-orb.png"
      alt=""
      width={size}
      height={size}
      unoptimized
      className={className}
      style={{ width: size, height: size, objectFit: "contain", filter: "drop-shadow(0 14px 22px rgba(84,63,150,.26))", ...style }}
    />
  );
}

export default Wordmark;
