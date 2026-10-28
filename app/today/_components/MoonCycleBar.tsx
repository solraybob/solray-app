"use client";

import { useT } from "@/lib/i18n";
import { type Planet } from "../_lib/today-data";

// Moon phase calculation helpers
function getMoonPhaseValue(): number {
  const now = new Date();
  const jd = (now.getTime() / 86400000) + 2440587.5;
  const lunarCycle = 29.53058867;
  const knownNewMoon = 2451549.5;
  const phase = ((jd - knownNewMoon) % lunarCycle) / lunarCycle;
  return phase < 0 ? phase + 1 : phase;
}

function getMoonPhaseLabel(p: number): string {
  if (p < 0.03 || p > 0.97) return "New Moon";
  if (p < 0.25) return "Waxing Crescent";
  if (p < 0.27) return "First Quarter";
  if (p < 0.48) return "Waxing Gibbous";
  if (p < 0.52) return "Full Moon";
  if (p < 0.73) return "Waning Gibbous";
  if (p < 0.77) return "Third Quarter";
  return "Waning Crescent";
}

// Moon phase is the only place in the app where emoji are used. The
// lunar glyphs (new through waning crescent) read as celestial symbols
// rather than face/object emoji and fit the soft forest palette, so
// they are kept as a deliberate, single-purpose carve-out from the
// otherwise strict no-emoji rule.
// Moon-phase glyph. The realistic moon-phase symbols are kept here as an
// intentional exception to the no-emoji rule (Bob's call): they are celestial
// symbols depicting the actual phase, the same spirit as the chart glyphs, not
// decorative emoji.
function getMoonEmoji(p: number): string {
  if (p < 0.03 || p > 0.97) return "\u{1F311}"; // new
  if (p < 0.25) return "\u{1F312}";              // waxing crescent
  if (p < 0.27) return "\u{1F313}";              // first quarter
  if (p < 0.48) return "\u{1F314}";              // waxing gibbous
  if (p < 0.52) return "\u{1F315}";              // full
  if (p < 0.73) return "\u{1F316}";              // waning gibbous
  if (p < 0.77) return "\u{1F317}";              // third quarter
  return "\u{1F318}";                             // waning crescent
}

// Persistent moon cycle component, always visible.
function MoonCycleBar({ planets }: { planets: Planet[] }) {
  const { t } = useT();
  const phase = getMoonPhaseValue();
  const moonSign = planets.find(p => p.name === "Moon")?.sign || "";
  const phaseLabelEn = getMoonPhaseLabel(phase);
  // Map the English phase label to a stable i18n key.
  const phaseKey = phaseLabelEn.toLowerCase().replace(/\s+/g, "_");
  const phaseLabel = t(`moon.phase_${phaseKey}`);
  const phaseEmoji = getMoonEmoji(phase);
  const illumination = Math.round(Math.sin(phase * Math.PI) * 100);
  const moonSignLabel = moonSign ? t(`signs.${moonSign.toLowerCase()}`) : "";

  return (
    <div className="bg-forest-card/40 border border-forest-border/50 rounded-2xl p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">{phaseEmoji}</span>
          <div>
            <p className="font-body text-text-primary text-[17px] font-medium">{phaseLabel}</p>
            {moonSign && (
              <p className="font-body text-text-secondary text-[14px]">{t("moon.moon_in")} {moonSignLabel}</p>
            )}
          </div>
        </div>
        <div className="text-right">
          <p className="font-heading text-amber-sun text-[17px]">{illumination}%</p>
          <p className="font-body text-text-secondary text-[14px]">{t("moon.illuminated")}</p>
        </div>
      </div>

      {/* Cycle bar */}
      <div className="relative">
        <div
          className="w-full h-1.5 bg-forest-border/50 rounded-full overflow-hidden"
          style={{
            WebkitMaskImage: "linear-gradient(to right, transparent 0%, black 14%, black 86%, transparent 100%)",
            maskImage: "linear-gradient(to right, transparent 0%, black 14%, black 86%, transparent 100%)",
          }}
        >
          <div
            className="h-full bg-amber-sun/60 rounded-full"
            style={{ width: `${Math.min(phase * 100, 99)}%` }}
          />
        </div>
        {/* Current position dot */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-amber-sun border-2 border-forest-deep"
          style={{ left: `${Math.min(phase * 100, 97)}%`, transform: "translate(-50%, -50%)" }}
        />

        {/* Phase labels */}
        <div className="flex justify-between mt-2">
          <span className="font-body text-text-muted text-[13px]">{t("moon.abbr_new")}</span>
          <span className="font-body text-text-muted text-[13px]">{t("moon.abbr_first_q")}</span>
          <span className="font-body text-text-muted text-[13px]">{t("moon.abbr_full")}</span>
          <span className="font-body text-text-muted text-[13px]">{t("moon.abbr_third_q")}</span>
          <span className="font-body text-text-muted text-[13px]">{t("moon.abbr_new")}</span>
        </div>
      </div>
    </div>
  );
}
