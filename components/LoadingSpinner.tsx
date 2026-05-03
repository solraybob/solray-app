// Spinner uses aged-pigment palette.
// sm: used inside buttons (send, accept), amber-sun top arc on transparent track
// md: used in page-level loading areas, wisteria top arc on forest border
// lg: full-page centred loader, amber-sun on forest border
export default function LoadingSpinner({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  if (size === "sm") {
    return (
      <div className="w-4 h-4 rounded-full border border-transparent border-t-amber-sun/80 animate-spin" />
    );
  }
  if (size === "lg") {
    return (
      <div className="w-12 h-12 rounded-full border-2 border-forest-border/40 border-t-amber-sun animate-spin" />
    );
  }
  // md default, wisteria tone for mid-level loaders
  return (
    <div className="w-8 h-8 rounded-full border-2 border-forest-border/40 border-t-wisteria animate-spin" />
  );
}
