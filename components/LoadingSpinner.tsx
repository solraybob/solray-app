export default function LoadingSpinner({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const sizes = {
    sm: "w-4 h-4 border",
    md: "w-8 h-8 border-2",
    lg: "w-12 h-12 border-2",
  };

  return (
    <div
      className={`${sizes[size]} rounded-full border-forest-border border-t-amber-sun animate-spin`}
    />
  );
}
