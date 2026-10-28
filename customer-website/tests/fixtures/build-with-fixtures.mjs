#!/usr/bin/env node
/*
 * Production build for the end-to-end tests: starts the fixture dashboard API (port 3299), runs
 * `next build` against it with the test environment, then stops the fixture server. Pages that
 * are prerendered at build time therefore contain fixture data, exactly as a real deployment
 * built against the dashboard would. (`npm run build` alone also works without any API — pages
 * then show the "setup needed" state until the API is reachable.)
 */
import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const TEST_ENV = {
  DASHBOARD_API_URL: "http://localhost:3299",
  DASHBOARD_SITE_KEY: "test-key",
  REVALIDATE_SECRET: "test-secret",
  SITE_URL: "http://localhost:3210",
};

const fixture = spawn(process.execPath, [join(ROOT, "tests", "fixtures", "api-server.mjs")], { stdio: "inherit", env: { ...process.env, FIXTURE_LOG: "build-inquiries.json" } });

async function waitFor(url, ms = 15000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      await fetch(url);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  throw new Error(`fixture server did not start: ${url}`);
}

let code = 1;
try {
  await waitFor("http://localhost:3299/__control");
  const nextBin = join(ROOT, "node_modules", "next", "dist", "bin", "next");
  code = await new Promise((done) => {
    const build = spawn(process.execPath, [nextBin, "build"], { cwd: ROOT, stdio: "inherit", env: { ...process.env, ...TEST_ENV, NODE_ENV: "production" } });
    build.on("exit", (c) => done(c ?? 1));
  });
} finally {
  fixture.kill();
}
process.exit(code);
