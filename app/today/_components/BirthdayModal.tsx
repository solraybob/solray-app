"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { useT } from "@/lib/i18n";

// Signed days to the user's next/last birthday (positive = upcoming, negative
// = just passed). Used to gate the once-a-year birthday takeover.
export function daysToBirthday(birthDateStr: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const b = new Date(birthDateStr);
  if (isNaN(b.getTime())) return Infinity;
  const thisYear = new Date(today.getFullYear(), b.getMonth(), b.getDate());
  let d = Math.round((thisYear.getTime() - today.getTime()) / 86400000);
  if (d < -7) {
    const nextYear = new Date(today.getFullYear() + 1, b.getMonth(), b.getDate());
    d = Math.round((nextYear.getTime() - today.getTime()) / 86400000);
  }
  return d;
}

// Birthday (solar return) takeover: once a year, the Sun returns to its birth
// position. Gold radiant sun, distinct from the breakthrough's logo sun.
export function BirthdayModal({ birthDate, onGoDeeper, onLater, onDismiss }: { birthDate: string; onGoDeeper: () => void; onLater: () => void; onDismiss: () => void }) {
  const { t, lang } = useT();
  let bornLabel = "";
  try {
    const d = new Date(birthDate);
    if (!isNaN(d.getTime())) bornLabel = d.toLocaleDateString(lang === "en" ? "en-GB" : lang, { day: "numeric", month: "long", year: "numeric" });
  } catch (_) {}

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
        animation: "bdFade .4s ease both",
      }}
    >
      <style>{`
        @keyframes bdFade{from{opacity:0}to{opacity:1}}
        @keyframes bdRise{from{opacity:0;transform:translateY(16px) scale(.97)}to{opacity:1;transform:none}}
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
          animation: "bdRise .55s cubic-bezier(.2,.75,.2,1) both",
        }}
      >
        <button
          onClick={onDismiss} aria-label={t("common.close")} className="absolute hit-44 hit-44-32"
          style={{ top: 14, right: 16, width: 32, height: 32, borderRadius: 999, border: "1px solid rgb(var(--rgb-border))", color: "rgb(var(--rgb-text-secondary))", background: "transparent", fontSize: 18, lineHeight: 1 }}
        >×</button>

        {/* the real Solray sun, returning home, beating like the breakthrough */}
        <div style={{ position: "relative", width: 64, height: 64, margin: "0 auto 18px" }}>
          <Image
            src="/solray-orb.png"
            alt=""
            width={64}
            height={64}
            unoptimized
            style={{ position: "relative", width: 64, height: 64, objectFit: "contain", animation: "orbBreathe 11s ease-in-out infinite", filter: "drop-shadow(0 14px 22px rgb(var(--rgb-indigo) / .26))" }}
          />
        </div>

        <p className="font-body" style={{ fontSize: 14, fontWeight: 700, letterSpacing: "0.28em", textTransform: "uppercase", color: "var(--amber)", marginBottom: 12 }}>
          {t("solar.eyebrow")}
        </p>
        <h2 className="font-heading text-text-primary" style={{ fontSize: "1.62rem", lineHeight: 1.12, fontWeight: 900, letterSpacing: "-.038em", marginBottom: 12 }}>
          {t("solar.new_year_begins")}
        </h2>
        {bornLabel && (
          <p className="font-body" style={{ fontSize: 14, letterSpacing: "0.04em", color: "var(--amber)", opacity: 0.85, marginBottom: 14 }}>
            {t("solar.born").replace("{date}", bornLabel)}
          </p>
        )}
        <p className="font-body text-text-secondary" style={{ fontSize: 17, lineHeight: 1.62, maxWidth: "26em", margin: "0 auto" }}>
          {t("solar.body")}
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
