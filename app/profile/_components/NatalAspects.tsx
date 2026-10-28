"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n";
import { tx } from "@/lib/astro-i18n";
import { type NatalAspect } from "../_lib/profile-data";

const ASPECT_CONFIG: Record<string, { symbol: string; label: string; color: string; major: boolean }> = {
  trine:          { symbol: "△",  label: "Trine",          color: "rgb(var(--rgb-mist))", major: true },
  sextile:        { symbol: "⚹",  label: "Sextile",        color: "rgb(var(--rgb-mist))", major: true },
  conjunction:    { symbol: "☌",  label: "Conjunction",    color: "var(--amber)", major: true },
  opposition:     { symbol: "☍",  label: "Opposition",     color: "rgb(var(--rgb-ember))", major: true },
  square:         { symbol: "□",  label: "Square",         color: "rgb(var(--rgb-ember))", major: true },
  quincunx:       { symbol: "⚻",  label: "Quincunx",      color: "rgb(var(--rgb-wisteria))", major: true },
  semi_sextile:   { symbol: "⚺",  label: "Semi-Sextile",  color: "rgb(var(--rgb-text-muted))", major: false },
  semi_square:    { symbol: "∠",  label: "Semi-Square",   color: "var(--text-secondary)", major: false },
  sesquiquadrate: { symbol: "⊼",  label: "Sesquiquadrate",color: "var(--text-secondary)", major: false },
  quintile:       { symbol: "Q",  label: "Quintile",       color: "var(--text-secondary)", major: false },
  bi_quintile:    { symbol: "bQ", label: "Bi-Quintile",    color: "var(--text-secondary)", major: false },
  septile:        { symbol: "Sp", label: "Septile",        color: "var(--text-secondary)", major: false },
  bi_septile:     { symbol: "bSp",label: "Bi-Septile",     color: "var(--text-secondary)", major: false },
  tri_septile:    { symbol: "tSp",label: "Tri-Septile",    color: "var(--text-secondary)", major: false },
};

const MAJOR_ORDER = ["conjunction", "opposition", "trine", "square", "sextile", "quincunx"];

export function NatalAspects({ aspects }: { aspects: NatalAspect[] }) {
  const { t, lang } = useT();
  const [openAspects, setOpenAspects] = useState<Record<string, boolean>>({});
  const [minorOpen, setMinorOpen] = useState(false);
  const [sectionOpen, setSectionOpen] = useState(false);

  if (!aspects || aspects.length === 0) return null;

  const grouped: Record<string, NatalAspect[]> = {};
  for (const a of aspects) {
    const key = a.aspect?.toLowerCase() ?? "unknown";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(a);
  }

  const majorGroups = MAJOR_ORDER.filter((k) => grouped[k]?.length > 0);
  const minorGroups = Object.keys(grouped).filter((k) => !MAJOR_ORDER.includes(k) && grouped[k]?.length > 0);

  const toggleAspect = (key: string) => {
    setOpenAspects((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const renderPlanetPairs = (key: string, list: NatalAspect[]) => {
    const cfg = ASPECT_CONFIG[key] ?? { symbol: "·", color: "var(--text-secondary)" };
    return (
      <div className="mt-1 pl-6 space-y-1">
        {list.map((a, i) => (
          <div key={i} className="flex items-center justify-between py-0.5">
            <span className="font-body text-xs text-text-secondary">
              {tx(a.planet1, lang)}{" "}
              <span style={{ color: cfg.color }}>{cfg.symbol}</span>{" "}
              {tx(a.planet2, lang)}
            </span>
            <span className="font-body text-[14px] text-text-muted ml-4">
              {a.orb.toFixed(1)}°
            </span>
          </div>
        ))}
      </div>
    );
  };

  const renderAspectRow = (key: string, list: NatalAspect[]) => {
    const cfg = ASPECT_CONFIG[key] ?? { symbol: "·", label: key, color: "var(--text-secondary)", major: false };
    const isOpen = openAspects[key] ?? false;
    return (
      <div key={key}>
        <button
          onClick={() => toggleAspect(key)}
          className="w-full flex items-center gap-3 py-2.5 px-1 hover:bg-forest-card/30 rounded-lg transition-colors"
        >
          <span className="text-base w-6 text-center flex-shrink-0" style={{ color: cfg.color }}>
            {cfg.symbol}
          </span>
          <span className="font-body text-[17px] text-text-primary flex-1 text-left">
            {tx(cfg.label, lang)}
          </span>
          <span className="font-body text-[14px] text-text-secondary mr-2">
            {list.length}
          </span>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="rgb(var(--rgb-text-muted))"
            strokeWidth="2"
            className={`transition-transform duration-200 flex-shrink-0 ${isOpen ? "rotate-180" : ""}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        {isOpen && renderPlanetPairs(key, list)}
      </div>
    );
  };

  return (
    <div className="border border-forest-border rounded-2xl overflow-hidden mb-4">
      <button
        onClick={() => setSectionOpen(!sectionOpen)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-forest-card/50 transition-colors"
      >
        <h2 className="font-heading text-text-primary" style={{ fontSize: "1.05rem", fontWeight: 700 }}>{t("profile.natal_aspects")}</h2>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="rgb(var(--rgb-text-muted))"
          strokeWidth="2"
          className={`transition-transform duration-200 ${sectionOpen ? "rotate-180" : ""}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {sectionOpen && (
        <div className="px-4 pb-4">
          <div className="space-y-0.5">
            {majorGroups.map((key) => renderAspectRow(key, grouped[key]))}
          </div>
          {minorGroups.length > 0 && (
            <div className="mt-1">
              <button
                onClick={() => setMinorOpen(!minorOpen)}
                className="w-full flex items-center gap-3 py-2.5 px-1 hover:bg-forest-card/30 rounded-lg transition-colors"
              >
                <span className="text-base w-6 text-center flex-shrink-0 text-text-muted">·</span>
                <span className="font-body text-[17px] text-text-secondary flex-1 text-left">{t("profile.minor_aspects")}</span>
                <span className="font-body text-[14px] text-text-secondary mr-2">
                  {minorGroups.reduce((s, k) => s + grouped[k].length, 0)}
                </span>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="rgb(var(--rgb-text-muted))"
                  strokeWidth="2"
                  className={`transition-transform duration-200 flex-shrink-0 ${minorOpen ? "rotate-180" : ""}`}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {minorOpen && (
                <div className="mt-1 space-y-0.5">
                  {minorGroups.map((key) => renderAspectRow(key, grouped[key]))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
