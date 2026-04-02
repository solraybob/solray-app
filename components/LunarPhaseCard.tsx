"use client";

import { useState } from "react";

interface LunarEvent {
  type: "New Moon" | "Full Moon";
  sign: string;
  degree: number;
  house: number;
  house_meaning: string;
  date: string;
  days_until: number;
  is_today: boolean;
  note: string;
  expanded?: string;
}

function MoonIcon({ type }: { type: "New Moon" | "Full Moon" }) {
  if (type === "Full Moon") {
    return (
      <svg
        width="28"
        height="28"
        viewBox="0 0 28 28"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Full Moon"
      >
        <circle cx="14" cy="14" r="11" fill="#F5C842" opacity="0.92" />
        <circle cx="14" cy="14" r="11" stroke="#D4A017" strokeWidth="1.2" fill="none" />
      </svg>
    );
  }

  // New Moon — crescent
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 28 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="New Moon"
    >
      <path
        d="M14 3C8.477 3 4 7.477 4 13s4.477 10 10 10c1.5 0 2.923-.33 4.2-.923C15.56 21.29 13 17.447 13 13c0-4.447 2.56-8.29 6.2-10.077A9.963 9.963 0 0 0 14 3z"
        fill="#F5C842"
        opacity="0.92"
      />
      <path
        d="M14 3C8.477 3 4 7.477 4 13s4.477 10 10 10c1.5 0 2.923-.33 4.2-.923C15.56 21.29 13 17.447 13 13c0-4.447 2.56-8.29 6.2-10.077A9.963 9.963 0 0 0 14 3z"
        stroke="#D4A017"
        strokeWidth="1.2"
        fill="none"
      />
    </svg>
  );
}

function formatDaysUntil(days_until: number, is_today: boolean): string {
  if (is_today) return "Today";
  const rounded = Math.round(days_until);
  if (rounded === 0) return "Today";
  if (rounded === 1) return "Tomorrow";
  if (rounded === -1) return "Yesterday";
  if (rounded > 1) return `In ${rounded} days`;
  return `${Math.abs(rounded)} days ago`;
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// House themes for expansion text
const HOUSE_THEMES: Record<number, string> = {
  1: "identity, self-image, and the way you present yourself to the world",
  2: "values, resources, and what you consider truly worth having",
  3: "communication, ideas, and how you express yourself to the world",
  4: "home, roots, family, and your inner emotional foundation",
  5: "creativity, pleasure, romance, and self-expression",
  6: "daily routines, health, work, and service",
  7: "partnerships, contracts, one-on-one relationships",
  8: "transformation, shared resources, and deep psychological change",
  9: "beliefs, philosophy, travel, and the search for meaning",
  10: "career, public reputation, and your place in the world",
  11: "community, friendships, collective dreams, and belonging",
  12: "solitude, the unconscious, hidden patterns, and spiritual release",
};

function generateExpandedText(event: LunarEvent): string {
  const houseTheme = HOUSE_THEMES[event.house] || event.house_meaning || "your life";

  if (event.type === "Full Moon") {
    return `This lunation completes a chapter around ${houseTheme}. Something you have been building, saying, or working toward finally reaches its full expression — the harvest is here. This is a moment for illumination and release, not new beginnings. Let what no longer serves you go with the tide.`;
  } else {
    return `This lunation opens a fresh chapter around ${houseTheme}. The slate is clean and the soil is ready — intentions planted now carry unusual power. What you begin under this sky has the full blessing of a genuine fresh start. Set your vision clearly and take one small, deliberate step.`;
  }
}

export default function LunarPhaseCard({ event }: { event: LunarEvent }) {
  const [expanded, setExpanded] = useState(false);
  const timing = formatDaysUntil(event.days_until, event.is_today);
  const expandedText = event.expanded || generateExpandedText(event);

  return (
    <div
      className="rounded-2xl border px-4 py-4 mb-6"
      style={{
        borderColor: "rgba(212, 160, 23, 0.45)",
        background:
          "linear-gradient(135deg, rgba(20, 38, 24, 0.95) 0%, rgba(14, 28, 18, 0.98) 100%)",
        boxShadow: "0 2px 16px rgba(212, 160, 23, 0.08), inset 0 1px 0 rgba(245, 200, 66, 0.06)",
        cursor: "pointer",
        position: "relative",
        zIndex: 1,
      }}
      onClick={() => setExpanded((v) => !v)}
    >
      {/* Top row: icon + title + timing badge */}
      <div className="flex items-center gap-3 mb-2.5">
        <MoonIcon type={event.type} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="font-heading text-base leading-tight"
              style={{ color: "#F5C842", fontWeight: 400, letterSpacing: "0.01em" }}
            >
              {event.type} in {event.sign}
            </span>
            <span
              className="text-[10px] font-body tracking-wider px-2 py-0.5 rounded-full border"
              style={{
                color: "rgba(245, 200, 66, 0.85)",
                borderColor: "rgba(212, 160, 23, 0.35)",
                background: "rgba(245, 200, 66, 0.08)",
              }}
            >
              {timing}
            </span>
          </div>
          <p
            className="text-xs font-body mt-0.5"
            style={{ color: "rgba(200, 215, 200, 0.6)" }}
          >
            Illuminating your {ordinal(event.house)} house
          </p>
        </div>
      </div>

      {/* Note */}
      <p
        className="font-body text-sm leading-relaxed"
        style={{ color: "rgba(200, 215, 200, 0.82)" }}
      >
        {event.note}
      </p>

      {/* Expanded detail */}
      {expanded && (
        <p
          className="font-body text-sm leading-relaxed mt-3 pt-3"
          style={{
            color: "rgba(200, 215, 200, 0.70)",
            borderTop: "1px solid rgba(212, 160, 23, 0.18)",
          }}
        >
          {expandedText}
        </p>
      )}

      {/* Read more / Close toggle */}
      <button
        className="mt-2.5 text-[11px] font-body tracking-wider"
        style={{ color: "rgba(245, 200, 66, 0.6)", position: "relative", zIndex: 2, minHeight: "44px", display: "flex", alignItems: "center" }}
        onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
      >
        {expanded ? "Close ∧" : "Read more ∨"}
      </button>
    </div>
  );
}
