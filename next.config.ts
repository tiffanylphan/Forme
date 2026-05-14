import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  headers: async () => [
    {
      // HTML pages must revalidate on every request so PWA installs always
      // pick up new JS bundle hashes after a deployment.
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
      headers: [
        { key: "Cache-Control", value: "no-cache, must-revalidate" },
      ],
    },
  ],
};

export default nextConfig;
