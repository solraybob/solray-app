"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT, fill } from "@/lib/i18n";
import { tx } from "@/lib/astro-i18n";

interface Aspect {
  planet: string;
  planet_symbol: string;
  natal_planet: string;
  aspect_type: string;
  orb: number;
}

interface TagDetails {
  astrology?: string;
  human_design?: string;
  gene_keys?: string;
}

interface TodayAlertCardProps {
  aspect?: Aspect;
  tagDetails?: TagDetails;
}

// Planet symbols mapping
const PLANET_SYMBOLS: Record<string, string> = {
  sun: "☉",
  moon: "☽",
  mercury: "☿",
  venus: "♀",
  mars: "♂",
  jupiter: "♃",
  saturn: "♄",
  uranus: "♅",
  neptune: "♆",
  pluto: "♇",
};

export default function TodayAlertCard({ aspect, tagDetails }: TodayAlertCardProps) {
  const { t, lang } = useT();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  // Only show if there's an aspect with orb < 5°
  if (!aspect || aspect.orb >= 5) {
    return null;
  }

  const planetSymbol = PLANET_SYMBOLS[aspect.planet.toLowerCase()] || "·";
  const natalSymbol = PLANET_SYMBOLS[aspect.natal_planet.toLowerCase()] || "·";

  // Extract interpretation from tag_details.astrology
  const term = (v: string) => (lang === "en" ? v : tx(v, lang));
  const planet = term(aspect.planet);
  const aspectName = lang === "en" ? aspect.aspect_type : term(aspect.aspect_type).toLowerCase();
  const natal = term(aspect.natal_planet);
  const interpretation = tagDetails?.astrology || fill(t("prompts.alert_fallback"), { planet, aspect: aspectName, natal });
  const firstSentence = interpretation.split(/[.!?]+/)[0] || interpretation;

  const handleCardTap = () => {
    setIsLoading(true);
    // Pre-load the chat with a message about this transit
    const transitMessage = fill(t("prompts.alert_question"), { planet, aspect: aspectName, natal, orb: aspect.orb.toFixed(1) });
    
    // Store the prompt in sessionStorage so chat page can pick it up
    try {
      sessionStorage.setItem(
        "solray_chat_prompt",
        JSON.stringify({
          topic: fill(t("prompts.alert_topic"), { planet, aspect: aspectName }),
          question: transitMessage,
        })
      );
    } catch (_) {
      // ignore storage errors
    }
    
    // Navigate to chat page
    router.push("/chat");
  };

  return (
    <div
      onClick={handleCardTap}
      className="cursor-pointer px-4 py-3 rounded-xl border border-amber-sun/40 bg-amber-sun/5 hover:bg-amber-sun/10 transition-all mb-4"
    >
      {/* One-line header with planet symbols and aspect */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg leading-none">{planetSymbol}</span>
        <span className="text-text-primary text-sm font-body font-medium">{planet}</span>
        <span className="text-text-secondary text-xs font-body">{aspectName}</span>
        <span className="text-text-secondary text-xs font-body">{natalSymbol}</span>
        <span className="text-text-secondary text-xs font-body">{natal}</span>
        <div className="ml-auto flex items-center gap-1">
          <span className="text-text-muted text-[14px] font-body">{t("prompts.orb")} {aspect.orb.toFixed(1)}°</span>
          <span className="text-amber-sun text-xs">→</span>
        </div>
      </div>

      {/* Interpretation sentence */}
      <p className="text-text-secondary text-xs font-body leading-relaxed">
        {firstSentence.trim()}
      </p>

      {/* Subtle label */}
      <p className="text-text-muted text-[14px] font-body mt-2">{t("alert.tap_to_explore")}</p>
    </div>
  );
}
