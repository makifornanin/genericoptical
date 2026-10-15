import { defineConfig, devices } from "@playwright/test";

/** Tests run against the local preview (node build.mjs first; `npm test` does both). */
export default defineConfig({
  testDir: "tests",
  fullyParallel: true,
  workers: 4,
  reporter: [["list"]],
  outputDir: "test-results",
  use: {
    baseURL: "http://localhost:4310/previews/",
    ...devices["Desktop Chrome"],
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node serve.mjs",
    url: "http://localhost:4310/previews/site/_pages.html",
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
