import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // Native or Node-only packages used by the grader; load them at runtime instead of bundling.
  serverExternalPackages: ["litesvm", "@phala/dstack-sdk", "@coral-xyz/anchor"],
};

export default nextConfig;
