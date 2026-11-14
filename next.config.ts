import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets parallel dev servers use separate build folders (NEXT_DIST_DIR=.next-b).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // The sample course, the reminder templates and the prompts are read from disk at runtime; ship them with every API route.
  outputFileTracingIncludes: {
    "/api/**/*": ["./sample/**/*", "./templates/**/*", "./prompts/**/*"],
  },
  serverExternalPackages: ["@libsql/client", "libsql"],
  eslint: { ignoreDuringBuilds: true },
  poweredByHeader: false,
};

export default nextConfig;
