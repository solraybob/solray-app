"use client";

// One-tap "add to home screen" for the Solray PWA.
//
// Android / desktop Chromium: the browser fires `beforeinstallprompt`, captured
// early in app/layout.tsx onto window.__solrayInstall. Tapping the button calls
// .prompt() and the native install dialog appears; the sun icon lands on the
// home screen and the app opens fullscreen (standalone).
//
// iOS Safari: Apple blocks programmatic install, so there is no prompt event.
// We detect iOS and, on tap, show the manual instruction (Share -> Add to Home
// Screen) instead.
//
// Already installed (standalone display): render nothing.
// No prompt available and not iOS (e.g. unsupported browser): render nothing.

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";

type Variant = "primary" | "ghost";

export default function InstallApp({ variant = "ghost" }: { variant?: Variant }) {
  const { t } = useT();
  const [prompt, setPrompt] = useState<any>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Already running as an installed app? Nothing to offer.
    const standalone =
      (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
      (window.navigator as any).standalone === true;
    if (standalone) {
      setInstalled(true);
      return;
    }

    // iOS (iPhone/iPad, including iPadOS which reports as Mac + touch).
    const ua = window.navigator.userAgent || "";
    const iOS =
      /iphone|ipad|ipod/i.test(ua) ||
      (/Macintosh/i.test(ua) && typeof document !== "undefined" && "ontouchend" in document);
    setIsIOS(iOS);

    // Pick up a prompt the layout script may have already captured.
    if ((window as any).__solrayInstall) setPrompt((window as any).__solrayInstall);

    const onInstallable = () => setPrompt((window as any).__solrayInstall || null);
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
    };
    // Listen both for our forwarded event and the native one (covers the case
    // where this mounts before the layout script's listener fires).
    const onNative = (e: Event) => {
      e.preventDefault();
      (window as any).__solrayInstall = e;
      setPrompt(e);
    };
    window.addEventListener("solray:installable", onInstallable);
    window.addEventListener("solray:installed", onInstalled);
    window.addEventListener("beforeinstallprompt", onNative as EventListener);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("solray:installable", onInstallable);
      window.removeEventListener("solray:installed", onInstalled);
      window.removeEventListener("beforeinstallprompt", onNative as EventListener);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return null;
  // Only render when we can actually act: a captured prompt (Android/desktop)
  // or iOS (where we show instructions). Otherwise stay invisible.
  if (!prompt && !isIOS) return null;

  const handleClick = async () => {
    if (prompt) {
      try {
        prompt.prompt();
        await prompt.userChoice;
      } catch (_) {
        /* user dismissed or browser refused; nothing to do */
      }
      (window as any).__solrayInstall = null;
      setPrompt(null);
    } else if (isIOS) {
      setShowHint((v) => !v);
    }
  };

  const base =
    "w-full font-body text-sm tracking-wider py-3 rounded-lg transition-all duration-200 active:scale-95 flex items-center justify-center gap-2";
  const styles =
    variant === "primary"
      ? "bg-amber-sun text-forest-deep font-semibold hover:opacity-90"
      : "border border-forest-border text-text-primary hover:border-amber-sun";

  return (
    <div className="w-full">
      <button type="button" onClick={handleClick} className={`${base} ${styles}`}>
        <DownloadGlyph />
        {t("install.cta")}
      </button>

      {showHint && isIOS && (
        <div className="mt-3 rounded-lg border border-forest-border bg-forest-card px-4 py-3">
          <p className="font-body text-text-secondary text-[13px] leading-relaxed flex items-start gap-2">
            <ShareGlyph />
            <span>{t("install.ios_hint")}</span>
          </p>
          <button
            type="button"
            onClick={() => setShowHint(false)}
            className="mt-2 font-body text-amber-sun text-xs hover:opacity-80"
          >
            {t("install.close")}
          </button>
        </div>
      )}
    </div>
  );
}

// Brand-clean line glyphs (no emoji, per the app's hard rule).
function DownloadGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3v12m0 0l-4-4m4 4l4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 18.5h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function ShareGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }}>
      <path d="M12 3v12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M8 7l4-4 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 11v8a1 1 0 001 1h10a1 1 0 001-1v-8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
