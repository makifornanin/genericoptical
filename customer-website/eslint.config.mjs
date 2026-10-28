import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // The superseded GoHighLevel-builder version, kept for reference only (not built or linted).
    "legacy/**",
    "test-results/**",
    "playwright-report/**",
    "tests/.tmp/**",
  ]),
]);
