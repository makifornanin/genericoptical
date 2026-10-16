/*
 * Static checks on the GHL code itself (no browser): scoping, structure, safety, freshness.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { expect, test } from "@playwright/test";
import { PAGES, ROOT } from "./helpers.mjs";

const read = (p) => readFileSync(join(ROOT, p), "utf8");
const walk = (dir) =>
  readdirSync(join(ROOT, dir)).flatMap((f) => {
    const rel = join(dir, f);
    return statSync(join(ROOT, rel)).isDirectory() ? walk(rel) : [rel];
  });
const cssFiles = ["styles/oc-base.css", ...walk("pages").filter((f) => f.endsWith(".css"))];
const blockFiles = ["components/header.html", "components/footer.html", ...walk("pages").filter((f) => f.endsWith(".html"))];
const jsFiles = ["scripts/oc-config.js", "scripts/oc-catalogue.js", "scripts/oc-site.js", ...walk("pages").filter((f) => f.endsWith(".js"))];

/** Top-level selectors of a stylesheet (inside @media too), comments removed. */
function selectors(css) {
  const out = [];
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const re = /([^{}]+)\{/g;
  let m;
  while ((m = re.exec(clean))) {
    const sel = m[1].trim();
    if (!sel || sel.startsWith("@")) continue;
    out.push(...sel.split(",").map((s) => s.trim()));
  }
  return out;
}

test("every CSS selector is scoped under .oc (cannot restyle GHL builder, forms, calendars or store)", () => {
  for (const f of cssFiles) {
    const bad = selectors(read(f)).filter((s) => !/^\.oc(\b|[.\s:[>])/.test(s));
    expect(bad, f).toEqual([]);
  }
});

test("custom properties are prefixed --oc- and never declared on :root, html or body", () => {
  for (const f of cssFiles) {
    const css = read(f);
    expect(css, f).not.toMatch(/(^|[\s,}])(:root|html|body)\s*[{,]/);
    const props = [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/[{;]\s*(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]);
    expect(props.filter((p) => !p.startsWith("--oc-")), f).toEqual([]);
  }
});

test("blocks are GHL Custom Code snippets: one .oc root, no document tags, no scripts, no inline handlers", () => {
  for (const f of blockFiles) {
    const html = read(f).replace(/<!--[\s\S]*?-->/g, "").trim();
    expect(html, f).not.toMatch(/<\/?(html|head|body)\b|<link\b|<script\b|<style\b/i);
    expect(html, f).not.toMatch(/\son[a-z]+\s*=/i);
    const root = html.match(/^<([a-z]+)\s+[^>]*class="oc[\s"]/);
    expect(root, `${f} must start with an element whose class list begins with "oc"`).not.toBeNull();
    // exactly one top-level element
    const tag = root[1];
    expect(html.endsWith(`</${tag}>`), `${f} must be a single root <${tag}>`).toBe(true);
  }
});

test("browser code holds no secrets and calls no privileged APIs", () => {
  for (const f of jsFiles) {
    const js = read(f);
    expect(js, f).not.toMatch(/pit-[a-z0-9]|Bearer\s|access_token|refresh_token|client_secret|api[_-]?key\s*[:=]/i);
    expect(js, f).not.toMatch(/services\.leadconnectorhq\.com|\/api\/integrations|fetch\(|XMLHttpRequest|localStorage|sessionStorage|document\.cookie|\beval\(|new Function/);
  }
});

test("page manifest matches the page folders, and every block is in one", () => {
  const folders = readdirSync(join(ROOT, "pages")).filter((f) => statSync(join(ROOT, "pages", f)).isDirectory());
  expect(folders.sort()).toEqual(PAGES.map((p) => p.id).sort());
  for (const p of PAGES) {
    expect(readdirSync(join(ROOT, "pages", p.id, "blocks")).length, p.id).toBeGreaterThan(0);
    expect(p.path, `${p.id} path`).not.toMatch(/^\/(product|collections|post|category|author|tag|b|c)(\/|$)/); // GHL reserved paths
  }
});

test("ghl-ready/ is up to date with the sources", () => {
  const tmp = mkdtempSync(join(tmpdir(), "ghl-ready-"));
  execFileSync(process.execPath, [join(ROOT, "tools", "build-ghl.mjs"), `--out=${tmp}`]);
  const want = Object.fromEntries(walkAbs(tmp).map((f) => [relative(tmp, f).split("\\").join("/"), readFileSync(f, "utf8")]));
  const have = Object.fromEntries(walkAbs(join(ROOT, "ghl-ready")).map((f) => [relative(join(ROOT, "ghl-ready"), f).split("\\").join("/"), readFileSync(f, "utf8")]));
  expect(Object.keys(have).sort()).toEqual(Object.keys(want).sort());
  for (const k of Object.keys(want)) expect(have[k], `ghl-ready/${k} is stale — run node tools/build-ghl.mjs`).toBe(want[k]);
});

function walkAbs(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walkAbs(p) : [p];
  });
}

test("pasted snippets keep <script> tags at the top level (GHL does not run scripts nested in a <div>)", () => {
  for (const f of walkAbs(join(ROOT, "ghl-ready"))) {
    if (!f.endsWith(".html")) continue;
    const html = readFileSync(f, "utf8").replace(/<!--[\s\S]*?-->/g, "").replace(/<script\b[\s\S]*?<\/script>/g, "<script></script>");
    // walk tags and make sure no <script> opens while an element is open
    let depth = 0;
    for (const m of html.matchAll(/<(\/?)([a-z][a-z0-9-]*)\b[^>]*?(\/?)>/gi)) {
      const [, close, tag, self] = m;
      const name = tag.toLowerCase();
      if (["br", "img", "input", "meta", "link", "path", "circle", "rect", "source", "hr"].includes(name) || self) continue;
      if (name === "script" && !close) expect(depth, `${relative(ROOT, f)}: <script> nested inside an element`).toBe(0);
      if (name === "script" || name === "style") continue;
      depth += close ? -1 : 1;
    }
  }
});
