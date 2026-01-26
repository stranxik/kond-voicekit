#!/usr/bin/env tsx
/**
 * Embed Worklet Script
 *
 * This script reads the audio-processor.worklet.js from the public folder,
 * minifies it, and embeds it into worklet-source.ts for zero-config SDK usage.
 *
 * Usage:
 *   pnpm build:worklet
 *
 * This is run automatically as a prebuild step.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// Get current directory (ESM compatible)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Paths
const WORKLET_PATH = join(__dirname, "../../../public/audio-processor.worklet.js");
const OUTPUT_PATH = join(__dirname, "../src/core/worklet-source.ts");
const PACKAGE_JSON_PATH = join(__dirname, "../package.json");

/**
 * Simple minification - removes comments and extra whitespace
 * Does not change variable names for debuggability
 */
function minifyJS(code: string): string {
  return (
    code
      // Remove block comments (/* ... */)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      // Remove line comments (// ...)
      .replace(/\/\/.*$/gm, "")
      // Collapse multiple spaces/newlines into single space
      .replace(/\s+/g, " ")
      // Remove spaces around operators (simple cases)
      .replace(/\s*([{}();,=<>+\-*\/])\s*/g, "$1")
      // Restore space after keywords
      .replace(/(if|for|while|return|const|let|var|function|class|new|typeof|instanceof)\(/g, "$1 (")
      .replace(/(else)\{/g, "$1 {")
      .trim()
  );
}

/**
 * Read version from package.json
 */
function getVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(PACKAGE_JSON_PATH, "utf-8"));
    return pkg.version || "0.0.0";
  } catch {
    console.warn("Warning: Could not read package.json version, using 0.0.0");
    return "0.0.0";
  }
}

/**
 * Main function
 */
function main() {
  console.log("Embedding audio worklet into SDK...\n");

  // Check if source file exists
  if (!existsSync(WORKLET_PATH)) {
    console.error(`Error: Source file not found: ${WORKLET_PATH}`);
    console.error("Make sure public/audio-processor.worklet.js exists");
    process.exit(1);
  }

  // Read the worklet source
  const workletCode = readFileSync(WORKLET_PATH, "utf-8");
  console.log(`Read ${workletCode.length} bytes from ${WORKLET_PATH}`);

  // Minify (optional - keep readable for debugging)
  // For now, just clean up comments but keep it readable
  const cleanedCode = workletCode
    .replace(/\/\*[\s\S]*?\*\//g, "") // Remove block comments
    .replace(/\/\/.*$/gm, "") // Remove line comments
    .replace(/^\s*\n/gm, "") // Remove empty lines
    .trim();

  const version = getVersion();
  console.log(`SDK Version: ${version}`);

  // Generate the TypeScript file
  const output = `// ⚠️ AUTO-GENERATED - DO NOT EDIT MANUALLY
// Run \`pnpm build:worklet\` to regenerate from public/audio-processor.worklet.js
// This file embeds the AudioWorklet code for zero-config SDK usage

/**
 * Embedded AudioWorklet source code
 * This allows the SDK to work without users copying files to their public folder
 */
export const AUDIO_PROCESSOR_WORKLET_SOURCE = \`
${cleanedCode}
\`;

/**
 * SDK version - used for CDN fallback URL versioning
 */
export const WORKLET_VERSION = "${version}";
`;

  // Write the output
  writeFileSync(OUTPUT_PATH, output);
  console.log(`\nWritten ${output.length} bytes to ${OUTPUT_PATH}`);
  console.log("\n✅ Worklet source embedded successfully!");
}

// Run
main();
