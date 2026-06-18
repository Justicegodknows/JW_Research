/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  turbopack: {},
  experimental: {
    serverActions: { bodySizeLimit: "2mb" }
  },
  webpack: (config, { isServer }) => {
    config.resolve.extensions = ['.ts', '.tsx', '.js', '.jsx'];
    return config;
  }
};

module.exports = nextConfig;
