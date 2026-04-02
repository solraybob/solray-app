"use client";

import { useEffect, useState } from "react";

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
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="12" r="4"/>
        <line x1="12" y1="2" x2="12" y2="4"/>
        <line x1="12" y1="20" x2="12" y2="22"/>
        <line x1="2" y1="12" x2="4" y2="12"/>
        <line x1="20" y1="12" x2="22" y2="12"/>
        <line x1="4.93" y1="4.93" x2="6.34" y2="6.34"/>
        <line x1="17.66" y1="17.66" x2="19.07" y2="19.07"/>
        <line x1="4.93" y1="19.07" x2="6.34" y2="17.66"/>
        <line x1="17.66" y1="6.34" x2="19.07" y2="4.93"/>
      </svg>
    ),
  },
  {
    key: "human_design" as const,
    label: "Your Design",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="7" r="3"/>
        <path d="M5 21v-2a7 7 0 0 1 14 0v2"/>
      </svg>
    ),
  },
  {
    key: "gene_keys" as const,
    label: "Your Keys",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
      </svg>
    ),
  },
];

const KEYS = ["astrology", "human_design", "gene_keys"] as const;

export default function DepthSlides({ tags, tagDetails }: DepthSlidesProps) {
  const [expandedKey, setExpandedKey] = useState<string>("astrology");

  // Set first card expanded on mount
  useEffect(() => {
    setExpandedKey("astrology");
  }, []);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    const cards = container.querySelectorAll('[data-card]');
    let activeIndex = 0;
    const containerCenter = container.scrollLeft + container.clientWidth / 2;
    cards.forEach((card, i) => {
      const el = card as HTMLElement;
      const cardCenter = el.offsetLeft + el.offsetWidth / 2;
      if (Math.abs(cardCenter - containerCenter) < el.offsetWidth / 2) {
        activeIndex = i;
      }
    });
    const keys = ["astrology", "human_design", "gene_keys"] as const;
    setExpandedKey(keys[activeIndex]);
  };

  return (
    <div>
      <p
        className="font-body uppercase mb-3"
        style={{ fontSize: "0.65rem", letterSpacing: "0.15em", color: "rgba(138,158,141,0.5)" }}
      >
        Today&apos;s Dimensions
      </p>
      <div
        className="flex gap-3 pb-2"
        style={{ overflowX: "scroll", scrollSnapType: "x mandatory", scrollbarWidth: "none", msOverflowStyle: "none" }}
        onScroll={handleScroll}
      >
        {SLIDES.map(({ key, label, icon }) => {
          const headline = tags[key] || "";
          const detail = tagDetails?.[key] || "";
          const isExpanded = expandedKey === key;

          return (
            <div
              key={key}
              data-card
              style={{
                minWidth: "72vw",
                maxWidth: "72vw",
                scrollSnapAlign: "start",
                background: "#0a1f12",
                borderLeft: `3px solid ${isExpanded ? "#e8821a" : "rgba(232, 130, 26, 0.35)"}`,
                borderRadius: "12px",
                padding: "16px",
                transition: "all 0.3s ease",
                flexShrink: 0,
              }}
            >
              {/* Header */}
              <div className="flex items-center gap-2 mb-2">
                <span style={{ color: "#e8821a" }}>{icon}</span>
                <span
                  className="font-body uppercase"
                  style={{ fontSize: "0.6rem", letterSpacing: "0.15em", color: "#8a9e8d" }}
                >
                  {label}
                </span>
                <span
                  className="ml-auto"
                  style={{
                    color: "#8a9e8d",
                    fontSize: "0.7rem",
                    transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                    transition: "transform 0.3s",
                    display: "inline-block",
                  }}
                >
                  ∨
                </span>
              </div>

              {/* Headline */}
              <p
                className="font-body"
                style={{ fontSize: "0.85rem", color: "#f5f0e8", lineHeight: 1.5 }}
              >
                {headline}
              </p>

              {/* Expanded detail — auto-shows when card is centered */}
              {isExpanded && (
                <p
                  className="font-body mt-3"
                  style={{
                    fontSize: "0.8rem",
                    color: detail ? "#8a9e8d" : "rgba(138,158,141,0.45)",
                    lineHeight: 1.7,
                    borderTop: "1px solid rgba(26,48,32,0.8)",
                    paddingTop: "12px",
                    fontStyle: detail ? "normal" : "italic",
                  }}
                >
                  {detail || "Deeper interpretation coming soon."}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
