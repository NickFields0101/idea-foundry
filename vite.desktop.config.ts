import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

const rendererRoot = fileURLToPath(new URL("./desktop/renderer", import.meta.url));
const outputDirectory = fileURLToPath(new URL("./desktop-dist", import.meta.url));

export default defineConfig({
  root: rendererRoot,
  base: "./",
  publicDir: false,
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  build: {
    outDir: outputDirectory,
    emptyOutDir: true,
    target: "chrome130",
    sourcemap: false,
    modulePreload: { polyfill: false },
  },
});
