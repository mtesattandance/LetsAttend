import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

/** Config file directory (stable even if `process.cwd()` is a parent folder). */
const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const withPWA = withPWAInit({
  dest: "public",
  /** Service worker + precache only in production builds (avoids cache issues in dev). */
  disable: process.env.NODE_ENV === "development",
  register: true,
  scope: "/",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
});

const nextConfig: NextConfig = {
  /** Smaller prod image / Docker: run `node .next/standalone/server.js` with `.next/static` copied. */
  output: "standalone",
  /** Avoid bundling firebase-admin; keeps API routes reliable in production. */
  serverExternalPackages: ["firebase-admin"],
  turbopack: {
    root: projectRoot,
  },
};

export default withPWA(nextConfig);
