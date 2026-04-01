"use client";

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

export default function LunarPhaseCard({ event }: { event: LunarEvent }) {
  const timing = formatDaysUntil(event.days_until, event.is_today);

  return (
    <div
      className="rounded-2xl border px-4 py-4 mb-6"
      style={{
        borderColor: "rgba(212, 160, 23, 0.45)",
        background:
          "linear-gradient(135deg, rgba(20, 38, 24, 0.95) 0%, rgba(14, 28, 18, 0.98) 100%)",
        boxShadow: "0 2px 16px rgba(212, 160, 23, 0.08), inset 0 1px 0 rgba(245, 200, 66, 0.06)",
      }}
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
    </div>
  );
}
