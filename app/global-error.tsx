"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect, useState } from "react";
import en from "../messages/en.json";
import es from "../messages/es.json";

// global-error renders outside the root layout, so the LanguageProvider is
// not here. Read the saved language directly (the same key the provider
// uses), falling back to the browser language.
function readLang(): "en" | "es" {
  try {
    const saved = localStorage.getItem("solray_language") || "";
    if (saved.startsWith("es")) return "es";
    if (saved) return "en";
    return (navigator.language || "").toLowerCase().startsWith("es") ? "es" : "en";
  } catch {
    return "en";
  }
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  const [lang, setLang] = useState<"en" | "es">("en");
  useEffect(() => { setLang(readLang()); }, []);
  const m = (lang === "es" ? es : en).global_error;

  // FOUC-killer + theme detection. global-error renders OUTSIDE the
  // root layout's ThemeProvider tree (Next renders it on a fresh
  // document on uncaught errors), so we have to read the saved theme
  // from localStorage and apply it manually. Without this, light-mode
  // users hit a hard-black error page that breaks the brand. With it,
  // the error surface belongs to whichever theme the user chose.
  const themeAttr = `(function(){try{var t=localStorage.getItem('solray-theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`;
  return (
    <html lang={lang} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeAttr }} />
        <style dangerouslySetInnerHTML={{
          __html: `
            :root { --rgb-bg-deep: 5 15 8; --rgb-text-primary: 242 236 216; --rgb-text-secondary: 168 184 171; --rgb-border: 26 48 32; --rgb-amber: 243 146 48; }
            :root[data-theme="light"] { --rgb-bg-deep: 236 228 207; --rgb-text-primary: 16 28 21; --rgb-text-secondary: 74 90 72; --rgb-border: 201 189 160; --rgb-amber: 208 110 20; }
            body { background: rgb(var(--rgb-bg-deep)); color: rgb(var(--rgb-text-primary)); }
          `
        }} />
      </head>
      <body className="flex items-center justify-center min-h-screen">
        <div className="text-center p-8" style={{ fontFamily: 'var(--font-heading), "Zen Kaku Gothic New", system-ui, sans-serif' }}>
          <h2 className="text-2xl font-medium mb-3" style={{ fontWeight: 900, letterSpacing: "-.038em", color: "rgb(var(--rgb-text-primary))" }}>{m.title}</h2>
          <p className="text-xs mb-8" style={{ letterSpacing: "0.18em", textTransform: "uppercase", fontFamily: 'var(--font-body), "Zen Kaku Gothic New", system-ui, sans-serif', color: "rgb(var(--rgb-text-muted))" }}>
            {m.notified}
          </p>
          <button
            onClick={reset}
            className="px-6 py-2 rounded-lg text-xs transition tracking-widest uppercase font-bold"
            style={{
              fontFamily: 'var(--font-body), "Zen Kaku Gothic New", system-ui, sans-serif',
              border: "1px solid rgb(var(--rgb-border))",
              color: "rgb(var(--rgb-text-secondary))",
            }}
          >
            {m.retry}
          </button>
        </div>
      </body>
    </html>
  );
}
