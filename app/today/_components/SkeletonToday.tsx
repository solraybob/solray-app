"use client";

import { useT } from "@/lib/i18n";

// Skeleton components for instant perceived loading
export function SkeletonToday() {
  const { t } = useT();
  return (
    <div>
      {/* Honest loading copy. Each label is true: the planets ARE
          actually being read, the chart IS being matched, the reading
          IS being written. Replaces a silent skeleton with a small
          breath of intention so waiting feels considered, not blank.
          Codex UX hook 8. */}
      <div className="max-w-lg lg:max-w-3xl mx-auto px-5 pt-6 pb-1 text-center">
        <p
          className="font-body text-[14px] tracking-[0.3em] uppercase font-bold"
          style={{ color: "var(--amber)" }}
        >
          {t("today.reading_sky")}
        </p>
      </div>

      {/* Hero skeleton, matches real hero: padded, rounded-2xl, 160px */}
      <div className="max-w-lg lg:max-w-3xl mx-auto px-5 pt-3">
        <div className="w-full h-[160px] bg-forest-card skeleton-shimmer rounded-2xl" />
      </div>

      <div className="max-w-lg lg:max-w-3xl mx-auto px-5">
        {/* Energy bars skeleton */}
        <div className="mb-8 mt-8 space-y-4">
          {["Mental", "Emotional", "Physical", "Intuitive"].map((label) => (
            <div key={label} className="flex items-center gap-3">
              <span className="text-text-secondary text-xs font-body w-20 shrink-0 tracking-wider uppercase opacity-40 font-bold">
                {t(`today.${label.toLowerCase()}`)}
              </span>
              <div className="flex-1 h-1.5 bg-forest-border rounded-full overflow-hidden">
                <div className="h-full w-0 bg-amber-sun rounded-full" />
              </div>
              <span className="text-text-secondary text-xs font-body w-4 text-right opacity-0">0</span>
            </div>
          ))}
        </div>

        {/* Divider */}
        <div className="border-t border-forest-border/40 mb-8" />

        {/* Reading skeleton, 4 lines */}
        <div className="pb-8 space-y-3">
          <div className="skeleton-shimmer h-4 w-full rounded" />
          <div className="skeleton-shimmer h-4 w-full rounded" />
          <div className="skeleton-shimmer h-4 w-5/6 rounded" />
          <div className="skeleton-shimmer h-4 w-3/4 rounded" />
        </div>

        {/* Tags skeleton */}
        <div className="flex flex-wrap gap-2 mb-10">
          <div className="skeleton-shimmer h-7 w-32 rounded-full" />
          <div className="skeleton-shimmer h-7 w-28 rounded-full" />
          <div className="skeleton-shimmer h-7 w-24 rounded-full" />
        </div>

        {/* Planet strip skeleton */}
        <div className="mb-6">
          <div className="skeleton-shimmer h-3 w-16 rounded mb-3" />
          <div className="flex gap-2.5 overflow-hidden">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton-shimmer min-w-[76px] h-[90px] rounded-2xl" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
