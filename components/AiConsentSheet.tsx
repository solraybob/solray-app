"use client";

// Third-party AI consent sheet (App Store Guideline 5.1.2(i)).
//
// Opens in two cases:
//   1. Once per app session, when the signed-in member's /users/me says
//      ai_consent_required (members who joined before consent was recorded,
//      or whose recorded version is older than the current policy).
//   2. Whenever any API call answers 403 with code "ai_consent_required"
//      (lib/api.ts fires AI_CONSENT_EVENT), and when Settings asks for it.
//
// Never shown to an account under 16 (/users/me age_restricted): the server
// refuses its consent (403 under_minimum_age) and keeps the AI closed.
//
// Accept records consent on the server. Not now closes the sheet; the parts
// of Solray that do not use AI (chart, Souls charts, settings) keep working,
// and the sheet comes back the next time an AI feature is used.
//
// Rendered through a portal on document.body: the pull-to-refresh wrapper is
// a transformed containing block, which would trap a fixed overlay.

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/i18n";
import { apiFetch } from "@/lib/api";
import {
  AI_CONSENT_CHANGED_EVENT,
  AI_CONSENT_EVENT,
  AI_CONSENT_VERSION,
  ageRestrictedFromMe,
  consentFromMe,
} from "@/lib/ai-consent";
import { safeGet, safeSet } from "@/lib/safe-storage";

// Session-scoped (sessionStorage), and swept on every account change by
// clearUserScopedCaches, so "Not now" never carries over to another account.
const SNOOZE_KEY = "solray_ai_consent_snoozed";

// Screens where the automatic check must not interrupt: signup records
// consent itself, and the entry and legal screens have no AI.
const NO_AUTO_CHECK = ["/onboard", "/login", "/forgot-password", "/reset-password", "/verify-email", "/legal", "/admin"];

export default function AiConsentSheet() {
  const { token } = useAuth();
  const { t } = useT();
  const pathname = usePathname() || "";
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const checkedFor = useRef<string | null>(null);
  const acceptRef = useRef<HTMLButtonElement | null>(null);

  // Automatic check: once per token per app session.
  useEffect(() => {
    if (!token) { checkedFor.current = null; setOpen(false); return; }
    if (checkedFor.current === token) return;
    if (NO_AUTO_CHECK.some((p) => pathname.startsWith(p))) return;
    const tok = token;
    checkedFor.current = tok;
    if (safeGet(SNOOZE_KEY, true) === "1") return;
    // Not cancelled by navigation (this check runs once per session); only
    // an account change makes the answer irrelevant.
    apiFetch("/users/me", {}, tok)
      .then((me) => {
        // An account under 16 (age_restricted) is never asked: consenting
        // cannot open the AI for it, the AI surfaces show a note instead.
        if (checkedFor.current === tok && consentFromMe(me).required && !ageRestrictedFromMe(me)) setOpen(true);
      })
      .catch(() => { /* the 403 path will ask when an AI feature is used */ });
  }, [token, pathname]);

  // Any screen (or lib/api on a 403) can ask for the sheet.
  useEffect(() => {
    const onAsk = (e: Event) => {
      if (!token) return;
      // A background load's refusal respects this session's "Not now".
      const quiet = (e as CustomEvent<{ quiet?: boolean } | undefined>).detail?.quiet === true;
      if (quiet && safeGet(SNOOZE_KEY, true) === "1") return;
      setError("");
      setOpen(true);
    };
    window.addEventListener(AI_CONSENT_EVENT, onAsk);
    return () => window.removeEventListener(AI_CONSENT_EVENT, onAsk);
  }, [token]);

  const notNow = useCallback(() => {
    if (saving) return;
    safeSet(SNOOZE_KEY, "1", true);
    setOpen(false);
  }, [saving]);

  // Escape closes like Not now; the page behind does not scroll; focus
  // starts on the primary action so keyboard and screen-reader users land
  // inside the sheet.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") notNow(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const id = window.setTimeout(() => acceptRef.current?.focus(), 50);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      window.clearTimeout(id);
    };
  }, [open, notNow]);

  const accept = async () => {
    if (!token || saving) return;
    setSaving(true);
    setError("");
    try {
      await apiFetch("/users/me/ai-consent", {
        method: "POST",
        body: JSON.stringify({ version: AI_CONSENT_VERSION }),
      }, token);
      setOpen(false);
      try { window.dispatchEvent(new CustomEvent(AI_CONSENT_CHANGED_EVENT, { detail: { granted: true } })); } catch { /* ignore */ }
    } catch {
      setError(t("ai_consent.save_failed"));
    } finally {
      setSaving(false);
    }
  };

  if (!open || !token || typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-consent-title"
      style={{
        position: "fixed", inset: 0, height: "100dvh", zIndex: 10000, display: "flex",
        alignItems: "flex-end", justifyContent: "center",
        padding: "max(var(--sat, 0px), 20px) 16px max(var(--sab, 0px), 16px)",
        background: "rgb(var(--rgb-scrim) / 0.5)",
        backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
      }}
    >
      <div
        style={{
          width: "100%", maxWidth: 480, maxHeight: "100%", overflowY: "auto",
          WebkitOverflowScrolling: "touch", overscrollBehavior: "contain",
          background: "rgb(var(--rgb-card))",
          border: "1px solid rgb(var(--rgb-border))",
          borderRadius: 24,
          padding: "26px 22px 18px",
          boxShadow: "0 30px 90px rgb(var(--rgb-scrim) / 0.16)",
        }}
      >
        <h2
          id="ai-consent-title"
          className="font-heading"
          style={{ fontSize: 24, fontWeight: 900, letterSpacing: "-.02em", lineHeight: 1.15, color: "rgb(var(--rgb-text-primary))" }}
        >
          {t("ai_consent.title")}
        </h2>
        <p className="font-body" style={{ marginTop: 12, fontSize: 16, lineHeight: 1.6, color: "rgb(var(--rgb-text-secondary))" }}>
          {t("onboard.ai_consent")}{" "}
          <a
            href="https://solray.ai/legal"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-4"
            style={{ color: "rgb(var(--rgb-text-primary))" }}
          >
            {t("onboard.ai_consent_link")}
          </a>
        </p>
        <p className="font-body" style={{ marginTop: 10, fontSize: 14, lineHeight: 1.55, color: "rgb(var(--rgb-text-muted))" }}>
          {t("ai_consent.not_now_hint")}
        </p>
        {error && (
          <p role="alert" className="font-body" style={{ marginTop: 10, fontSize: 14, color: "rgb(var(--rgb-ember))" }}>{error}</p>
        )}
        <button
          ref={acceptRef}
          type="button"
          onClick={accept}
          disabled={saving}
          className="w-full font-body font-bold rounded-full uppercase disabled:opacity-50"
          style={{
            marginTop: 20, minHeight: 48, fontSize: 14, letterSpacing: "0.2em",
            background: "rgb(var(--rgb-text-primary))", color: "rgb(var(--rgb-bg-deep))",
            border: "1.5px solid rgb(var(--rgb-text-primary))",
          }}
        >
          {saving ? t("ai_consent.saving") : t("ai_consent.accept")}
        </button>
        <button
          type="button"
          onClick={notNow}
          disabled={saving}
          className="w-full font-body"
          style={{ marginTop: 6, minHeight: 44, fontSize: 15, color: "rgb(var(--rgb-text-secondary))", background: "transparent" }}
        >
          {t("ai_consent.not_now")}
        </button>
      </div>
    </div>,
    document.body,
  );
}
