"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n";

interface SolarReturnCardProps {
  birthDate: string; // ISO date string
}

// Calculate days until next birthday (including negative for past dates)
function daysUntilBirthday(birthDateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Parse the birth date (handle both YYYY-MM-DD and other formats)
  const birthDate = new Date(birthDateStr);
  if (isNaN(birthDate.getTime())) return Infinity; // Invalid date

  // Get this year's birthday
  const thisYearBirthday = new Date(
    today.getFullYear(),
    birthDate.getMonth(),
    birthDate.getDate()
  );

  let daysUntil = Math.floor(
    (thisYearBirthday.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );

  // If birthday already passed this year, calculate for next year
  if (daysUntil < -7) {
    const nextYearBirthday = new Date(
      today.getFullYear() + 1,
      birthDate.getMonth(),
      birthDate.getDate()
    );
    daysUntil = Math.floor(
      (nextYearBirthday.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );
  }

  return daysUntil;
}

// Format birth date nicely
function formatBirthDate(birthDateStr: string, lang: string): string {
  const date = new Date(birthDateStr);
  if (isNaN(date.getTime())) return "";

  return date.toLocaleDateString(lang === "en" ? "en-GB" : lang, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// Get upcomming year from birth date
function getUpcomingYear(birthDateStr: string): number {
  const birthDate = new Date(birthDateStr);
  const today = new Date();
  const thisYearBirthday = new Date(
    today.getFullYear(),
    birthDate.getMonth(),
    birthDate.getDate()
  );

  // Check if birthday has already passed this year
  if (today >= thisYearBirthday) {
    return today.getFullYear() + 1;
  }

  return today.getFullYear();
}

export default function SolarReturnCard({ birthDate }: SolarReturnCardProps) {
  const { token } = useAuth();
  const { t, lang } = useT();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const daysUntil = daysUntilBirthday(birthDate);

  // Only show card if within 7 days
  if (Math.abs(daysUntil) > 7) {
    return null;
  }

  const formattedDate = formatBirthDate(birthDate, lang);
  const upcomingYear = getUpcomingYear(birthDate);
  const dayLabel =
    daysUntil === 0
      ? t("solar.today")
      : daysUntil === 1
      ? t("solar.tomorrow")
      : daysUntil === -1
      ? t("solar.yesterday")
      : daysUntil > 0
      ? t("solar.in_days").replace("{count}", String(daysUntil))
      : t("solar.days_ago").replace("{count}", String(Math.abs(daysUntil)));

  const handleTapCard = async () => {
    if (!token) return;

    setLoading(true);

    try {
      // Pre-fetch solar return reading
      const solarReturnData = await apiFetch(
        "/solar-return",
        {},
        token
      ).catch(() => {
        // Fallback: return null if endpoint not available yet
        return null;
      });

      // Store in sessionStorage for chat to pick up
      if (solarReturnData) {
        try {
          sessionStorage.setItem(
            "solray_solar_return_context",
            JSON.stringify(solarReturnData)
          );
        } catch (_) {
          // Ignore storage errors
        }
      }

      // Navigate to chat with pre-loaded message
      const preloadedMessage = `I want to understand my Solar Return reading for ${upcomingYear}. What is the dominant theme of my coming year?`;
      sessionStorage.setItem("solray_chat_preload", preloadedMessage);

      // Navigate to chat
      router.push("/chat");
    } catch (error) {
      console.error("Error fetching solar return data:", error);
      // Still navigate to chat even if fetch fails
      const preloadedMessage = `I want to understand my Solar Return reading for ${upcomingYear}. What is the dominant theme of my coming year?`;
      sessionStorage.setItem("solray_chat_preload", preloadedMessage);
      router.push("/chat");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleTapCard}
      disabled={loading}
      className="w-full mb-4 transition-all duration-300 hover:scale-105 active:scale-95 disabled:opacity-50"
    >
      {/* Card with dark amber gradient background */}
      <div
        className="rounded-2xl p-5 border border-amber-sun/40 overflow-hidden"
        style={{
          background: `linear-gradient(135deg, rgba(243, 146, 48, 0.1) 0%, rgba(243, 146, 48, 0.05) 100%)`,
        }}
      >
        {/* Icon and title */}
        <div className="flex items-start gap-3 mb-3">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" className="text-amber-sun shrink-0 mt-0.5" aria-hidden="true">
            <path d="M12 2c.42 4.95 2.05 6.58 7 7-4.95.42-6.58 2.05-7 7-.42-4.95-2.05-6.58-7-7 4.95-.42 6.58-2.05 7-7z" />
          </svg>
          <div className="flex-1 text-left">
            <h3 className="font-heading text-lg text-amber-sun font-light">
              {t("solar.year_ready")}
            </h3>
            <p className="text-text-secondary text-xs font-body mt-0.5">
              {dayLabel}
            </p>
          </div>
        </div>

        {/* Birth date subtitle */}
        <div className="mb-4">
          <p className="text-text-secondary/80 text-sm font-body">
            {t("solar.born").replace("{date}", formattedDate)}
          </p>
        </div>

        {/* Body text */}
        <p className="text-text-secondary text-sm leading-relaxed font-body mb-4">
          {t("solar.body")}
        </p>

        {/* CTA Button */}
        <div className="flex items-center justify-between">
          <span className="text-amber-sun text-xs font-body tracking-wider uppercase">
            {loading ? t("common.loading") : t("solar.read_year")}
          </span>
          <span className="text-amber-sun/70 text-sm">→</span>
        </div>
      </div>
    </button>
  );
}
