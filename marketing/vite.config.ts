import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

/**
 * The marketing site at ezhalha.co.
 *
 * A separate Vite app rather than a route inside the portal. The portal ships as a single ~2.1 MB
 * chunk with no code splitting, and its AuthProvider blocks first paint on /api/auth/me — a
 * marketing page inheriting either would be slow for visitors and near-invisible to crawlers.
 * This build carries none of that.
 *
 * Two outputs: a hydration bundle, and an SSR bundle that `script/prerender.ts` runs once per
 * locale to write real HTML to disk.
 */
const root = path.resolve(import.meta.dirname);
const repo = path.resolve(root, "..");

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  root,
  resolve: {
    alias: {
      "@marketing": path.resolve(root, "src"),
      "@shared": path.resolve(repo, "shared"),
    },
  },
  build: {
    outDir: path.resolve(root, "dist"),
    emptyOutDir: mode !== "ssr-build",
    // The prerendered HTML is the product; the hydration bundle should stay small enough that it
    // never becomes the reason the page is slow.
    chunkSizeWarningLimit: 400,
  },
  // `vite preview` serves the prerendered output, which is what actually ships — so it gets the
  // same proxy, otherwise the widgets can only be tested in dev mode.
  preview: {
    port: 5175,
    proxy: {
      "/api": { target: process.env.MARKETING_API_TARGET || "http://127.0.0.1:5000", changeOrigin: true },
    },
  },
  server: {
    port: 5174,
    strictPort: false,
    // In production nginx proxies ezhalha.co/api/ to the same Node backend, which is what keeps
    // these calls same-origin. Mirror that locally so dev and prod agree about the API's address.
    proxy: {
      "/api": {
        target: process.env.MARKETING_API_TARGET || "http://127.0.0.1:5000",
        changeOrigin: true,
      },
    },
  },
}));
