import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { PAGES, REVALIDATE_SECRET, SITE_KEY } from "./helpers";

const ROOT = resolve(__dirname, "..", "..");
const NEEDLES = [SITE_KEY, REVALIDATE_SECRET, "Bearer", "DASHBOARD_SITE_KEY", "REVALIDATE_SECRET", "DASHBOARD_API_URL"];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

test.describe("no secrets reach the browser", () => {
  test("client bundles (.next/static) contain no key, secret or auth header", () => {
    const all = files(join(ROOT, ".next", "static")).filter((f) => /\.(js|css|json|html|txt|map)$/.test(f));
    expect(all.length).toBeGreaterThan(5);
    const hits: string[] = [];
    for (const f of all) {
      const text = readFileSync(f, "utf8");
      for (const n of NEEDLES) if (text.includes(n)) hits.push(`${f.replace(ROOT, "")}: ${n}`);
    }
    expect(hits).toEqual([]);
  });

  test("rendered HTML of every page contains no key, secret, auth header or API origin env", async ({ request }) => {
    for (const spec of PAGES) {
      const html = await (await request.get(spec.path)).text();
      for (const n of NEEDLES) expect(html.includes(n), `${spec.path} contains ${n}`).toBe(false);
    }
  });

  test("project has no NEXT_PUBLIC_ variables", () => {
    const src = files(join(ROOT, "src")).map((f) => readFileSync(f, "utf8")).join("\n");
    expect(src).not.toMatch(/process\.env\.NEXT_PUBLIC_|env\[["']NEXT_PUBLIC_/);
    expect(readFileSync(join(ROOT, ".env.example"), "utf8")).not.toMatch(/^NEXT_PUBLIC_/m);
  });

  test("server-only modules are guarded", () => {
    for (const f of ["src/lib/api.ts", "src/lib/env.ts", "src/lib/inquiry-schema.ts", "src/lib/rate-limit.ts", "src/lib/seo.ts"]) {
      expect(readFileSync(join(ROOT, f), "utf8"), f).toMatch(/^import "server-only";/m);
    }
  });
});
