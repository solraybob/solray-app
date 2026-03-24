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
        <div className="text-center p-8">
          <h2 className="text-white text-xl font-medium mb-4">Something went wrong</h2>
          <p className="text-white/50 text-sm mb-6">
            We&apos;ve been notified and will look into it.
          </p>
          <button
            onClick={reset}
            className="px-6 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm transition"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
