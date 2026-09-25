/** @type {import('next').NextConfig} */

// Build-time identifier. On Vercel, every deploy has a unique
// VERCEL_GIT_COMMIT_SHA. Locally we fall back to the build timestamp so
// each `next build` still produces a fresh id.
const BUILD_ID =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.BUILD_ID ||
  String(Date.now());

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
