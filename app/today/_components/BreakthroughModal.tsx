"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { useT } from "@/lib/i18n";
import { type PendingInsight } from "../_lib/today-data";

// The breakthrough she reached on her own while the user was away. It does
// not sit in the feed; it rises in front of everything as the Breakthrough of
// the Day, a single moment to meet before the day begins. Surfaced once (the
// server marks it surfaced on fetch), and the chat Oracle still carries it via
// get_recent_insight, so a dismissed moment is never a lost insight.
export function BreakthroughModal({ insight, onAsk, onLater, onDismiss }: { insight: PendingInsight; onAsk: () => void; onLater: () => void; onDismiss: () => void }) {
  const { t } = useT();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onLater(); };
    window.addEventListener("keydown", onKey);
    // Lock background scroll so nothing slides behind the moment.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onLater]);

  if (typeof document === "undefined") return null;

  // Portal to the page body so the overlay escapes any transformed ancestor
  // on Today and pins to the real viewport instead of the document flow.
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
        animation: "bkFade .4s ease both",
      }}
    >
      <style>{`
        @keyframes bkFade{from{opacity:0}to{opacity:1}}
        @keyframes bkRise{from{opacity:0;transform:translateY(16px) scale(.97)}to{opacity:1;transform:none}}
        @keyframes orbBreathe{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-6px) scale(1.012)}}
      `}</style>
      <div
        onClick={(e) => e.stopPropagation()}
        className="rounded-[28px]"
        style={{
          // The modal card is always dark; pin the night palette so its
          // var(--text-*) stay light on both themes (else light mode renders
          // near-black text on the dark card, invisible).
          maxWidth: 430, width: "100%", position: "relative", textAlign: "center",
          padding: "40px 28px 26px",
          maxHeight: "100%", overflowY: "auto", WebkitOverflowScrolling: "touch", overscrollBehavior: "contain",
          background: "rgb(var(--rgb-card))",
          border: "1px solid rgb(var(--rgb-border))",
          boxShadow: "0 30px 90px rgb(var(--rgb-scrim) / 0.16)",
          animation: "bkRise .55s cubic-bezier(.2,.75,.2,1) both",
        }}
      >
        <button
          onClick={onDismiss}
          aria-label={t("common.close")}
          className="absolute hit-44 hit-44-32"
          style={{ top: 14, right: 16, width: 32, height: 32, borderRadius: 999, border: "1px solid rgb(var(--rgb-border))", color: "rgb(var(--rgb-text-secondary))", background: "transparent", fontSize: 18, lineHeight: 1 }}
        >×</button>

        {/* the real Solray sun, beating */}
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

        <p className="font-body" style={{ fontSize: 14, fontWeight: 700, letterSpacing: "0.28em", textTransform: "uppercase", color: "var(--amber)", marginBottom: 14 }}>
          {t("insight.of_the_day")}
        </p>
        <h2 className="font-heading text-text-primary" style={{ fontSize: "1.62rem", lineHeight: 1.12, fontWeight: 900, letterSpacing: "-.038em", marginBottom: 14 }}>
          {insight.title}
        </h2>
        <p className="font-body text-text-secondary" style={{ fontSize: 17, lineHeight: 1.62, maxWidth: "26em", margin: "0 auto" }}>
          {insight.body}
        </p>

        {/* divider in the Oracle's wisteria, hinting where Go deeper leads */}
        <div style={{ width: 36, height: 1, background: "rgb(var(--rgb-border))", margin: "26px auto 22px" }} />

        <button
          onClick={onAsk}
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
