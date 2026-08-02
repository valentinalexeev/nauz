import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // TypeScript 7 (native/"tsgo") ships a different compiler API than
    // TS 5/6 — this flag tells Next.js to drive it through the TS CLI
    // instead of the old programmatic API. Required as of Next 16 to
    // type-check the build with typescript@7.
    useTypeScriptCli: true,
  },
};

export default nextConfig;
