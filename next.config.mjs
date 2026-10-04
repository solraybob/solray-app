/** @type {import('next').NextConfig} */

// Build-time identifier. It MUST be the same value in the client bundle and
// in the server's /api/build-id, or VersionCheck reloads every page forever.
//
// Incident 2026-10-05: a `vercel deploy` from the CLI has no
// VERCEL_GIT_COMMIT_SHA, so this fell back to String(Date.now()). Next
// evaluates this file more than once per build, so the client and the server
// got two different timestamps and app.solray.ai reloaded itself every few
// seconds for about 12 minutes. Never fall back to a clock. VERCEL_DEPLOYMENT_ID
// is stable for one deployment; with nothing stable available the id is
// "unknown", which VersionCheck treats as "do not auto-reload".
const BUILD_ID =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.BUILD_ID ||
  process.env.VERCEL_DEPLOYMENT_ID ||
  "unknown";

// Baseline security headers. No page of the member app (payment form
// included) may be framed by another site: that is how clickjacking works.
// /widget is left frameable on purpose, it exists to be embedded.
const SECURITY_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
];

const nextConfig = {
  async headers() {
    return [
      { source: '/', headers: SECURITY_HEADERS },
      { source: '/:path((?!widget).*)', headers: SECURITY_HEADERS },
    ];
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
  },
  env: {
    // Exposed to the client bundle at build time. The client embeds this
    // value, then periodically polls /api/build-id for the server's current
    // value and auto-reloads when they differ. See components/VersionCheck.
    NEXT_PUBLIC_BUILD_ID: BUILD_ID,
  },
};

export default nextConfig;
