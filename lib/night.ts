import type { CSSProperties } from "react";

/**
 * NIGHT_SURFACE: pin the dark-theme tokens on any subtree that renders
 * over a photograph.
 *
 * Text sitting on imagery always needs the night palette, regardless of
 * the active app theme. Without this, light mode flips text-primary to
 * near-black ink while the photo behind it stays dark, which makes the
 * hero title and cycle-card lettering unreadable.
 *
 * CSS custom properties cascade, so spreading this object into the photo
 * container's style re-declares the dark values locally: every Tailwind
 * token class (text-text-primary, bg-forest-border, ...) and every inline
 * var(--amber) inside the subtree resolves to the night value in both
 * themes. Content OUTSIDE the photo container keeps following the theme.
 */
export const NIGHT_SURFACE = {
  "--rgb-bg-deep": "5 15 8",
  "--rgb-bg-dark": "7 21 16",
  "--rgb-card": "10 31 18",
  "--rgb-border": "26 48 32",
  "--rgb-amber": "243 146 48",
  "--rgb-text-primary": "242 236 216",
  "--rgb-text-secondary": "168 184 171",
  "--rgb-text-muted": "138 158 141",
  "--bg-deep": "#F5F0E6",
  "--bg-dark": "#FAF6EC",
  "--card": "#FAF6EC",
  "--border": "#E2DACA",
  "--amber": "#5A31AE",
  "--text-primary": "#22201C",
  "--text-secondary": "#5C5548",
  "--text-muted": "#6E6659",
} as CSSProperties;
