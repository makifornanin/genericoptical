import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "./helpers";

/* The site key and revalidate secret must never reach the browser. */

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

test("client bundles contain no secrets or server-only configuration", () => {
  const chunks = files(join(process.cwd(), ".next", "static")).filter((f) => f.endsWith(".js"));
  expect(chunks.length).toBeGreaterThan(5);
  for (const f of chunks) {
    const text = readFileSync(f, "utf8");
    expect(text, f).not.toContain("test-key");
    expect(text, f).not.toContain("test-secret");
    expect(text, f).not.toMatch(/DASHBOARD_SITE_KEY|REVALIDATE_SECRET|localhost:3299/);
  }
});

test("rendered pages contain no secrets", async ({ page }) => {
  for (const path of ["/", "/products/arden-101", "/checkout", "/eye-exam"]) {
    await page.goto(path);
    const html = await page.content();
    expect(html).not.toContain("test-key");
    expect(html).not.toContain("test-secret");
    expect(html).not.toMatch(/Bearer\s/);
  }
});
