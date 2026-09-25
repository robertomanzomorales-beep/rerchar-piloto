import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: { serverActions: { bodySizeLimit: process.env.VERCEL ? "4.3mb" : "6mb" } },
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  outputFileTracingExcludes: {
    "/*": ["./.local/**/*", "./.next/lock"],
  },
};

export default nextConfig;
