"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  // Only show if there's an aspect with orb < 5°
  if (!aspect || aspect.orb >= 5) {
    return null;
  }

  const planetSymbol = PLANET_SYMBOLS[aspect.planet.toLowerCase()] || "✦";
  const natalSymbol = PLANET_SYMBOLS[aspect.natal_planet.toLowerCase()] || "✦";

  // Extract interpretation from tag_details.astrology
  const interpretation = tagDetails?.astrology || `${aspect.planet} ${aspect.aspect_type} ${aspect.natal_planet} today`;
  const firstSentence = interpretation.split(/[.!?]+/)[0] || interpretation;

  const handleCardTap = () => {
    setIsLoading(true);
    // Pre-load the chat with a message about this transit
    const transitMessage = `Tell me about ${aspect.planet} ${aspect.aspect_type} my ${aspect.natal_planet} today. Orb: ${aspect.orb.toFixed(1)}°`;
    
    // Store the prompt in sessionStorage so chat page can pick it up
    try {
      sessionStorage.setItem(
        "solray_chat_prompt",
        JSON.stringify({
          topic: `${aspect.planet} ${aspect.aspect_type}`,
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
        <span className="text-text-primary text-sm font-body font-medium">{aspect.planet}</span>
        <span className="text-text-secondary/70 text-xs font-body">{aspect.aspect_type}</span>
        <span className="text-text-secondary/70 text-xs font-body">{natalSymbol}</span>
        <span className="text-text-secondary/70 text-xs font-body">{aspect.natal_planet}</span>
        <div className="ml-auto flex items-center gap-1">
          <span className="text-text-secondary/60 text-[10px] font-body">orb {aspect.orb.toFixed(1)}°</span>
          <span className="text-amber-sun/70 text-xs">→</span>
        </div>
      </div>

      {/* Interpretation sentence */}
      <p className="text-text-secondary text-xs font-body leading-relaxed">
        {firstSentence.trim()}
      </p>

      {/* Subtle label */}
      <p className="text-text-secondary/50 text-[10px] font-body mt-2">Tap to explore in chat</p>
    </div>
  );
}
