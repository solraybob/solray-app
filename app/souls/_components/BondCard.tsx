"use client";

import LoadingSpinner from "@/components/LoadingSpinner";
import { useT } from "@/lib/i18n";
import { tx } from "@/lib/astro-i18n";
import { type BondPartner, type BondLens, partnerChart, partnerPhoto, partnerName, partnerInitial } from "../_lib/souls-data";

// ---------------------------------------------------------------------------
// Bond entry card, hero on the Souls page
// ---------------------------------------------------------------------------

interface BondCardProps {
  myName: string | null;
  myAvatar?: string | null;
  partners: BondPartner[];
  lens: BondLens;
  onPickPartner: () => void;
  onRemovePartner: (i: number) => void;
  onChangeLens: (l: BondLens) => void;
  onRead: () => void;
  reading: boolean;
}

const MAX_FAMILY_MEMBERS = 5;

export function BondCard({ myName, myAvatar, partners, lens, onPickPartner, onRemovePartner, onChangeLens, onRead, reading }: BondCardProps) {
  const { t, lang } = useT();
  const lenses: { key: BondLens; label: string; hint: string }[] = [
    { key: "family",     label: t("souls.lens_family"),     hint: t("souls.lens_family_hint") },
    { key: "friendship", label: t("souls.lens_friendship"), hint: t("souls.lens_friendship_hint") },
    { key: "romantic",   label: t("souls.lens_romantic"),   hint: t("souls.lens_romantic_hint") },
    { key: "working",    label: t("souls.lens_working"),    hint: t("souls.lens_working_hint") },
  ];

  const isFamily   = lens === "family";
  const partner    = partners[0] ?? null;
  const chart      = partner ? partnerChart(partner) : null;
  const canAddMore = isFamily && partners.length < MAX_FAMILY_MEMBERS;

  return (
    <div
      className="rounded-3xl p-6 relative overflow-hidden"
      style={{
        background: "rgb(var(--rgb-card))",
        border: "1px solid rgb(var(--rgb-border))",
        boxShadow: "0 14px 34px rgb(var(--rgb-scrim) / 0.08)",
      }}
    >
      <p
        className="font-body uppercase mb-1"
        style={{ fontSize: 11.5, letterSpacing: "0.2em", fontWeight: 700, color: "rgb(var(--rgb-text-muted))" }}
      >
        {t("souls.dynamics")}
      </p>
      <h2 className="font-heading text-2xl text-text-primary leading-tight mb-5" style={{ fontWeight: 900, letterSpacing: "-0.01em" }}>
        {t("souls.where_charts_meet")}
      </h2>

      {/* You + partner(s) pills */}
      <div className="flex flex-wrap items-center gap-2 mb-5">

        {/* You, always fixed */}
        <div
          className="flex items-center gap-2 pl-1 pr-3 py-1 rounded-full shrink-0"
          style={{ background: "rgb(var(--rgb-text-primary) / 0.04)", border: "1px solid rgb(var(--rgb-text-primary) / 0.12)" }}
        >
          {myAvatar ? (
            <img src={myAvatar} alt={t("souls.you")} className="w-7 h-7 rounded-full object-cover shrink-0" />
          ) : (
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-text-primary font-heading text-sm shrink-0"
                 style={{ background: "linear-gradient(135deg, rgb(var(--rgb-mist)), rgb(var(--rgb-mist)))" }}>
              {myName?.[0]?.toUpperCase() || "·"}
            </div>
          )}
          <span className="font-body text-[15px] text-text-primary">{t("souls.you")}</span>
        </div>

        {/* Selected partners */}
        {partners.map((p, i) => (
          <div
            key={i}
            className="flex items-center gap-1.5 pl-1 pr-1.5 py-1 rounded-full shrink-0"
            style={{ background: "rgba(74,46,158,0.08)", border: "1px solid rgba(74,46,158,0.45)" }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" className="text-indigo shrink-0" aria-hidden="true">
              <path d="M12 2c.42 4.95 2.05 6.58 7 7-4.95.42-6.58 2.05-7 7-.42-4.95-2.05-6.58-7-7 4.95-.42 6.58-2.05 7-7z" />
            </svg>
            {partnerPhoto(p) ? (
              <img src={partnerPhoto(p)!} alt={partnerName(p)} className="w-6 h-6 rounded-full object-cover shrink-0" />
            ) : (
              <div className="w-6 h-6 rounded-full bg-forest-border flex items-center justify-center font-heading text-xs text-text-primary shrink-0">
                {partnerInitial(p)}
              </div>
            )}
            <span className="font-body text-[15px] text-text-primary max-w-[80px] truncate">{partnerName(p)}</span>
            <button
              type="button"
              onClick={() => onRemovePartner(i)}
              className="w-4 h-4 rounded-full flex items-center justify-center text-text-secondary hover:text-text-primary transition-colors shrink-0 ml-0.5"
              aria-label={t("souls.remove_name").replace("{name}", partnerName(p))}
            >
              ×
            </button>
          </div>
        ))}

        {/* Add button, always shown when no partners, or in family mode with room */}
        {(partners.length === 0 || canAddMore) && (
          <button
            type="button"
            onClick={onPickPartner}
            className="flex items-center gap-2 pl-1 pr-3 py-1 rounded-full shrink-0 transition hover:border-mist/60"
            style={{
              background: "transparent",
              border: "1px dashed rgb(var(--rgb-text-primary) / 0.25)",
            }}
          >
            {partners.length === 0 && (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" className="text-indigo shrink-0" aria-hidden="true">
                <path d="M12 2c.42 4.95 2.05 6.58 7 7-4.95.42-6.58 2.05-7 7-.42-4.95-2.05-6.58-7-7 4.95-.42 6.58-2.05 7-7z" />
              </svg>
            )}
            <div className="w-6 h-6 rounded-full flex items-center justify-center font-body text-[17px] text-text-secondary shrink-0"
                 style={{ border: "1px dashed rgb(var(--rgb-text-primary) / 0.25)" }}>+</div>
            <span className="font-body text-[15px] text-text-secondary">
              {partners.length === 0 ? t("souls.choose_someone") : isFamily ? t("souls.add_another") : ""}
            </span>
          </button>
        )}
      </div>

      {/* Chart whisper, only for single partner on non-family lenses */}
      {!isFamily && partner && chart && (chart.sun_sign || chart.hd_type) && (
        <p className="font-body text-[15px] text-text-secondary mb-5 -mt-2 pl-1">
          {chart.sun_sign && <>☉ {tx(chart.sun_sign, lang)}</>}
          {chart.sun_sign && chart.hd_type && " · "}
          {chart.hd_type && (
            <>{tx(chart.hd_type, lang)}{chart.hd_profile ? ` ${chart.hd_profile}` : ""}</>
          )}
        </p>
      )}

      {/* Lens pills */}
      <div className="mb-6">
        <p className="font-body text-[13px] tracking-[0.22em] uppercase text-text-secondary mb-2 font-bold">{t("souls.lens")}</p>
        <div className="flex gap-2">
          {lenses.map((l) => {
            const active = lens === l.key;
            return (
              <button
                key={l.key}
                type="button"
                onClick={() => onChangeLens(l.key)}
                className="flex-1 py-2 rounded-xl transition-all"
                style={{
                  background: active ? "rgb(var(--rgb-indigo) / 0.15)" : "rgb(var(--rgb-card) / 0.6)",
                  border: active ? "1px solid rgb(var(--rgb-indigo) / 0.55)" : "1px solid rgb(var(--rgb-border))",
                  color: active ? "var(--text-primary)" : "var(--text-muted)",
                }}
                title={l.hint}
              >
                <span className="font-body text-[15px]">{l.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={onRead}
        disabled={partners.length === 0 || reading}
        className="w-full font-body transition active:scale-[0.98] disabled:opacity-35 disabled:cursor-not-allowed"
        style={{
          border: "1.5px solid rgb(var(--rgb-text-primary))",
          borderRadius: 999,
          background: "rgb(var(--rgb-text-primary))",
          color: "rgb(var(--rgb-bg-deep))",
          fontSize: 15,
          fontWeight: 700,
          letterSpacing: "0.06em",
          padding: 14,
        }}
      >
        {reading ? <LoadingSpinner size="sm" /> : isFamily && partners.length > 1 ? t("souls.read_family") : t("souls.read_dynamic")}
      </button>
    </div>
  );
}
