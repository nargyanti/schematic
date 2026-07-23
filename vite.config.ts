import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// Static SPA — builds to dist/, deploys to Vercel with zero extra config.
export default defineConfig({
  base: "./",
  plugins: [tailwindcss()],
  build: {
    target: "es2021",
    outDir: "dist",
  },
});
