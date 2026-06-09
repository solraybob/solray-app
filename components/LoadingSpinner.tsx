// Spinner uses aged-pigment palette.
// sm: used inside buttons (send, accept), amber-sun top arc on transparent track
// md: used in page-level loading areas, wisteria top arc on forest border
// lg: full-page centred loader, amber-sun on forest border
//
// Track color runs through --spinner-track-alpha (globals.css): 0.4 on the
// dark forest, 1.0 on pearl, where a 40% tan hairline is invisible. The top
// arc uses the theme tokens directly, so it deepens automatically in light.
export default function LoadingSpinner({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  if (size === "sm") {
    return (
      <div className="w-4 h-4 rounded-full border border-transparent border-t-amber-sun/80 animate-spin" />
    );
  }
  const track = "rgb(var(--rgb-border) / var(--spinner-track-alpha))";
  if (size === "lg") {
    return (
      <div
        className="w-12 h-12 rounded-full border-2 animate-spin"
        style={{ borderColor: track, borderTopColor: "rgb(var(--rgb-amber))" }}
      />
    );
  }
  // md default, wisteria tone for mid-level loaders
  return (
    <div
      className="w-8 h-8 rounded-full border-2 animate-spin"
      style={{ borderColor: track, borderTopColor: "rgb(var(--rgb-wisteria))" }}
    />
  );
}
