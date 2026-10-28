import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against a running app backed by the seeded demo database:
 *   npm run db:start   (separate terminal, or point DATABASE_URL at your own PostgreSQL)
 *   npm run db:reset-demo
 *   npm run test:e2e   (starts `npm run dev` automatically if nothing is listening)
 * Tests create their own uniquely named records, so they can be re-run without reseeding.
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: [["list"]],
  outputDir: "test-results/e2e",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    navigationTimeout: 90_000,
    actionTimeout: 20_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: "npm run dev",
    url: `${baseURL}/api/health`,
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
