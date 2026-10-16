import { expect, test } from "@playwright/test";
import { VIEWPORTS } from "./helpers";

test.describe("header (desktop)", () => {
  test.use({ viewport: VIEWPORTS.desktop });

  test("highlights the current page; product pages highlight Eyewear", async ({ page }) => {
    await page.goto("/services");
    const nav = page.getByRole("navigation", { name: "Main" }).first();
    await expect(nav.getByRole("link", { name: "Services" })).toHaveAttribute("aria-current", "page");
    await expect(nav.getByRole("link", { name: "Eyewear" })).not.toHaveAttribute("aria-current", "page");

    await page.goto("/eyewear/arden-101");
    await expect(nav.getByRole("link", { name: "Eyewear" })).toHaveAttribute("aria-current", "page");
  });

  test("brand, booking button, skip link", async ({ page }) => {
    await page.goto("/about");
    await expect(page.getByRole("link", { name: "Lensmere Optical home" })).toHaveAttribute("href", "/");
    await expect(page.locator(".oc-header__cta")).toHaveAttribute("href", "/book");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to content" });
    await expect(skip).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#oc-main")).toBeFocused();
  });

  test("demo banner is shown for a demo business (promo banner off)", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".oc-promo")).toContainText("Demo website.");
    await expect(page.locator(".oc-promo")).toContainText("fictional business");
  });

  test("theme colours come from the API and text colour is picked for contrast", async ({ page }) => {
    await page.goto("/");
    const vars = await page.locator(".oc-root").evaluate((el) => ({
      brand: el.style.getPropertyValue("--oc-theme-brand"),
      brandInk: el.style.getPropertyValue("--oc-theme-brand-ink"),
      accent: el.style.getPropertyValue("--oc-theme-accent"),
      accentInk: el.style.getPropertyValue("--oc-theme-accent-ink"),
    }));
    expect(vars).toEqual({ brand: "#1F2B22", brandInk: "#ffffff", accent: "#B5E14A", accentInk: "#18191b" });
  });
});

test.describe("mobile menu", () => {
  test.use({ viewport: VIEWPORTS.mobile });

  test("opens and closes with the keyboard; Escape returns focus", async ({ page }) => {
    await page.goto("/faq", { waitUntil: "networkidle" });
    const toggle = page.getByRole("button", { name: "Open menu" });
    const menu = page.locator("#oc-mobile-nav");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(menu).toBeHidden();

    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "Close menu" })).toHaveAttribute("aria-expanded", "true");
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("link", { name: "FAQ" })).toHaveAttribute("aria-current", "page");

    // Tab into the menu, then Escape closes it and focus goes back to the button.
    await page.keyboard.press("Tab");
    await expect(menu.getByRole("link", { name: "Eyewear" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(page.getByRole("button", { name: "Open menu" })).toBeFocused();
    await expect(page.getByRole("button", { name: "Open menu" })).toHaveAttribute("aria-expanded", "false");
  });

  test("choosing a link closes the menu and navigates", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Open menu" }).click();
    await page.locator("#oc-mobile-nav").getByRole("link", { name: "Contact" }).click();
    await expect(page).toHaveURL(/\/contact$/);
    await expect(page.locator("#oc-mobile-nav")).toBeHidden();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Ask us anything.");
  });
});
