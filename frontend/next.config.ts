import type { NextConfig } from "next";

// CR-056: UI and API are served by this Next.js runtime.
const nextConfig: NextConfig = {
  // NEXT_DIST_DIR: the e2e / Atlas test stack runs `next dev` beside the dev server, so it needs its own
  // folder (`next dev` locks <distDir>/dev). Unset = the default .next (frontend/e2e/test-stack.cjs).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // The (app) shell renders pages only after GET /api/v1/me (client fetch), so
    // implicit instant-navigation validation would flag every page. Validate only
    // segments that opt in with `export const instant = true`.
    instantInsights: { validationLevel: "manual-warning" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },

};

export default nextConfig;
