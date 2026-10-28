"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { useT } from "@/lib/i18n";
import { tx } from "@/lib/astro-i18n";
import { type SkyEcho } from "../_lib/today-data";

// Sky-stamp recall card (Build 1, step 3). A quiet inline note, not a modal:
// a moment from the reader's own past that happened under a sky like today's.
// Their own words, shown back to them. Deliberately understated, in the
// wisteria register used for the Oracle's own reflective voice.
const SKY_PHASE_LABELS: Record<string, { en: string; es: string }> = {
  new: { en: "new moon", es: "luna nueva" },
  waxing_crescent: { en: "waxing crescent moon", es: "luna creciente" },
  first_quarter: { en: "first-quarter moon", es: "cuarto creciente" },
  waxing_gibbous: { en: "waxing gibbous moon", es: "luna gibosa creciente" },
  full: { en: "full moon", es: "luna llena" },
  waning_gibbous: { en: "waning gibbous moon", es: "luna gibosa menguante" },
  last_quarter: { en: "last-quarter moon", es: "cuarto menguante" },
  waning_crescent: { en: "waning crescent moon", es: "luna menguante" },
};

function skyPhaseLabel(bucket: string | null, isEs: boolean): string {
  if (!bucket) return "";
  const e = SKY_PHASE_LABELS[bucket];
  if (!e) return bucket.replace(/_/g, " ");
  return isEs ? e.es : e.en;
}

function skyWhenText(days: number | null, isEs: boolean): string {
  const d = days == null ? 0 : days;
  if (isEs) {
    if (d < 45) return "el mes pasado";
    if (d < 300) return `hace ${Math.round(d / 30)} meses`;
    if (d < 430) return "hace casi un año";
    if (d < 660) return "hace más de un año";
    return `hace ${Math.round(d / 365)} años`;
  }
  if (d < 45) return "last month";
  if (d < 300) return `${Math.round(d / 30)} months ago`;
  if (d < 430) return "about a year ago";
  if (d < 660) return "over a year ago";
  return `${Math.round(d / 365)} years ago`;
}

