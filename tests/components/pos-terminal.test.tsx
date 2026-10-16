import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const pos = vi.hoisted(() => ({
  checkoutAction: vi.fn(),
  posCustomerSearchAction: vi.fn(),
  quoteCartAction: vi.fn(),
  posCustomerContextAction: vi.fn(),
  holdCartAction: vi.fn(),
  listHeldCartsAction: vi.fn(),
  resumeHeldCartAction: vi.fn(),
  cancelHeldCartAction: vi.fn(),
  posInsightsAction: vi.fn(),
  posLookupAction: vi.fn(),
}));
const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("@/app/app/pos/actions", () => pos);
vi.mock("@/app/app/customers/actions", () => ({ saveCustomerAction: vi.fn(), archiveCustomerAction: vi.fn(), savePrescriptionAction: vi.fn(), customerMatchesAction: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: nav.push, refresh: vi.fn() }), usePathname: () => "/app/pos" }));

import { PosTerminal, type PosItem } from "@/app/app/pos/terminal";
import { priceSale } from "@/lib/pricing";

const item = (o: Partial<PosItem> & Pick<PosItem, "variantId" | "productName" | "priceCents">): PosItem => ({
  productId: `p-${o.variantId}`,
  brand: null,
  label: "Default",
  sku: o.variantId.toUpperCase(),
  barcode: null,
  productType: "stock",
  taxExempt: false,
  imageUrl: null,
  categoryId: "c1",
  available: 5,
  reorderPoint: 0,
  ...o,
});
const items = [
  item({ variantId: "v-cloth", productName: "Microfiber Cloth", priceCents: 12000, available: 2, reorderPoint: 2 }),
  item({ variantId: "v-case", productName: "Hard Shell Case", priceCents: 35000 }),
  item({ variantId: "v-exam", productName: "Eye Examination", priceCents: 50000, productType: "service", taxExempt: true }),
  item({ variantId: "v-ard-52", productId: "p-arden", productName: "Arden 101", label: "52 · Black", sku: "ARD-52-BK", priceCents: 295000 }),
  item({ variantId: "v-ard-54", productId: "p-arden", productName: "Arden 101", label: "54 · Tortoise", sku: "ARD-54-TO", priceCents: 295000, available: 0 }),
];
/** Products the server knows about but that aren't loaded on screen (for the SKU lookup test). */
const offScreen: PosItem[] = [];

/** The server quote, computed like the real one from catalogue prices (`override` simulates changes). */
function serverQuote(override: { totalCents?: number; problems?: string[] } = {}) {
  return async (input: { items: { variantId: string; quantity: number; lineDiscountCents?: number }[]; orderDiscount?: { type: "percent"; valueBps: number } | { type: "amount"; valueCents: number } | null }) => {
    const priced = priceSale(
      input.items.map((l, i) => {
        const it = [...items, ...offScreen].find((x) => x.variantId === l.variantId)!;
        return { key: String(i), quantity: l.quantity, unitPriceCents: it.priceCents, lineDiscountCents: l.lineDiscountCents ?? 0, taxExempt: it.taxExempt };
      }),
      { rateBps: 1200, pricesIncludeTax: true },
      input.orderDiscount ?? null,
    );
    return { ok: true, data: { ...priced, lines: [], available: {}, checkedAt: new Date().toISOString(), problems: override.problems ?? [], totalCents: override.totalCents ?? priced.totalCents } };
  };
}

beforeEach(() => {
  for (const fn of Object.values(pos)) fn.mockReset();
  nav.push.mockReset();
  pos.quoteCartAction.mockImplementation(serverQuote());
  pos.listHeldCartsAction.mockResolvedValue({ ok: true, data: [] });
  pos.posCustomerContextAction.mockResolvedValue({ ok: true, data: { visits: 0, lastPurchaseAt: null, outstanding: { count: 0, totalCents: 0 }, recentItems: [] } });
  window.localStorage.clear();
});

function renderPos() {
  return render(
    <PosTerminal
      items={items}
      popularIds={["v-case"]}
      categories={[{ id: "c1", name: "Care" }]}
      branchId="b1"
      branches={[{ id: "b1", name: "Makati" }]}
      business={{ name: "Test Optical", demo: false }}
      cashier={{ name: "Carlo Reyes", role: "Sales staff" }}
      tax={{ rateBps: 1200, pricesIncludeTax: true, name: "VAT" }}
      money={{ currency: "PHP", locale: "en-PH" }}
      maxDiscountBps={2000}
      canDiscountUnlimited={false}
      canCreateCustomer
      initialCustomer={null}
    />,
  );
}

