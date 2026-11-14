import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Sample course and reminder templates are read from disk at runtime; ship them with every API route.
  outputFileTracingIncludes: {
    "/api/**/*": ["./sample/**/*", "./templates/**/*"],
  },
  serverExternalPackages: ["@libsql/client", "libsql"],
  eslint: { ignoreDuringBuilds: true },
  poweredByHeader: false,
};

export default nextConfig;
