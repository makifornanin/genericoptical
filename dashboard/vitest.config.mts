import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const alias = { "@": fileURLToPath(new URL("./src", import.meta.url)) };

export default defineConfig({
  plugins: [react()],
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: { name: "unit", include: ["tests/unit/**/*.test.ts"], environment: "node" },
      },
      {
        resolve: { alias },
        test: {
          name: "db",
          include: ["tests/db/**/*.test.ts"],
          environment: "node",
          globalSetup: ["tests/db/global-setup.ts"],
          setupFiles: ["tests/db/setup-file.ts"],
          testTimeout: 60_000,
          hookTimeout: 120_000,
          fileParallelism: true,
        },
      },
      {
        resolve: { alias },
        test: {
          name: "components",
          include: ["tests/components/**/*.test.tsx"],
          environment: "jsdom",
          setupFiles: ["tests/components/setup.ts"],
        },
      },
    ],
  },
});
