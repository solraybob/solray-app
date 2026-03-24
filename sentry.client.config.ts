import * as Sentry from "@sentry/nextjs";

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    tracesSampleRate: 0.1,
    environment: process.env.NODE_ENV,
    // Only capture errors in production/preview, not local dev noise
    beforeSend(event) {
      if (process.env.NODE_ENV === "development") {
        return null;
      }
      return event;
    },
  });
}
