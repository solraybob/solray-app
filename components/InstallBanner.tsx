"use client";

// Slim "add to home screen" bar for logged-in users browsing on the web who
// have NOT installed the PWA. Sits at the very top of every protected page,
// above the TrialBanner. Smooth and readable, not a heavy banner: one line,
// a small Add action, a dismiss.
//
// Visibility rules (renders nothing otherwise):
//  - hidden in the native app shell (they already have it) and once installed
//    (standalone display mode)
//  - shows when the browser offers install (Android/desktop) or on iOS Safari
//    (where it reveals the manual Share -> Add to Home Screen step on tap)
//  - dismissible; stays hidden for 7 days after a dismiss, then may return

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { useAuth } from "@/lib/auth-context";
import { isRunningInCapacitor } from "@/lib/native-push";

const DISMISS_KEY = "solray_install_banner_dismissed_at";
const RESHOW_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

export default function InstallBanner() {
  const { t } = useT();
  const { token } = useAuth();
  const [prompt, setPrompt] = useState<any>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [hidden, setHidden] = useState(true);
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Native shell already is the app; nothing to install.
    if (isRunningInCapacitor()) return;
    // Already installed (opened from home screen)?
    const standalone =
      (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
      (window.navigator as any).standalone === true;
    if (standalone) return;
    // Recently dismissed?
    try {
      const at = Number(localStorage.getItem(DISMISS_KEY) || 0);
      if (at && Date.now() - at < RESHOW_AFTER_MS) return;
    } catch (_) {}

    const ua = window.navigator.userAgent || "";
    const iOS =
      /iphone|ipad|ipod/i.test(ua) ||
      (/Macintosh/i.test(ua) && typeof document !== "undefined" && "ontouchend" in document);
    setIsIOS(iOS);

    if ((window as any).__solrayInstall) setPrompt((window as any).__solrayInstall);
    const onInstallable = () => setPrompt((window as any).__solrayInstall || null);
    const onInstalled = () => {
      setPrompt(null);
      setHidden(true);
    };
    const onNative = (e: Event) => {
      e.preventDefault();
      (window as any).__solrayInstall = e;
      setPrompt(e);
    };
    window.addEventListener("solray:installable", onInstallable);
    window.addEventListener("solray:installed", onInstalled);
    window.addEventListener("beforeinstallprompt", onNative as EventListener);
    window.addEventListener("appinstalled", onInstalled);

    // Reveal only when there is something to act on (a prompt or iOS).
    setHidden(!((window as any).__solrayInstall || iOS));
    return () => {
      window.removeEventListener("solray:installable", onInstallable);
      window.removeEventListener("solray:installed", onInstalled);
      window.removeEventListener("beforeinstallprompt", onNative as EventListener);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Re-evaluate visibility when a prompt arrives after mount.
  useEffect(() => {
    if (prompt) setHidden(false);
  }, [prompt]);

  if (!token || hidden) return null;
  if (!prompt && !isIOS) return null;

  const handleAdd = async () => {
    if (prompt) {
      try {
        prompt.prompt();
        await prompt.userChoice;
      } catch (_) {}
      (window as any).__solrayInstall = null;
      setPrompt(null);
      setHidden(true);
    } else if (isIOS) {
      setShowHint((v) => !v);
    }
  };

  const handleDismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch (_) {}
    setHidden(true);
  };

  return (
    <div
      style={{
        background: "linear-gradient(180deg, rgba(243,146,48,0.06) 0%, rgb(var(--rgb-bg-dark)) 100%)",
        borderBottom: "1px solid rgb(var(--rgb-border))",
      }}
    >
      <div className="max-w-lg mx-auto px-5 py-2.5 flex items-center justify-between gap-3">
        <button
          onClick={handleAdd}
          className="flex items-center gap-2 min-w-0 text-left"
          aria-label={t("install.cta")}
        >
          <span style={{ color: "var(--amber)", flexShrink: 0, display: "inline-flex" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 3v12m0 0l-4-4m4 4l4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M5 18.5h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </span>
          <span className="font-body text-text-primary text-[13px] truncate" style={{ letterSpacing: "0.01em" }}>
            {t("install.banner")}
          </span>
        </button>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleAdd}
            className="font-body text-[11px] tracking-[0.18em] uppercase px-3 py-1.5 rounded-md transition-colors"
            style={{
              background: "rgba(243,146,48,0.12)",
              border: "1px solid rgba(243,146,48,0.5)",
              color: "var(--amber)",
              fontWeight: 500,
            }}
          >
            {t("install.action")}
          </button>
          <button
            onClick={handleDismiss}
            className="w-7 h-7 flex items-center justify-center text-text-secondary opacity-50 hover:opacity-80 transition-opacity"
            aria-label={t("install.dismiss")}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {showHint && isIOS && (
        <div className="max-w-lg mx-auto px-5 pb-3 -mt-1">
          <p className="font-body text-text-secondary text-[12px] leading-relaxed">{t("install.ios_hint")}</p>
        </div>
      )}
    </div>
  );
}
