import { expect, test } from "@playwright/test";
import { blockGhl, VIEWPORTS, watchConsole } from "./helpers.mjs";

test.beforeEach(async ({ page }) => blockGhl(page));

test.describe("navigation", () => {
  test("mobile menu opens, closes with Escape and returns focus; current page is marked", async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    await page.goto("site/services.html");
    const toggle = page.locator("[data-oc-menu-toggle]");
    const menu = page.locator("#oc-mobile-nav");
    await expect(menu).toBeHidden();
    await toggle.click();
    await expect(menu).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(menu.getByRole("link", { name: "Services" })).toHaveAttribute("aria-current", "page");
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(toggle).toBeFocused();
  });

  test("desktop nav marks the section; product pages belong to Eyewear", async ({ page }) => {
    await page.goto("site/product.html?p=kiyo-hex");
    await expect(page.locator(".oc-nav").getByRole("link", { name: "Eyewear" })).toHaveAttribute("aria-current", "page");
  });

  test("skip link moves focus to the page content", async ({ page }) => {
    await page.goto("site/index.html");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#oc-main")).toBeFocused();
  });
});

test.describe("home", () => {
  test("renders services, 8 featured products, branches with hours and a labelled sample-review notice", async ({ page }) => {
    await page.goto("site/index.html");
    await expect(page.locator(".oc-service-rows > li")).toHaveCount(3);
    await expect(page.locator("[data-oc-render='featured-products'] .oc-product-card")).toHaveCount(8);
    await expect(page.locator(".oc-branch-card")).toHaveCount(3);
    await expect(page.locator(".oc-branch-card").first().locator(".oc-status")).toHaveText(/Open|Closed/);
    await expect(page.getByText("Sample reviews.")).toBeVisible();
    await expect(page.locator(".oc-quote .oc-tag--warn")).toHaveCount(3);
    await expect(page.locator(".oc-stats dd").first()).toHaveText("3");
  });

  test("service and branch buttons deep-link into the booking page", async ({ page }) => {
    await page.goto("site/index.html");
    await expect(page.locator(".oc-service-rows a").first()).toHaveAttribute("href", "book.html?service=eye-exam");
    await expect(page.locator(".oc-branch-card a.oc-btn--brand").nth(2)).toHaveAttribute("href", "book.html?branch=pasig");
  });
});

test.describe("eyewear catalogue", () => {
  test("filters by category, searches, keeps filters in the URL and recovers from no results", async ({ page }) => {
    await page.goto("site/eyewear.html");
    const cards = page.locator("[data-oc-grid] .oc-product-card");
    await expect(cards).toHaveCount(37);
    await page.locator(".oc-pill", { hasText: "Sunglasses" }).click();
    await expect(cards).toHaveCount(7);
    await expect(page).toHaveURL(/category=sunglasses/);
    await expect(page.locator(".oc-pill", { hasText: "Sunglasses" })).toHaveAttribute("aria-pressed", "true");
    await page.locator(".oc-pill", { hasText: "Everything" }).click();
    await page.getByLabel("Search eyewear").fill("tortoise");
    await expect(page.locator("[data-oc-status]")).toContainText("for “tortoise”");
    const n = await cards.count();
    expect(n).toBeGreaterThan(5);
    expect(n).toBeLessThan(37);
    await page.getByLabel("Search eyewear").fill("zzzz-nothing");
    await expect(page.locator("[data-oc-empty]")).toBeVisible();
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(cards).toHaveCount(37);
  });

  test("a filtered URL opens filtered", async ({ page }) => {
    await page.goto("site/eyewear.html?category=accessories");
    await expect(page.locator("[data-oc-grid] .oc-product-card")).toHaveCount(5);
  });
});

test.describe("product detail", () => {
  test("shows the product, switches image with the variant and prefills the inquiry with the choice", async ({ page }) => {
    await page.goto("site/product.html?p=arden-101");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Arden 101");
    await expect(page).toHaveTitle(/^Arden 101 · Lensmere Optical$/);
    const img = page.locator("[data-oc-main-img]");
    await expect(img).toHaveAttribute("src", /frame-rectangle-black\.svg$/);
    await page.getByRole("button", { name: "52 · Tortoise" }).click();
    await expect(img).toHaveAttribute("src", /frame-rectangle-tortoise\.svg$/);
    await page.getByRole("button", { name: "Ask about this" }).click();
    await expect(page.locator("[data-oc-asking]")).toHaveText("Arden 101 (52 · Tortoise)");
    // No form configured in the preview: a labelled placeholder, never a fake form.
    const ph = page.locator("#oc-product-inquiry [data-oc-placeholder='form']");
    await expect(ph).toBeVisible();
    await expect(ph).toContainText("Product: Arden 101 (52 · Tortoise) (hidden field)");
    await expect(page.locator("#oc-product-inquiry form, #oc-product-inquiry input")).toHaveCount(0);
    await expect(page.locator(".oc-related .oc-product-card")).toHaveCount(4);
  });

  test("contact lenses link to the lens consultation; unknown products get a helpful message", async ({ page }) => {
    await page.goto("site/product.html?p=aquasoft-daily-30-pack");
    await expect(page.getByRole("link", { name: "Book a lens consultation" })).toHaveAttribute("href", "book.html?service=contact-lens");
    await page.goto("site/product.html?p=does-not-exist");
    await expect(page.getByText("We couldn't find that product")).toBeVisible();
  });
});

