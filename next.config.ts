import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@prisma/client",
    "@anthropic-ai/sdk",
    "@traceloop/node-server-sdk",
  ],
};

export default nextConfig;
