import type { NextConfig } from "next";

const config: NextConfig = {
  output: process.env.VERCEL ? undefined : "standalone",
  poweredByHeader: false,
  async headers() { return [{ source: "/:path*", headers: [
    { key: "Referrer-Policy", value: "no-referrer" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  ] }]; },
  devIndicators: false,
  allowedDevOrigins: ["127.0.0.1"],
};

export default config;
