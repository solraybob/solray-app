"use client";

// The fixed crisis card, drawn in the chat thread instead of a block of text.
//
// The server decides when it shows (ai/crisis.py tiers) and sends its words
// as data in the member's language (`crisis_card` on /chat, or `support` on
// a consent refusal): the member's own country's lines first, as tap-to-call
// (tel:) and tap-to-text (sms:) buttons, everyone else's under "If you're
// somewhere else", findahelpline.com for every other country.
//
// Variants:
//   standard  intro, own lines, emergency line, other countries, closing
//   urgent    emergency first (a plan, the means or a time was mentioned)
//   support   a short kind note and the member's line (no AI consent yet)
//
// The only strings here are the small chrome (label, show/hide); everything
// the member reads in the card comes from the server, in their language.

import { useState } from "react";
import { useT } from "@/lib/i18n";
import { SAFE_HREF, type CrisisCardData, type CrisisCountry, type CrisisLine } from "@/lib/crisis-card";

function LineButton({ line, strong }: { line: CrisisLine; strong?: boolean }) {
  if (!SAFE_HREF.test(line.href)) return null;
  const external = line.href.startsWith("https://");
  return (
    <a
      href={line.href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className="inline-flex items-center gap-2 rounded-full font-body font-bold transition-opacity active:opacity-70"
      style={{
        padding: "10px 16px",
        fontSize: 15,
        minHeight: 44,
        background: strong ? "rgb(var(--rgb-wisteria))" : "transparent",
        color: strong ? "rgb(var(--rgb-bg-deep))" : "rgb(var(--rgb-text-primary))",
        border: strong ? "1px solid rgb(var(--rgb-wisteria))" : "1px solid rgb(var(--rgb-border))",
        textDecoration: "none",
      }}
    >
      <LineIcon type={line.type} />
      <span>{line.label}</span>
    </a>
  );
}

function LineIcon({ type }: { type: CrisisLine["type"] }) {
  const common = { width: 15, height: 15, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
    strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (type === "call") {
    return (
      <svg {...common}><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" /></svg>
    );
  }
  if (type === "text") {
    return <svg {...common}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>;
  }
  return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></svg>;
}

function CountryBlock({ c, strong }: { c: CrisisCountry; strong?: boolean }) {
  return (
    <div className="space-y-2">
      <p className="font-body text-text-secondary" style={{ fontSize: 14, lineHeight: 1.45 }}>
        <span className="font-bold text-text-primary">{c.name}</span>
        {c.service ? <span>{" · "}{c.service}</span> : null}
      </p>
      <div className="flex flex-wrap gap-2">
        {c.lines.map((ln) => (
          <LineButton key={ln.href} line={ln} strong={strong && ln.type === "call"} />
        ))}
      </div>
    </div>
  );
}

// The sentence with "findahelpline.com" turned into its link, wherever the
// language puts it.
function FindAHelpline({ text, href, label }: { text: string; href: string; label: string }) {
  const i = text.indexOf(label);
  const link = (
    <a href={href} target="_blank" rel="noopener noreferrer" className="font-bold"
      style={{ color: "rgb(var(--rgb-wisteria))", textDecoration: "underline" }}>
      {label}
    </a>
  );
  return (
    <p className="font-body text-text-secondary" style={{ fontSize: 15, lineHeight: 1.5 }}>
      {i < 0 ? <>{text} {link}</> : <>{text.slice(0, i)}{link}{text.slice(i + label.length)}</>}
    </p>
  );
}

export default function CrisisCard({ card }: { card: CrisisCardData }) {
  const { t } = useT();
  const [showOthers, setShowOthers] = useState(!card.primary);
  const urgent = card.variant === "urgent";
  const support = card.variant === "support";
  const em = card.emergency;
  const emergencyButton = em?.href && em.label && SAFE_HREF.test(em.href)
    ? <LineButton line={{ type: "call", value: em.number || "", href: em.href, label: em.label }} strong />
    : null;
  const others = card.others || [];

  return (
    <div className="flex justify-start animate-fade-in" role="region" aria-label={t("chat.crisis_label")}>
      <div
        className="w-full rounded-2xl space-y-4"
        style={{
          padding: "18px 18px 16px",
          background: "rgb(var(--rgb-wisteria) / 0.06)",
          border: "1px solid rgb(var(--rgb-wisteria) / 0.35)",
        }}
      >
        <p
          className="font-body uppercase font-bold"
          style={{ fontSize: 12, letterSpacing: "0.22em", color: "rgb(var(--rgb-wisteria))" }}
        >
          {t("chat.crisis_label")}
        </p>

        <p className="font-body text-text-primary" style={{ fontSize: 17, lineHeight: 1.55 }}>{card.intro}</p>

        {urgent && em && (
          <div className="space-y-3">
            <p className="font-body text-text-primary font-bold" style={{ fontSize: 17, lineHeight: 1.5 }}>{em.text}</p>
            {emergencyButton}
            {(card.steps || []).map((s) => (
              <p key={s} className="font-body text-text-primary" style={{ fontSize: 16, lineHeight: 1.55 }}>{s}</p>
            ))}
          </div>
        )}

        {(card.primary_title || card.primary) && (
          <div className="space-y-3">
            {card.primary_title ? (
              <p className="font-body text-text-primary" style={{ fontSize: 16, lineHeight: 1.5 }}>{card.primary_title}</p>
            ) : null}
            {card.primary ? <CountryBlock c={card.primary} strong /> : null}
          </div>
        )}

        {!urgent && em && (
          <div className="space-y-2">
            <p className="font-body text-text-secondary" style={{ fontSize: 15, lineHeight: 1.5 }}>{em.text}</p>
            {!support && emergencyButton}
          </div>
        )}

        {others.length > 0 && (
          <div className="space-y-3">
            {card.primary ? (
              <button
                type="button"
                onClick={() => setShowOthers((v) => !v)}
                aria-expanded={showOthers}
                className="font-body font-bold text-text-secondary bg-transparent"
                style={{ fontSize: 14, minHeight: 44, padding: 0, border: 0 }}
              >
                {(card.others_title || "") + " "}
                <span style={{ color: "rgb(var(--rgb-wisteria))" }}>
                  {showOthers ? t("chat.crisis_hide") : t("chat.crisis_show")}
                </span>
              </button>
            ) : null}
            {showOthers && (
              <div className="space-y-4">
                {others.map((c) => <CountryBlock key={c.country} c={c} />)}
              </div>
            )}
          </div>
        )}

        {card.findahelpline && SAFE_HREF.test(card.findahelpline.href) && (
          <FindAHelpline text={card.findahelpline.text} href={card.findahelpline.href} label={card.findahelpline.label} />
        )}

        {card.closing ? (
          <p className="font-body text-text-primary" style={{ fontSize: 16, lineHeight: 1.55 }}>{card.closing}</p>
        ) : null}
      </div>
    </div>
  );
}
