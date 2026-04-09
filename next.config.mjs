import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [],
  },
};

export default withSentryConfig(nextConfig, {
  // Sentry webpack plugin options
  org: "solray",
  project: "solray-app",
  // Only upload source maps if SENTRY_AUTH_TOKEN is set (CI/CD)
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  // Disable source map upload in dev to avoid noise
  disableClientWebpackPlugin: !process.env.NEXT_PUBLIC_SENTRY_DSN,
  disableServerWebpackPlugin: !process.env.NEXT_PUBLIC_SENTRY_DSN,
  // Disable Sentry telemetry
  telemetry: false,
});
// Force rebuild
