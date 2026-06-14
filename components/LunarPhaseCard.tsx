"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n";
import { useTheme } from "@/lib/theme-context";

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

function MoonIcon({ type, fill }: { type: "New Moon" | "Full Moon"; fill: string }) {
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
        <circle cx="14" cy="14" r="11" fill={fill} opacity="0.92" />
        <circle cx="14" cy="14" r="11" stroke="#9babb9" strokeWidth="1.2" fill="none" />
      </svg>
    );
  }

  // New Moon, crescent
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
        fill={fill}
        opacity="0.92"
      />
      <path
        d="M14 3C8.477 3 4 7.477 4 13s4.477 10 10 10c1.5 0 2.923-.33 4.2-.923C15.56 21.29 13 17.447 13 13c0-4.447 2.56-8.29 6.2-10.077A9.963 9.963 0 0 0 14 3z"
        stroke="#9babb9"
        strokeWidth="1.2"
        fill="none"
      />
    </svg>
  );
}

function formatDaysUntil(days_until: number, is_today: boolean, t: (k: string) => string): string {
  if (is_today) return t("lunar.today");
  const rounded = Math.round(days_until);
  if (rounded === 0) return t("lunar.today");
  if (rounded === 1) return t("lunar.tomorrow");
  if (rounded === -1) return t("lunar.yesterday");
  if (rounded > 1) return `${t("lunar.in")} ${rounded} ${t("lunar.days")}`;
  return `${Math.abs(rounded)} ${t("lunar.days_ago")}`;
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
    return `This lunation completes a chapter around ${houseTheme}. Something you have been building, saying, or working toward finally reaches its full expression, the harvest is here. This is a moment for illumination and release, not new beginnings. Let what no longer serves you go with the tide.`;
  } else {
    return `This lunation opens a fresh chapter around ${houseTheme}. The slate is clean and the soil is ready, intentions planted now carry unusual power. What you begin under this sky has the full blessing of a genuine fresh start. Set your vision clearly and take one small, deliberate step.`;
  }
}

export default function LunarPhaseCard({ event }: { event: LunarEvent }) {
  const { t } = useT();
  const { theme } = useTheme();
  const isDark = theme !== "light";
  const [expanded, setExpanded] = useState(false);

  // Staleness guard. A stale cached forecast (left on a device from a previous
  // lunation) can carry a month-old lunar_event and render the wrong moon
  // ("New Moon in Taurus" weeks after the fact). The backend only ever emits an
  // event within a 3-day window, so any event whose date is further than ~4
  // days from today is stale data, not a real upcoming/recent moon. In that
  // case render nothing rather than show a false sky. Purely additive: a real
  // event (within the window) always renders; only stale ones disappear, and
  // the background refresh then repopulates the correct one. Defensive: if the
  // date is missing or unparseable, fall back to the existing behavior.
  const _eventDateMs = event?.date ? Date.parse(event.date + "T00:00:00") : NaN;
  if (!Number.isNaN(_eventDateMs)) {
    const _daysFromNow = Math.abs(Date.now() - _eventDateMs) / 86400000;
    if (_daysFromNow > 4) return null;
  }

  const timing = formatDaysUntil(event.days_until, event.is_today, t);
  const expandedText = event.expanded || generateExpandedText(event);

  // Theme-aware moonlit treatment. Dark: forest card lit by mist. Light: a soft
  // moonlit-pale card on the pearl ground, with the same silvery mist accent.
  const cardBg = isDark
    ? "linear-gradient(135deg, rgba(20, 38, 24, 0.95) 0%, rgba(14, 28, 18, 0.98) 100%)"
    : "linear-gradient(135deg, rgba(246, 249, 251, 0.96) 0%, rgba(236, 241, 245, 0.98) 100%)";
  const moonFill = isDark ? "#ece4cf" : "#6a8692";

  return (
    <div
      className="rounded-2xl border px-4 py-4 mb-6"
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      style={{
        // Mist (silvery moonlight) accent reads on both themes.
        borderColor: "rgba(122, 138, 154, 0.45)",
        background: cardBg,
        boxShadow: "0 2px 16px rgba(122, 138, 154, 0.10)",
        cursor: "pointer",
        position: "relative",
        zIndex: 1,
        WebkitTapHighlightColor: "transparent",
        userSelect: "none",
      }}
      onClick={() => setExpanded((v) => !v)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpanded((v) => !v); } }}
    >
      {/* Top row: icon + title + timing badge */}
      <div className="flex items-center gap-3 mb-2.5">
        <MoonIcon type={event.type} fill={moonFill} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="font-heading text-base leading-tight"
              style={{ color: "var(--text-primary)", fontWeight: 400, letterSpacing: "0.01em" }}
            >
              {event.type} in {event.sign}
            </span>
            <span
              className="text-[12px] font-body tracking-wider px-2 py-0.5 rounded-full border"
              style={{
                color: "var(--text-secondary)",
                borderColor: "rgba(122, 138, 154, 0.35)",
                background: "rgba(122, 138, 154, 0.12)",
              }}
            >
              {timing}
            </span>
          </div>
          <p
            className="text-xs font-body mt-0.5"
            style={{ color: "var(--text-secondary)", opacity: 0.85 }}
          >
            {t("lunar.illuminating")} {event.house}
          </p>
        </div>
      </div>

      {/* Note */}
      <p
        className="font-body text-sm leading-relaxed"
        style={{ color: "var(--text-secondary)" }}
      >
        {event.note}
      </p>

      {/* Expanded detail */}
      {expanded && (
        <p
          className="font-body text-sm leading-relaxed mt-3 pt-3"
          style={{
            color: "var(--text-secondary)",
            opacity: 0.9,
            borderTop: "1px solid rgba(122, 138, 154, 0.22)",
          }}
        >
          {expandedText}
        </p>
      )}

      {/* Read more / Close toggle */}
      <button
        className="mt-2.5 text-[13px] font-body tracking-wider"
        style={{ color: "var(--text-secondary)", position: "relative", zIndex: 2, minHeight: "44px", display: "flex", alignItems: "center" }}
        onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
      >
        {expanded ? t("lunar.close") : t("lunar.read_more")}
      </button>
    </div>
  );
}
