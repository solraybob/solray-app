"use client";

import { useT } from "@/lib/i18n";
import { type Planet, PLANET_COLORS } from "../_lib/today-data";

export function PlanetCard({ planet }: { planet: Planet }) {
  const { t } = useT();
  const color = PLANET_COLORS[planet.name] || "rgb(var(--rgb-text-muted))";
  const planetLabel = t(`planets.${planet.name.toLowerCase()}`);
  const signLabel = t(`signs.${planet.sign.toLowerCase()}`);
  return (
    <div
      className="flex flex-col items-center rounded-2xl px-3 py-3 min-w-[76px] shrink-0 gap-0.5"
      style={{ background: "rgb(var(--rgb-card))", border: `1px solid ${color}30` }}
    >
      <div className="flex items-center gap-1 h-8 items-center justify-center">
        <span style={{ color, opacity: 0.9, fontSize: "1.4rem", lineHeight: 1, display: "flex", alignItems: "center", height: "2rem" }}>
          {planet.symbol}
        </span>
        {planet.retrograde && (
          <span className="text-[14px] font-body leading-none mt-0.5" style={{ color }}>℞</span>
        )}
      </div>
      <span className="font-body text-text-secondary text-[14px] tracking-widest uppercase mt-0.5 font-bold">
        {planetLabel}
      </span>
      <span className="font-body text-text-primary text-[17px] font-medium">
        {signLabel}
      </span>
      <span className="font-body text-text-secondary text-[14px]">{planet.degree}</span>
    </div>
  );
}
