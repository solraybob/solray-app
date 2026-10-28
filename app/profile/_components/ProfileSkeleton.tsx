"use client";

// Skeleton

export function ProfileSkeleton() {
  return (
    <div className="max-w-lg lg:max-w-3xl mx-auto px-5 animate-pulse">
      <div className="pt-10 pb-8 flex flex-col items-center gap-3">
        <div className="w-20 h-20 rounded-full bg-forest-border/60" />
        <div className="h-3 w-24 bg-forest-border/60 rounded" />
        <div className="h-8 w-40 bg-forest-border/60 rounded" />
        <div className="flex gap-2 mt-2">
          <div className="h-6 w-20 bg-forest-border/60 rounded-full" />
          <div className="h-6 w-24 bg-forest-border/60 rounded-full" />
        </div>
      </div>
      <div className="flex justify-center mb-8">
        <div className="w-[280px] h-[280px] bg-forest-border/30 rounded-2xl" />
      </div>
      <div className="space-y-4">
        <div className="h-14 bg-forest-border/30 rounded-2xl" />
        <div className="h-14 bg-forest-border/30 rounded-2xl" />
      </div>
    </div>
  );
}
