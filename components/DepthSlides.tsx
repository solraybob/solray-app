"use client";

import { useState } from "react";

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
    label: "The Sky",
    color: "#e8821a",
    // Warm candlelight amber — golden glow matching the color
    image: "https://images.unsplash.com/photo-1516912481808-3406841bd33c?auto=format&fit=crop&w=800&q=60",
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
    label: "Your Design",
    color: "#7a8a9a", // mist — mental blueprint, cool geometric
    // Earth from space — the cosmic blueprint of a body
    image: "https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?auto=format&fit=crop&w=800&q=60",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="7" r="3"/>
        <path d="M5 21v-2a7 7 0 0 1 14 0v2"/>
      </svg>
    ),
  },
  {
    key: "gene_keys" as const,
    label: "Your Keys",
    color: "#7d6680", // wisteria — mystical keys, transformative
    // Moon — the inner world, mystery, threshold
    image: "https://images.unsplash.com/photo-1532693322450-2cb5c511067d?auto=format&fit=crop&w=800&q=60",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
      </svg>
    ),
  },
];

export default function DepthSlides({ tags, tagDetails }: DepthSlidesProps) {
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
          {SLIDES.map(({ key, label, icon, color, image }) => {
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
                  border: `1px solid ${isOpen ? color : `${color}35`}`,
                  borderRadius: "14px",
                  overflow: "hidden",
                  // CSS multi-background: gradient on top, image behind — single property, no extra elements
                  background: `linear-gradient(to bottom, rgba(5,15,8,0.55) 0%, rgba(5,15,8,0.80) 100%), url("${image}") center/cover`,
                }}
              >
                {/* Content */}
                <div style={{ padding: "16px" }}>
                  {/* Header */}
                  <div className="flex items-center gap-2 mb-3">
                    <span style={{ color }}>{icon}</span>
                    <span
                      className="font-body text-xs uppercase font-semibold tracking-widest"
                      style={{ color }}
                    >
                      {label}
                    </span>
                    <span
                      className="ml-auto"
                      style={{
                        color: isOpen ? color : `${color}70`,
                        fontSize: "0.7rem",
                        transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                        transition: "transform 0.3s ease",
                        display: "inline-block",
                      }}
                    >
                      ▼
                    </span>
                  </div>

                  {/* Headline */}
                  <p
                    className="font-body text-[13px] font-medium leading-relaxed"
                    style={{ color: "#e8e0cc" }}
                  >
                    {headline}
                  </p>

                  {/* Body — expands on tap */}
                  {isOpen && (
                    <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: `1px solid ${color}25` }}>
                      <p
                        className="font-body text-[13px] leading-relaxed"
                        style={{
                          color: detail ? "#8a9e8d" : "rgba(138,158,141,0.45)",
                          fontStyle: detail ? "normal" : "italic",
                        }}
                      >
                        {detail || "Deeper interpretation coming soon."}
                      </p>
                    </div>
                  )}
                </div>
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
              background: i === activeIndex ? s.color : "rgba(26,48,32,0.8)",
              transition: "all 0.3s ease",
            }}
          />
        ))}
      </div>
    </div>
  );
}
