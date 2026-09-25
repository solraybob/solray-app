// Spinner, the one look: ink arc on the hairline track.
// sm: used inside buttons, arc in currentColor so it reads on ink and on paper
// md: page-level loading areas
// lg: full-page centred loader
//
// Track color runs through --spinner-track-alpha (globals.css): 0.4 on the
// dark forest, 1.0 on pearl, where a 40% tan hairline is invisible. The top
// arc uses the theme tokens directly, so it deepens automatically in light.
export default function LoadingSpinner({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  if (size === "sm") {
    return (
      <div className="w-4 h-4 rounded-full border border-transparent animate-spin" style={{ borderTopColor: "currentColor" }} />
    );
  }
  const track = "rgb(var(--rgb-border) / var(--spinner-track-alpha))";
  if (size === "lg") {
    return (
      <div
        className="w-12 h-12 rounded-full border-2 animate-spin"
        style={{ borderColor: track, borderTopColor: "rgb(var(--rgb-text-primary))" }}
      />
    );
  }
  // md default, wisteria tone for mid-level loaders
  return (
    <div
      className="w-8 h-8 rounded-full border-2 animate-spin"
      style={{ borderColor: track, borderTopColor: "rgb(var(--rgb-text-primary))" }}
    />
  );
}