// Sky-recall takeover, mirrors BreakthroughModal: a full-screen moment the
// Oracle surfaces when today's sky echoes one in your own past. "Go deeper"
// opens the Oracle about it (and consumes it so it does not return); "Later"
// sets it aside for this session so it comes again next app open.
export function SkyEchoModal({ echo, onGoDeeper, onLater, onDismiss }: { echo: SkyEcho; onGoDeeper: (sentence: string, excerpt: string) => void; onLater: () => void; onDismiss: () => void }) {
  const { t, lang } = useT();
  const isEs = (lang || "").startsWith("es");
  const phase = skyPhaseLabel(echo.moon_phase_bucket, isEs);
  const moon = tx(echo.moon_sign, lang);
  const sun = tx(echo.sun_sign, lang);
  const when = skyWhenText(echo.days_ago, isEs);

  let sky: string;
  if (echo.match === "phase_sign" && phase && moon) {
    sky = isEs ? `bajo una ${phase} en ${moon}, el mismo cielo que esta noche`
              : `under a ${phase} in ${moon}, the same sky as tonight`;
  } else if (echo.match === "phase" && phase) {
    sky = isEs ? `bajo una ${phase}, como esta noche` : `under a ${phase}, like tonight`;
  } else if (echo.match === "sign" && moon) {
    sky = isEs ? `con la luna en ${moon}, como ahora` : `with the moon in ${moon}, as it is now`;
  } else if (echo.match === "season" && sun) {
    sky = isEs ? `con el sol en ${sun}, la misma estación que ahora` : `with the sun in ${sun}, the same season as now`;
  } else {
    sky = isEs ? "bajo un cielo como el de esta noche" : "under a sky like tonight's";
  }
  const sentence = `${when.charAt(0).toUpperCase() + when.slice(1)}, ${sky}.`;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onLater(); };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onLater]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      onClick={onLater}
      style={{
        position: "fixed", inset: 0, height: "100dvh", zIndex: 9999, display: "flex",
        alignItems: "center", justifyContent: "center",
        padding: "max(var(--sat, 0px), 20px) 22px max(var(--sab, 0px), 20px)",
        overflow: "hidden", overscrollBehavior: "contain",
        background: "rgb(var(--rgb-scrim) / 0.5)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
        animation: "skFade .4s ease both",
      }}
    >
      <style>{`
        @keyframes skFade{from{opacity:0}to{opacity:1}}
        @keyframes skRise{from{opacity:0;transform:translateY(16px) scale(.97)}to{opacity:1;transform:none}}
        @keyframes orbBreathe{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-6px) scale(1.012)}}
      `}</style>
      <div
        onClick={(e) => e.stopPropagation()}
        className="rounded-[28px]"
        style={{
          maxWidth: 430, width: "100%", position: "relative", textAlign: "center",
          padding: "40px 28px 26px",
          maxHeight: "100%", overflowY: "auto", WebkitOverflowScrolling: "touch", overscrollBehavior: "contain",
          background: "rgb(var(--rgb-card))",
          border: "1px solid rgb(var(--rgb-border))",
          boxShadow: "0 30px 90px rgb(var(--rgb-scrim) / 0.16)",
          animation: "skRise .55s cubic-bezier(.2,.75,.2,1) both",
        }}
      >
        <button
          onClick={onDismiss}
          aria-label={t("common.close")}
          className="absolute hit-44 hit-44-32"
          style={{ top: 14, right: 16, width: 32, height: 32, borderRadius: 999, border: "1px solid rgb(var(--rgb-border))", color: "rgb(var(--rgb-text-secondary))", background: "transparent", fontSize: 18, lineHeight: 1 }}
        >×</button>

        {/* a soft moon, the sky returning */}
        <div style={{ position: "relative", width: 60, height: 60, margin: "0 auto 18px" }}>
          <Image src="/solray-orb.png" alt="" width={60} height={60} unoptimized style={{ position: "relative", width: 60, height: 60, objectFit: "contain", animation: "orbBreathe 11s ease-in-out infinite", filter: "drop-shadow(0 14px 22px rgb(var(--rgb-indigo) / .26))" }} />
        </div>

        <p className="font-body" style={{ fontSize: 14, fontWeight: 700, letterSpacing: "0.28em", textTransform: "uppercase", color: "rgb(var(--rgb-wisteria))", marginBottom: 14 }}>
          {t("sky_echo.eyebrow")}
        </p>
        <h2 className="font-heading text-text-primary" style={{ fontSize: "1.62rem", lineHeight: 1.12, fontWeight: 900, letterSpacing: "-.038em", marginBottom: 16 }}>
          {sentence}
        </h2>
        <p className="font-heading text-text-secondary" style={{ fontSize: 17, lineHeight: 1.6, maxWidth: 340, margin: "0 auto" }}>
          &ldquo;{echo.excerpt}&rdquo;
        </p>

        <div style={{ width: 36, height: 1, background: "rgb(var(--rgb-border))", margin: "26px auto 22px" }} />

        <button
          onClick={() => onGoDeeper(sentence, echo.excerpt)}
          className="w-full rounded-full transition active:scale-[0.98]"
          style={{ background: "rgb(var(--rgb-text-primary))", color: "rgb(var(--rgb-bg-deep))", padding: "15px", fontSize: 17, fontWeight: 700, letterSpacing: "-.01em", border: "1.5px solid rgb(var(--rgb-text-primary))" }}
        >
          {t("insight.go_deeper")}
        </button>
        <button
          onClick={onLater}
          className="font-body"
          style={{ marginTop: 16, fontSize: 15, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgb(var(--rgb-text-muted))", background: "transparent" }}
        >
          {t("insight.dismiss")}
        </button>
      </div>
    </div>,
    document.body
  );
}