test.describe("booking", () => {
  test("deep link preselects branch and service; changing the branch updates hours, phone and calendar", async ({ page }) => {
    await page.goto("site/book.html?branch=pasig&service=contact-lens");
    await expect(page.locator(".oc-choice[data-branch='pasig']")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".oc-choice[data-service='contact-lens']")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("[data-oc-placeholder='calendar']")).toContainText("Pasig · Contact lens consultation");
    await expect(page.locator("[data-oc-phone]")).toHaveText("+63 2 8000 0103");
    await page.locator(".oc-choice[data-branch='makati']").click();
    await expect(page.locator("[data-oc-phone]")).toHaveText("+63 2 8000 0101");
    await expect(page).toHaveURL(/branch=makati/);
    await expect(page.locator("[data-oc-placeholder='calendar']")).toContainText("No booking can be made from this placeholder");
  });
});

test.describe("faq and legal", () => {
  test("first question is open and FAQPage structured data matches the questions", async ({ page }) => {
    await page.goto("site/faq.html");
    await expect(page.locator(".oc-faq__list details").first()).toHaveAttribute("open", "");
    const json = JSON.parse(await page.locator("#oc-faq-jsonld").textContent());
    expect(json["@type"]).toBe("FAQPage");
    expect(json.mainEntity).toHaveLength(await page.locator(".oc-faq__list details").count());
  });

  test("legal pages carry a visible draft notice", async ({ page }) => {
    for (const p of ["privacy", "terms"]) {
      await page.goto(`site/${p}.html`);
      await expect(page.getByText("Draft — needs legal review.")).toBeVisible();
    }
  });
});

test.describe("native GHL embeds (composition only — not a live GHL test)", () => {
  const withIds = async (page) => {
    await page.addInitScript(() => {
      let cfg;
      Object.defineProperty(window, "OC_CONFIG", {
        configurable: true,
        get: () => cfg,
        set: (v) => {
          v.forms.contact = "FormAbc123";
          v.branches[0].calendar = "https://api.leadconnectorhq.com/widget/booking/CalMakati1";
          v.booking.defaultCalendar = "CalDefault9";
          cfg = v;
        },
      });
    });
  };

  test("contact form uses GHL's official form widget with the inquiry kind and source page", async ({ page }) => {
    await withIds(page);
    await page.goto("site/contact.html");
    const frame = page.locator(".oc-embed iframe");
    await expect(frame).toHaveAttribute("src", "https://api.leadconnectorhq.com/widget/form/FormAbc123?inquiry_kind=contact&source_page=%2Fcontact");
    await expect(frame).toHaveAttribute("data-form-id", "FormAbc123");
    await expect(page.locator('script[src="https://link.msgsndr.com/js/form_embed.js"]')).toHaveCount(1);
  });

  test("product inquiry reuses the contact form with the product as a hidden field", async ({ page }) => {
    await withIds(page);
    await page.goto("site/product.html?p=kiyo-hex");
    await page.getByRole("button", { name: "50 · Black" }).click();
    await page.getByRole("button", { name: "Ask about this" }).click();
    const src = await page.locator("#oc-product-inquiry iframe").getAttribute("src");
    const u = new URL(src);
    expect(u.pathname).toBe("/widget/form/FormAbc123");
    expect(u.searchParams.get("product_name")).toBe("Kiyo Hex (50 · Black)");
    expect(u.searchParams.get("inquiry_kind")).toBe("product_inquiry");
  });

  test("booking picks the branch calendar, falling back to the default calendar", async ({ page }) => {
    await withIds(page);
    await page.goto("site/book.html?branch=makati");
    await expect(page.locator("[data-oc-calendar] iframe")).toHaveAttribute("src", "https://api.leadconnectorhq.com/widget/booking/CalMakati1");
    await page.locator(".oc-choice[data-branch='pasig']").click();
    await expect(page.locator("[data-oc-calendar] iframe")).toHaveAttribute("src", "https://api.leadconnectorhq.com/widget/booking/CalDefault9");
  });

  test("an unreplaced GHL merge tag falls back to the default text and warns (never shown)", async ({ page }) => {
    const problems = watchConsole(page);
    const warnings = [];
    page.on("console", (m) => m.type() === "warning" && warnings.push(m.text()));
    await page.addInitScript(() => {
      let cfg;
      Object.defineProperty(window, "OC_CONFIG", {
        configurable: true,
        get: () => cfg,
        set: (v) => {
          v.business.phone = "{{custom_values.business_phone}}";
          cfg = v;
        },
      });
    });
    await page.goto("site/contact.html");
    await expect(page.locator(".oc-contact__direct a").first()).toHaveText("+63 2 8000 0100");
    expect(warnings.join(" ")).toContain("business.phone");
    expect(problems).toEqual([]);
  });
});