const sale = () => within(screen.getByRole("complementary", { name: "Current sale" }));
const recentGroup = () => screen.getByRole("group", { name: "Stock filter and recent items" });
/** A product tile in the grid (not a "Recent" chip with the same name). */
const tile = (name: RegExp) => {
  const matches = within(screen.getByRole("region", { name: "Products" }))
    .getAllByRole("button", { name })
    .filter((b) => !recentGroup().contains(b));
  expect(matches).toHaveLength(1);
  return matches[0];
};
const charge = () => sale().getByRole("button", { name: /^Charge/ });
const complete = () => sale().getByRole("button", { name: /^Complete/ });

describe("POS terminal", () => {
  it("shows the compact POS header with branch, cashier and Exit POS", async () => {
    const user = userEvent.setup();
    renderPos();
    expect(screen.getByText("Point of sale")).toBeInTheDocument();
    expect(screen.getByText("Makati")).toBeInTheDocument();
    expect(screen.getByText("Carlo Reyes")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Exit POS/ }));
    expect(nav.push).toHaveBeenCalledWith("/app");
  });

  it("totals the cart with tax included and never sells more than is in stock", async () => {
    const user = userEvent.setup();
    renderPos();
    await user.click(tile(/Microfiber Cloth/));
    await user.click(tile(/Microfiber Cloth/));
    expect(tile(/Microfiber Cloth/)).toBeDisabled(); // only 2 available
    await user.click(tile(/Hard Shell Case/));
    // 2 × 120 + 350 = 590, VAT 12% included = 63.21
    expect(charge()).toHaveTextContent("Charge ₱590.00");
    expect(charge()).toBeEnabled();
    expect(sale().getByText("₱63.21")).toBeInTheDocument();
  });

  it("groups variants under one tile and adds the chosen option (out-of-stock options disabled)", async () => {
    const user = userEvent.setup();
    renderPos();
    await user.click(tile(/Arden 101/));
    const dialog = screen.getByRole("dialog", { name: "Arden 101" });
    expect(within(dialog).getByRole("button", { name: /54 · Tortoise/ })).toBeDisabled();
    await user.click(within(dialog).getByRole("button", { name: /52 · Black/ }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(sale().getByText(/52 · Black/)).toBeInTheDocument();
    expect(charge()).toHaveTextContent("₱2,950.00");
  });

  it("blocks order discounts above the staff limit", async () => {
    const user = userEvent.setup();
    renderPos();
    await user.click(tile(/Hard Shell Case/));
    await user.selectOptions(screen.getByLabelText("Order discount"), "percent");
    await user.type(screen.getByLabelText("Order discount value"), "25");
    expect(screen.getByText("Discounts above 20% need a manager.")).toBeInTheDocument();
    expect(charge()).toBeDisabled();
    await user.clear(screen.getByLabelText("Order discount value"));
    await user.type(screen.getByLabelText("Order discount value"), "10");
    expect(charge()).toHaveTextContent("₱315.00");
    expect(charge()).toBeEnabled();
  });

  it("applies a line discount and sends it to the server", async () => {
    const user = userEvent.setup();
    renderPos();
    await user.click(tile(/Hard Shell Case/));
    await user.click(sale().getByRole("button", { name: "More for Hard Shell Case" }));
    await user.click(await screen.findByRole("menuitem", { name: /Discount this line/ }));
    const dialog = screen.getByRole("dialog", { name: /Discount: Hard Shell Case/ });
    await user.type(within(dialog).getByLabelText("Discount value"), "10");
    await user.click(within(dialog).getByRole("button", { name: "Apply" }));
    expect(charge()).toHaveTextContent("₱315.00");
    await waitFor(() => expect(pos.quoteCartAction).toHaveBeenLastCalledWith(expect.objectContaining({ items: [expect.objectContaining({ variantId: "v-case", lineDiscountCents: 3500 })] })));
  });

  it("requires a customer before leaving a balance due", async () => {
    const user = userEvent.setup();
    renderPos();
    await user.click(tile(/Hard Shell Case/));
    await user.click(charge());
    const amount = sale().getByLabelText("Cash amount");
    await user.clear(amount);
    await user.type(amount, "100");
    expect(sale().getByText("Link a customer to leave a balance due.")).toBeInTheDocument();
    expect(complete()).toBeDisabled();
  });

  it("splits a payment across cash and GCash and completes with both", async () => {
    const user = userEvent.setup();
    pos.checkoutAction.mockResolvedValue({ ok: true, data: { saleId: "s3", number: "S-00003", totalCents: 35000, balanceDueCents: 0 } });
    renderPos();
    await user.click(tile(/Hard Shell Case/));
    await user.click(charge());
    const amount = sale().getByLabelText("Cash amount");
    await user.clear(amount);
    await user.type(amount, "200");
    await user.click(sale().getByRole("button", { name: /GCash/ }));
    expect(sale().getByLabelText("GCash amount")).toHaveValue("150.00");
    await user.type(sale().getByLabelText("GCash reference"), "GC-123");
    await user.click(complete());
    await waitFor(() => expect(pos.checkoutAction).toHaveBeenCalledTimes(1));
    expect(pos.checkoutAction.mock.calls[0][0].payments).toEqual([
      { method: "cash", amountCents: 20000, tenderedCents: null, reference: null },
      { method: "gcash", amountCents: 15000, tenderedCents: null, reference: "GC-123" },
    ]);
    const done = await screen.findByRole("dialog", { name: "Sale S-00003 completed" });
    expect(within(done).getByText("1 × Hard Shell Case")).toBeInTheDocument();
    expect(within(done).getByText(/GCash · GC-123/)).toBeInTheDocument();
    expect(within(done).getByRole("link", { name: /Print receipt/ })).toHaveAttribute("href", "/print/receipt/s3");
  });

  it("shows change for cash tendered", async () => {
    const user = userEvent.setup();
    renderPos();
    await user.click(tile(/Hard Shell Case/));
    await user.click(charge());
    await user.click(sale().getByRole("button", { name: "₱500.00" }));
    expect(sale().getByText("Change due")).toBeInTheDocument();
    expect(sale().getByText("₱150.00")).toBeInTheDocument();
  });

  it("sends one idempotency key per cart, reused if the cashier retries, and keeps the cart on failure", async () => {
    const user = userEvent.setup();
    pos.checkoutAction
      .mockResolvedValueOnce({ ok: false, error: "Couldn't reach the server." })
      .mockResolvedValueOnce({ ok: true, data: { saleId: "s1", number: "S-00001", totalCents: 50000, balanceDueCents: 0 } });
    renderPos();
    await user.click(tile(/Eye Examination/));
    await user.click(charge());
    await user.click(complete());
    expect(await sale().findByText(/Couldn't reach the server\. The cart is unchanged/)).toBeInTheDocument();
    await waitFor(() => expect(complete()).toBeEnabled());
    await user.click(complete());
    await waitFor(() => expect(pos.checkoutAction).toHaveBeenCalledTimes(2));
    const [first] = pos.checkoutAction.mock.calls[0];
    const [second] = pos.checkoutAction.mock.calls[1];
    expect(first.idempotencyKey).toBeTruthy();
    expect(second.idempotencyKey).toBe(first.idempotencyKey);
    expect(first).toMatchObject({ branchId: "b1", customerId: null, items: [{ variantId: "v-exam", quantity: 1 }], payments: [{ method: "cash", amountCents: 50000 }] });
    expect(await screen.findByText("Sale S-00001 completed")).toBeInTheDocument();
  });

  it("uses a new idempotency key when the cart changes after a failed attempt", async () => {
    const user = userEvent.setup();
    pos.checkoutAction
      .mockResolvedValueOnce({ ok: false, error: "Couldn't reach the server." })
      .mockResolvedValueOnce({ ok: true, data: { saleId: "s2", number: "S-00002", totalCents: 85000, balanceDueCents: 0 } });
    renderPos();
    await user.click(tile(/Eye Examination/));
    await user.click(charge());
    await user.click(complete());
    await waitFor(() => expect(complete()).toBeEnabled());
    await user.click(tile(/Hard Shell Case/)); // back to the cart with a different sale
    await user.click(charge());
    await user.click(complete());
    await waitFor(() => expect(pos.checkoutAction).toHaveBeenCalledTimes(2));
    const [first] = pos.checkoutAction.mock.calls[0];
    const [second] = pos.checkoutAction.mock.calls[1];
    expect(second.items).toHaveLength(2);
    expect(second.idempotencyKey).not.toBe(first.idempotencyKey);
  });

  it("confirms totals with the server and blocks the sale when server prices or stock differ", async () => {
    const user = userEvent.setup();
    renderPos();
    await user.click(tile(/Hard Shell Case/));
    expect(await screen.findByText("Prices and stock checked by the server")).toBeInTheDocument();
    pos.quoteCartAction.mockImplementation(serverQuote({ totalCents: 40000 }));
    await user.click(tile(/Microfiber Cloth/));
    expect(await screen.findByText(/Prices changed since this screen loaded/)).toBeInTheDocument();
    expect(charge()).toBeDisabled();
    pos.quoteCartAction.mockImplementation(serverQuote({ problems: ["Microfiber Cloth (V-CLOTH): only 0 left at this branch (1 in the cart)."] }));
    await user.click(tile(/Eye Examination/));
    expect(await screen.findByText(/only 0 left at this branch/)).toBeInTheDocument();
    expect(charge()).toBeDisabled();
  });

  it("remembers recent products, flags low stock and offers a Popular tab", async () => {
    const user = userEvent.setup();
    renderPos();
    expect(tile(/Microfiber Cloth/)).toHaveTextContent("Low · 2 left");
    await user.click(tile(/Hard Shell Case/));
    expect(within(recentGroup()).getByRole("button", { name: /Hard Shell Case/ })).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem("pos:recent:b1") ?? "[]")).toEqual(["v-case"]);
    await user.click(screen.getByRole("tab", { name: /Popular here/ }));
    const grid = within(screen.getByRole("region", { name: "Products" }));
    expect(grid.getAllByRole("button", { name: /Hard Shell Case/ }).length).toBeGreaterThan(0);
    expect(grid.queryByRole("button", { name: /Eye Examination/ })).not.toBeInTheDocument();
  });

  it("holds the cart (with line discounts) and clears the counter", async () => {
    const user = userEvent.setup();
    pos.holdCartAction.mockResolvedValue({ ok: true, data: { id: "h1", label: "Ana" }, message: "Cart put on hold" });
    renderPos();
    await user.click(tile(/Hard Shell Case/));
    await user.click(sale().getByRole("button", { name: /Hold/ }));
    await user.type(screen.getByLabelText("Name"), "Ana");
    await user.click(screen.getByRole("button", { name: /Hold cart/ }));
    await waitFor(() => expect(pos.holdCartAction).toHaveBeenCalledTimes(1));
    expect(pos.holdCartAction.mock.calls[0][0]).toMatchObject({ branchId: "b1", label: "Ana", lines: [{ variantId: "v-case", qty: 1, discount: null }], estimatedTotalCents: 35000 });
    await waitFor(() => expect(sale().getByText("Tap a product or scan a barcode to start.")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Held carts (1)" })).toBeInTheDocument();
  });

  it("looks up an exact SKU on the server when it isn't on screen, and pays with Ctrl+Enter", async () => {
    const user = userEvent.setup();
    const remote = item({ variantId: "v-remote", productName: "Remote Frame", priceCents: 100000, sku: "RF-1" });
    pos.posLookupAction.mockResolvedValue({ ok: true, data: remote });
    offScreen.push(remote);
    try {
      pos.checkoutAction.mockResolvedValue({ ok: true, data: { saleId: "s9", number: "S-00009", totalCents: 100000, balanceDueCents: 0 } });
      renderPos();
      await user.type(screen.getByLabelText("Search products"), "RF-1{Enter}");
      await waitFor(() => expect(pos.posLookupAction).toHaveBeenCalledWith("b1", "RF-1"));
      expect(await sale().findByText("Remote Frame")).toBeInTheDocument();
      await screen.findByText("Prices and stock checked by the server");
      await user.keyboard("{Control>}{Enter}{/Control}");
      expect(sale().getByRole("heading", { name: "Payment" })).toBeInTheDocument();
      await user.keyboard("{Control>}{Enter}{/Control}");
      await waitFor(() => expect(pos.checkoutAction).toHaveBeenCalledTimes(1));
      expect(await screen.findByText("Sale S-00009 completed")).toBeInTheDocument();
    } finally {
      offScreen.pop();
    }
  });

  it("enters and exits browser full screen only from the button", async () => {
    const user = userEvent.setup();
    const request = vi.fn(async () => {
      Object.defineProperty(document, "fullscreenElement", { configurable: true, value: document.documentElement });
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    const exit = vi.fn(async () => {
      Object.defineProperty(document, "fullscreenElement", { configurable: true, value: null });
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    Object.defineProperty(document, "fullscreenEnabled", { configurable: true, value: true });
    Object.defineProperty(document, "fullscreenElement", { configurable: true, value: null });
    document.documentElement.requestFullscreen = request;
    document.exitFullscreen = exit;
    renderPos();
    expect(request).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Enter full screen" }));
    expect(request).toHaveBeenCalledTimes(1);
    await user.click(await screen.findByRole("button", { name: "Exit full screen" }));
    expect(exit).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("button", { name: "Enter full screen" })).toBeInTheDocument();
  });
});
