// Renders product packshots and editorial scenes on the local GPU through headless Chromium.
//   node render.mjs                    every job in jobs.mjs
//   node render.mjs --only arden-101   jobs whose id contains the text
//   node render.mjs --out <dir>        write somewhere else (default: ../../public/media)
//   node render.mjs --samples 120      override sample counts (quick previews)
import { chromium } from "@playwright/test";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "./server.mjs";
import { jobs } from "./jobs.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const outDir = resolve(arg("--out") ?? join(here, "../../public/media"));
const only = arg("--only");
const samples = arg("--samples") ? Number(arg("--samples")) : null;
const angles = arg("--angles")?.split(",");
const size = arg("--size")?.split("x").map(Number);
const port = 4411;

const server = await startServer(port);
const browser = await chromium.launch({ args: ["--enable-gpu", "--use-angle=d3d11", "--ignore-gpu-blocklist", "--disable-gpu-watchdog", "--disable-renderer-backgrounding"] });
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
page.on("console", (m) => {
  const text = m.text();
  if (/deprecated|has been renamed/.test(text)) return;
  if (m.type() === "error" || m.type() === "warning" || text.startsWith("trace ")) console.log(`[page ${m.type()}]`, text.slice(0, 300));
});
page.on("pageerror", (e) => console.log("[page error]", e.message));
await page.goto(`http://127.0.0.1:${port}/page/index.html`);
await page.waitForFunction(() => window.ready === true, null, { timeout: 120_000 });
console.log("GPU:", await page.evaluate(() => window.glInfo()));

const skipExisting = args.includes("--skip-existing");
const done0 = (job) => {
  const views = job.kind === "scene" ? ["main"] : (angles ?? job.angles ?? ["front", "angle", "side"]);
  const widths = size ? [size[0]] : (job.widths ?? (job.kind === "scene" ? [2400, 1200] : [1600, 800]));
  return views.every((v) => widths.every((w) => existsSync(join(outDir, job.path(v, w)))));
};
const list = jobs()
  .filter((j) => !only || only.split(",").some((o) => j.id.includes(o)))
  .filter((j) => !skipExisting || !done0(j));
console.log(`${list.length} job(s) → ${outDir}`);
let done = 0;
for (const job of list) {
  const plain = Object.fromEntries(Object.entries(job).filter(([k]) => k !== "path")); // functions can't cross into the page
  const payload = samples ? { ...plain, samples, plateSamples: Math.max(24, Math.round(samples / 3)) } : { ...plain };
  if (angles) payload.angles = angles;
  if (size) Object.assign(payload, { width: size[0], height: size[1], widths: [size[0]] });
  const fn = job.kind === "scene" ? "renderScene" : "renderPackshot";
  let result;
  for (let attempt = 1; ; attempt++) {
    try {
      result = await page.evaluate(([f, j]) => window[f](j), [fn, payload]);
      break;
    } catch (error) {
      // A lost GPU context (or a blank frame) poisons the page: reload it and try the job again.
      console.log(`  ${job.id} attempt ${attempt} failed: ${String(error.message).split("\n")[0].slice(0, 160)}`);
      if (attempt >= 3) throw error;
      await page.reload();
      await page.waitForFunction(() => window.ready === true, null, { timeout: 120_000 });
    }
  }
  for (const [view, sizes] of Object.entries(result.images)) {
    for (const [w, dataUrl] of Object.entries(sizes)) {
      const file = join(outDir, job.path(view, w));
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, Buffer.from(dataUrl.split(",")[1], "base64"));
    }
  }
  done++;
  console.log(`[${done}/${list.length}] ${job.id} ${(result.ms / 1000).toFixed(1)}s`);
}
await browser.close();
server.close();
