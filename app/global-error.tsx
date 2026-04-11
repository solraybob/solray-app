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

  return (
    <html>
      <body className="bg-black flex items-center justify-center min-h-screen">
        <div className="text-center p-8" style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}>
          <h2 className="text-white/90 text-2xl font-light mb-3" style={{ letterSpacing: "0.05em", fontWeight: 300 }}>The cosmos shifted.</h2>
          <p className="text-white/40 text-xs mb-8" style={{ letterSpacing: "0.18em", textTransform: "uppercase", fontFamily: "'Inter', sans-serif" }}>
            We&apos;ve been notified.
          </p>
          <button
            onClick={reset}
            className="px-6 py-2 border border-white/20 hover:border-white/40 text-white/60 hover:text-white/90 rounded-lg text-xs transition tracking-widest uppercase"
            style={{ fontFamily: "'Inter', sans-serif" }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
