"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n";

interface DepthSlidesProps {
  tags: {
    astrology: string;
    human_design: string;
    gene_keys: string;
  };
  tagDetails?: {
    astrology?: string;
    human_design?: string;
    gene_keys?: string;
  };
}

const SLIDES = [
  {
    key: "astrology" as const,
    labelKey: "depth.the_sky",
    rgb: "var(--rgb-amber)",
    wash: "radial-gradient(ellipse 80% 140% at 50% 0%, rgba(252,180,156,.24), transparent 74%)",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="12" r="4"/>
        <line x1="12" y1="2" x2="12" y2="4"/>
        <line x1="12" y1="20" x2="12" y2="22"/>
        <line x1="2" y1="12" x2="4" y2="12"/>
        <line x1="20" y1="12" x2="22" y2="12"/>
      </svg>
    ),
  },
  {
    key: "human_design" as const,
    labelKey: "depth.your_design",
    rgb: "var(--rgb-mist)",
    wash: "radial-gradient(ellipse 80% 140% at 50% 0%, rgba(74,46,158,.20), transparent 74%)",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="7" r="3"/>
        <path d="M5 21v-2a7 7 0 0 1 14 0v2"/>
      </svg>
    ),
  },
  {
    key: "gene_keys" as const,
    labelKey: "depth.your_keys",
    rgb: "var(--rgb-wisteria)",
    wash: "radial-gradient(ellipse 80% 140% at 50% 0%, rgba(176,46,114,.20), transparent 74%)",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
      </svg>
    ),
  },
];

export default function DepthSlides({ tags, tagDetails }: DepthSlidesProps) {
  const { t } = useT();
  const [openKeys, setOpenKeys] = useState<Set<string>>(new Set());
  const [activeIndex, setActiveIndex] = useState(0);

  const toggleOpen = (key: string) => {
    setOpenKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    const scrollLeft = container.scrollLeft;
    const cardWidth = container.clientWidth;
    const index = Math.round(scrollLeft / cardWidth);
    setActiveIndex(index);
  };

  return (
    <div>
      {/* Swipeable strip */}
      <div
        className="-mx-5"
        style={{ position: "relative" }}
      >
        <div
          className="flex overflow-x-auto px-5"
          style={{
            scrollSnapType: "x mandatory",
            scrollbarWidth: "none",
            msOverflowStyle: "none",
            WebkitOverflowScrolling: "touch",
            gap: "12px",
          }}
          onScroll={handleScroll}
        >
          {SLIDES.map(({ key, labelKey, icon, rgb, wash }) => {
            const label = t(labelKey);
            const headline = tags[key] || "";
            const detail = tagDetails?.[key] || "";
            const isOpen = openKeys.has(key);

            return (
              <div
                key={key}
                onClick={() => toggleOpen(key)}
                className="cursor-pointer flex-shrink-0 transition-all duration-300"
                style={{
                  width: "calc(100vw - 40px)",
                  scrollSnapAlign: "start",
                  border: `1px solid ${isOpen ? `rgb(${rgb})` : "rgb(var(--rgb-border))"}`,
                  borderRadius: "14px",
                  overflow: "hidden",
                }}
              >
                <div style={{ position: "relative", minHeight: "110px", background: `${wash}, rgb(var(--rgb-card))` }}>
                  {/* Content */}
                  <div style={{ position: "relative", zIndex: 10, padding: "16px" }}>
                    {/* Label row */}
                    <div className="flex items-center gap-2 mb-3">
                      <span style={{ color: `rgb(${rgb})` }}>{icon}</span>
                      <span className="font-body text-[14px] uppercase tracking-[0.22em] font-bold" style={{ color: `rgb(${rgb})`, fontWeight: 700 }}>
                        {label}
                      </span>
                      <span
                        className="ml-auto"
                        style={{
                          color: `rgb(${rgb} / ${isOpen ? 1 : 0.7})`,
                          fontSize: "0.85rem",
                          transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                          transition: "transform 0.3s ease",
                          display: "inline-block",
                        }}
                      >
                        ▼
                      </span>
                    </div>
                    {/* Headline */}
                    <p className="font-body text-[17px] font-medium leading-relaxed" style={{ color: "var(--text-primary)" }}>
                      {headline}
                    </p>
                  </div>
                </div>

                {/* Expanded reading, on the card plane */}
                {isOpen && (
                  <div style={{ background: "rgb(var(--rgb-card))", padding: "16px", borderTop: "1px solid rgb(var(--rgb-border))" }}>
                    <p
                      className="font-body text-[17px] leading-relaxed"
                      style={{
                        color: "var(--text-secondary)",
                        opacity: detail ? 1 : 0.5,
                        fontWeight: detail ? 500 : 700,
                      }}
                    >
                      {detail || t("depth.coming_soon")}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Dot indicators */}
      <div className="flex justify-center gap-1.5 mt-3">
        {SLIDES.map((s, i) => (
          <div
            key={s.key}
            style={{
              width: i === activeIndex ? 16 : 6,
              height: 6,
              borderRadius: 9999,
              background: i === activeIndex ? `rgb(${s.rgb})` : "rgb(var(--rgb-border))",
              transition: "all 0.3s ease",
            }}
          />
        ))}
      </div>
    </div>
  );
}
