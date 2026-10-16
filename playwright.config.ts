import { defineConfig, devices } from "@playwright/test";

/*
 * End-to-end tests against the production build (`npm run test:build` first — `npm test` does
 * both) served by `next start` on port 3200, with the fixture dashboard API on port 3299.
 * The "outage" project switches the fixture API off, so it runs alone after everything else.
 */
const TEST_ENV = {
  DASHBOARD_API_URL: "http://localhost:3299",
  DASHBOARD_SITE_KEY: "test-key",
  REVALIDATE_SECRET: "test-secret",
  SITE_URL: "http://localhost:3200",
};

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  reporter: [["list"]],
  outputDir: "test-results",
  timeout: 60_000,
  use: {
    baseURL: "http://localhost:3200",
    ...devices["Desktop Chrome"],
    trace: "retain-on-failure",
  },
  projects: [
    // Pure helpers (no browser): src/lib/dashboard-url.ts, format.ts, theme.ts, catalog.ts.
    { name: "unit", testDir: "tests/unit" },
    { name: "site", testIgnore: /outage\.spec\.ts/ },
    { name: "outage", testMatch: /outage\.spec\.ts/, dependencies: ["site"], fullyParallel: false },
  ],
  webServer: [
    {
      command: "node tests/fixtures/api-server.mjs",
      url: "http://localhost:3299/__control",
      reuseExistingServer: !process.env.CI,
      timeout: 15_000,
    },
    {
      command: "node node_modules/next/dist/bin/next start -p 3200",
      url: "http://localhost:3200/api/health",
      env: TEST_ENV,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
