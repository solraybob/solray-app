export async function register() {
  const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!SENTRY_DSN) return;

  if (process.env.NEXT_RUNTIME === "nodejs") {
    const Sentry = await import("@sentry/nextjs");
    Sentry.init({
      dsn: SENTRY_DSN,
      tracesSampleRate: 0.1,
    });
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    const Sentry = await import("@sentry/nextjs");
    Sentry.init({
      dsn: SENTRY_DSN,
      tracesSampleRate: 0.1,
    });
  }
}
