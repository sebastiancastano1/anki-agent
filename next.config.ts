import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "@anthropic-ai/sdk"],
};

export default nextConfig;
