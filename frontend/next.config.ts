import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.API_URL || "http://localhost:8000"}/api/:path*`,
      },
      {
        source: "/auth/:path*",
        destination: `${process.env.API_URL || "http://localhost:8000"}/auth/:path*`,
      },
    ];
  },
};

export default nextConfig;
