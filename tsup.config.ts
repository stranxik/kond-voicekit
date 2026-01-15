import { defineConfig } from "tsup";

export default defineConfig([
  // Main bundle (core + stt + tts + vad + ml)
  {
    entry: ["src/index.ts"],
    format: ["cjs", "esm"],
    dts: true,
    clean: true,
    splitting: false,
    sourcemap: true,
    external: ["react", "react-dom"],
  },
  // React bundle (separate for tree-shaking)
  {
    entry: ["src/react/index.ts"],
    format: ["cjs", "esm"],
    dts: true,
    outDir: "dist/react",
    external: ["react", "react-dom"],
  },
]);
