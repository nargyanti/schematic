import { defineConfig } from "vite";

// Static SPA — builds to dist/, deploys to Vercel with zero extra config.
export default defineConfig({
  base: "./",
  build: {
    target: "es2021",
    outDir: "dist",
  },
});
