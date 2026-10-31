import { join } from "node:path";
import { createMDX } from "fumadocs-mdx/next";

// Static export: pages and the search index are built ahead of time and served
// from Workers static assets. Headers and the root redirect live in
// worker/index.js so no page rendering happens in the Worker (Free plan: 10 ms
// CPU per request).
export default createMDX()({
  output: "export",
  reactStrictMode: true,
  poweredByHeader: false,
  // The monorepo root, where pnpm keeps the packages.
  turbopack: { root: join(process.cwd(), "../..") },
  images: { unoptimized: true },
});
