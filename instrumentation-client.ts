import * as Sentry from "@sentry/nextjs";

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    tracesSampleRate: 0.1,
    environment: process.env.NODE_ENV,
    // Suppress dev noise — only track errors in production
    beforeSend(event) {
      if (process.env.NODE_ENV === "development") {
        return null;
      }
      return event;
    },
  });
}
