import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // ── Library build mode ───────────────────────────────────────────────────
  // Run with: npm run build:lib
  // Produces: dist/fieldshield.js (ESM) + dist/fieldshield.umd.cjs (CJS)
  // Does NOT bundle the demo app — only the src/lib exports.
  if (mode === "lib") {
    return {
      plugins: [react()],
      // Do not copy the demo app's public/ assets into the library bundle
      publicDir: false,
      build: {
        lib: {
          // Entry point — exports everything consumers import from "fieldshield"
          entry: resolve(__dirname, "src/lib/index.ts"),
          name: "FieldShield",
          fileName: "fieldshield",
          formats: ["es", "umd"],
        },
        rollupOptions: {
          // React must be excluded from the bundle — consumers provide their own.
          // Bundling React would cause duplicate React instances and hook errors.
          external: ["react", "react-dom", "react/jsx-runtime"],
          output: {
            globals: {
              react: "React",
              "react-dom": "ReactDOM",
              "react/jsx-runtime": "ReactJSXRuntime",
            },
            assetFileNames: "assets/[name][extname]",
            chunkFileNames: "assets/[name].js",
          },
        },
        // Clean dist before each build
        emptyOutDir: true,
      },
    };
  }

  // ── Demo app mode (default) ───────────────────────────────────────────────
  // Run with: npm run dev or npm run build
  // Builds the full demo application for development and preview.
  return {
    plugins: [react()],
  };
});
