"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

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

  // FOUC-killer + theme detection. global-error renders OUTSIDE the
  // root layout's ThemeProvider tree (Next renders it on a fresh
  // document on uncaught errors), so we have to read the saved theme
  // from localStorage and apply it manually. Without this, light-mode
  // users hit a hard-black error page that breaks the brand. With it,
  // the error surface belongs to whichever theme the user chose.
  const themeAttr = `(function(){try{var t=localStorage.getItem('solray-theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`;
  return (
    <html suppressHydrationWarning>
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
        <div className="text-center p-8" style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}>
          <h2 className="text-2xl font-light mb-3" style={{ letterSpacing: "0.05em", fontWeight: 300, color: "rgb(var(--rgb-text-primary) / 0.9)" }}>The cosmos shifted.</h2>
          <p className="text-xs mb-8" style={{ letterSpacing: "0.18em", textTransform: "uppercase", fontFamily: "'Inter', sans-serif", color: "rgb(var(--rgb-text-secondary) / 0.7)" }}>
            We&apos;ve been notified.
          </p>
          <button
            onClick={reset}
            className="px-6 py-2 rounded-lg text-xs transition tracking-widest uppercase"
            style={{
              fontFamily: "'Inter', sans-serif",
              border: "1px solid rgb(var(--rgb-border))",
              color: "rgb(var(--rgb-text-secondary))",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
