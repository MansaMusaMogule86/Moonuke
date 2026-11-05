import { securityHeaders as buildHeaders } from "./src/server/net/csp";
import type { NextConfig } from "next";

const securityHeaders = buildHeaders({ https: (process.env.APP_URL ?? "").startsWith("https://") });

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["pg"],
  reactStrictMode: true,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
