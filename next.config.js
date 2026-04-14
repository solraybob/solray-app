/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_ID: new Date().getTime().toString(), // Unique build ID (timestamp)
  },
};

module.exports = nextConfig;
