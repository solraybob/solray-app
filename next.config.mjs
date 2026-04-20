/** @type {import('next').NextConfig} */

// Build-time identifier. On Vercel, every deploy has a unique
// VERCEL_GIT_COMMIT_SHA. Locally we fall back to the build timestamp so
// each `next build` still produces a fresh id.
const BUILD_ID =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.BUILD_ID ||
  String(Date.now());

const nextConfig = {
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
