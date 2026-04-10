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
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
      </svg>
    ),
  },
];

function DimensionCard({
  label,
  icon,
  headline,
  detail,
}: {
  label: string;
  icon: React.ReactNode;
  headline: string;
  detail: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      onClick={() => setOpen(v => !v)}
      className="cursor-pointer transition-all duration-300"
      style={{
        background: "#0a1f12",
        border: `1px solid ${open ? "#e8821a" : "rgba(26,48,32,0.8)"}`,
        borderRadius: "14px",
        padding: "16px",
        marginBottom: "8px",
      }}
    >
      {/* Header row */}
      <div className="flex items-center gap-2 mb-3">
        <span style={{ color: "#e8821a" }}>{icon}</span>
        <span
          className="font-body uppercase"
          style={{ fontSize: "0.6rem", letterSpacing: "0.15em", color: "#8a9e8d" }}
        >
          {label}
        </span>
        {/* Arrow */}
        <span
          className="ml-auto"
          style={{
            color: open ? "#e8821a" : "#4a5e4d",
            fontSize: "0.75rem",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.3s ease, color 0.2s ease",
            display: "inline-block",
          }}
        >
          ▼
        </span>
      </div>

      {/* Headline — always visible */}
      <p
        className="font-body font-medium"
        style={{ fontSize: "0.9rem", color: "#e8e0cc", lineHeight: 1.5 }}
      >
        {headline}
      </p>

      {/* Body — only when expanded */}
      {open && (
        <div
          style={{
            marginTop: "12px",
            paddingTop: "12px",
            borderTop: "1px solid rgba(26,48,32,0.8)",
          }}
        >
          <p
            className="font-body"
            style={{
              fontSize: "0.82rem",
              color: detail ? "#8a9e8d" : "rgba(138,158,141,0.45)",
              lineHeight: 1.8,
              fontStyle: detail ? "normal" : "italic",
            }}
          >
            {detail || "Deeper interpretation coming soon."}
          </p>
        </div>
      )}
    </div>
  );
}

export default function DepthSlides({ tags, tagDetails }: DepthSlidesProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div>
      {/* Section header — taps to show/hide all cards */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center justify-between mb-3"
        style={{ background: "none", border: "none", cursor: "pointer" }}
      >
        <p className="font-body text-text-secondary text-xs tracking-[0.2em] uppercase">
          Today&apos;s Dimensions
        </p>
        <span style={{ color: "#4a5e4d", fontSize: "0.85rem" }}>
          {collapsed ? "∧" : "∨"}
        </span>
      </button>

      {/* Cards — visible by default, each taps to expand body */}
      {!collapsed && (
        <div>
          {SLIDES.map(({ key, label, icon }) => (
            <DimensionCard
              key={key}
              label={label}
              icon={icon}
              headline={tags[key] || ""}
              detail={tagDetails?.[key] || ""}
            />
          ))}
        </div>
      )}
    </div>
  );
}
