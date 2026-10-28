"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { useT } from "@/lib/i18n";
import { tx } from "@/lib/astro-i18n";
import { type LunarEvent } from "../_lib/today-data";

// Lunar-moment takeover: fires on the day of a new or full moon (~every two
// weeks), showing where the lunation lands in your chart. Same Go deeper /
// Later interaction. Silver-moon + mist identity, distinct from the amber
// breakthrough and the wisteria recall.
export function LunarMomentModal({ event, onGoDeeper, onLater, onDismiss }: { event: LunarEvent; onGoDeeper: () => void; onLater: () => void; onDismiss: () => void }) {
  const { t, lang } = useT();
  const isEs = (lang || "").startsWith("es");
  const isFull = event.type === "Full Moon";
  const typeLabel = isFull ? (isEs ? "Luna llena" : "Full moon") : (isEs ? "Luna nueva" : "New moon");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onLater(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onLater]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog" aria-modal="true" onClick={onLater}
      style={{
        position: "fixed", inset: 0, height: "100dvh", zIndex: 9999, display: "flex",
        alignItems: "center", justifyContent: "center",
        padding: "max(var(--sat, 0px), 20px) 22px max(var(--sab, 0px), 20px)",
        overflow: "hidden", overscrollBehavior: "contain",
        background: "rgb(var(--rgb-scrim) / 0.5)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
        animation: "lnFade .4s ease both",
      }}
    >
      <style>{`
        @keyframes lnFade{from{opacity:0}to{opacity:1}}
        @keyframes lnRise{from{opacity:0;transform:translateY(16px) scale(.97)}to{opacity:1;transform:none}}
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
          animation: "lnRise .55s cubic-bezier(.2,.75,.2,1) both",
        }}
      >
        <button
          onClick={onDismiss} aria-label={t("common.close")} className="absolute hit-44 hit-44-32"
          style={{ top: 14, right: 16, width: 32, height: 32, borderRadius: 999, border: "1px solid rgb(var(--rgb-border))", color: "rgb(var(--rgb-text-secondary))", background: "transparent", fontSize: 18, lineHeight: 1 }}
        >×</button>

        <div style={{ position: "relative", width: 60, height: 60, margin: "0 auto 18px" }}>
          <Image src="/solray-orb.png" alt="" width={60} height={60} unoptimized style={{ position: "relative", width: 60, height: 60, objectFit: "contain", animation: "orbBreathe 11s ease-in-out infinite", filter: "drop-shadow(0 14px 22px rgb(var(--rgb-indigo) / .26))" }} />
        </div>

        <p className="font-body" style={{ fontSize: 14, fontWeight: 700, letterSpacing: "0.28em", textTransform: "uppercase", color: "rgb(var(--rgb-mist))", marginBottom: 12 }}>
          {typeLabel}
        </p>
        <h2 className="font-heading text-text-primary" style={{ fontSize: "1.62rem", lineHeight: 1.12, fontWeight: 900, letterSpacing: "-.038em", marginBottom: 12 }}>
          {tx(event.sign, lang)}
        </h2>
        <p className="font-body" style={{ fontSize: 15, letterSpacing: "0.04em", color: "rgb(var(--rgb-mist))", marginBottom: 4 }}>
          {t("lunar.illuminating")} {event.house}
        </p>
        {event.house_meaning && (
          <p className="font-body text-text-secondary" style={{ fontSize: 15, lineHeight: 1.5, maxWidth: 320, margin: "0 auto 14px", opacity: 0.8 }}>
            {event.house_meaning}
          </p>
        )}
        <p className="font-body text-text-secondary" style={{ fontSize: 17, lineHeight: 1.62, maxWidth: "26em", margin: "0 auto" }}>
          {event.note}
        </p>

        <div style={{ width: 36, height: 1, background: "rgb(var(--rgb-border))", margin: "26px auto 22px" }} />

        <button
          onClick={onGoDeeper}
          className="w-full rounded-full transition active:scale-[0.98]"
          style={{ background: "rgb(var(--rgb-text-primary))", color: "rgb(var(--rgb-bg-deep))", padding: "15px", fontSize: 17, fontWeight: 700, letterSpacing: "-.01em", border: "1.5px solid rgb(var(--rgb-text-primary))" }}
        >
          {t("insight.go_deeper")}
        </button>
        <button
          onClick={onLater} className="font-body"
          style={{ marginTop: 16, fontSize: 15, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgb(var(--rgb-text-muted))", background: "transparent" }}
        >
          {t("insight.dismiss")}
        </button>
      </div>
    </div>,
    document.body
  );
}
