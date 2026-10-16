import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { ROOT } from "./helpers.mjs";

test("catalogue-from-csv: follows the dashboard export and keeps website-only fields", () => {
  const out = execFileSync(process.execPath, [join(ROOT, "tools", "catalogue-from-csv.mjs"), join(ROOT, "previews", "tests", "fixtures", "dashboard-products.csv"), "--previous=scripts/oc-catalogue.js"], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const sandbox = {};
  new Function("window", out)(sandbox);
  const products = sandbox.OC_CATALOGUE.products;
  const byId = Object.fromEntries(products.map((p) => [p.id, p]));

  // inactive, services and made-to-order rows are skipped; cleaning maps to accessories
  expect(Object.keys(byId).sort()).toEqual(["arden-101", "lens-cloth", "new-frame-x"]);
  expect(byId["lens-cloth"].category).toBe("accessories");
  expect(byId["lens-cloth"].variants).toEqual([]);

  // prices from the dashboard: lowest is the "from" price, other variant prices kept
  expect(byId["arden-101"].price).toBe(2950);
  expect(byId["arden-101"].variants).toEqual([
    { label: "52 · Black", image: "products/frame-rectangle-black.svg" },
    { label: "54 · Tortoise", price: 3150, image: "products/frame-rectangle-tortoise.svg" },
  ]);
  // website-only fields kept from the previous catalogue
  expect(byId["arden-101"].featured).toBe(1);
  expect(byId["arden-101"].images.length).toBeGreaterThan(1);
  // new products get a placeholder image and the CSV's quoted description
  expect(byId["new-frame-x"].image).toBe("products/frame-square-black.svg");
  expect(byId["new-frame-x"].description).toBe("Brand new frame, with a comma");
  // never any stock
  expect(out).not.toMatch(/availableQuantity|stock"\s*:/);
});
