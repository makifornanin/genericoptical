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
vi.mock("@/app/app/pos/actions", () => pos);
vi.mock("@/app/app/customers/actions", () => ({ saveCustomerAction: vi.fn(), archiveCustomerAction: vi.fn(), savePrescriptionAction: vi.fn(), customerMatchesAction: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/app/pos" }));

import { PosTerminal, type PosItem } from "@/app/app/pos/terminal";
import { priceSale } from "@/lib/pricing";

const item = (o: Partial<PosItem> & Pick<PosItem, "variantId" | "productName" | "priceCents">): PosItem => ({
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
];

function renderPos() {
  return render(
    <PosTerminal
      items={items}
      categories={[{ id: "c1", name: "Care" }]}
      branchId="b1"
      branches={[{ id: "b1", name: "Makati" }]}
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
const tile = (name: RegExp) => {
  const matches = within(screen.getByRole("region", { name: "Products" }))
    .getAllByRole("button", { name })
    .filter((b) => !recentGroup().contains(b));
  expect(matches).toHaveLength(1);
  return matches[0];
};

/** Products the server knows about but that aren't loaded on screen (for the SKU lookup test). */
const offScreen: PosItem[] = [];

/** The server quote, computed like the real one from catalogue prices (`override` simulates changes). */
function serverQuote(override: { totalCents?: number; problems?: string[] } = {}) {
  return async (input: { items: { variantId: string; quantity: number }[] }) => {
    const priced = priceSale(
      input.items.map((l, i) => {
        const it = [...items, ...offScreen].find((x) => x.variantId === l.variantId)!;
        return { key: String(i), quantity: l.quantity, unitPriceCents: it.priceCents, taxExempt: it.taxExempt };
      }),
      { rateBps: 1200, pricesIncludeTax: true },
      null,
    );
    return { ok: true, data: { ...priced, lines: [], available: {}, checkedAt: new Date().toISOString(), problems: override.problems ?? [], totalCents: override.totalCents ?? priced.totalCents } };
  };
}

beforeEach(() => {
  for (const fn of Object.values(pos)) fn.mockReset();
  pos.quoteCartAction.mockImplementation(serverQuote());
  pos.listHeldCartsAction.mockResolvedValue({ ok: true, data: [] });
  pos.posCustomerContextAction.mockResolvedValue({ ok: true, data: { visits: 0, lastPurchaseAt: null, outstanding: { count: 0, totalCents: 0 }, recentItems: [] } });
  window.localStorage.clear();
});

describe("POS terminal", () => {
  it("totals the cart with tax included and never sells more than is in stock", async () => {
    const user = userEvent.setup();
    renderPos();
    await user.click(tile(/Microfiber Cloth/));
    await user.click(tile(/Microfiber Cloth/));
    expect(tile(/Microfiber Cloth/)).toBeDisabled(); // only 2 available
    await user.click(tile(/Hard Shell Case/));
    // 2 × 120 + 350 = 590, VAT 12% included = 63.21
    expect(screen.getByRole("button", { name: /Complete sale · ₱590\.00/ })).toBeEnabled();
    expect(sale().getByText("₱63.21")).toBeInTheDocument();
  });

  it("blocks discounts above the staff limit", async () => {
    const user = userEvent.setup();
    renderPos();
    await user.click(tile(/Hard Shell Case/));
    await user.selectOptions(screen.getByLabelText("Discount type"), "percent");
    await user.type(screen.getByLabelText("Discount value"), "25");
    expect(screen.getByText("Discounts above 20% need a manager.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Complete sale/ })).toBeDisabled();
    await user.clear(screen.getByLabelText("Discount value"));
    await user.type(screen.getByLabelText("Discount value"), "10");
    expect(screen.getByRole("button", { name: /Complete sale · ₱315\.00/ })).toBeEnabled();
  });

  it("requires a customer before leaving a balance due", async () => {
    const user = userEvent.setup();
    renderPos();
    await user.click(tile(/Hard Shell Case/));
    await user.click(screen.getByLabelText("Partial payment"));
    const amount = screen.getAllByLabelText("Amount")[0];
    await user.clear(amount);
    await user.type(amount, "100");
    expect(screen.getByText("Link a customer to leave a balance due.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Complete sale/ })).toBeDisabled();
  });

  it("sends one idempotency key per cart, reused if the cashier retries", async () => {
    const user = userEvent.setup();
    pos.checkoutAction
      .mockResolvedValueOnce({ ok: false, error: "Couldn't reach the server." })
      .mockResolvedValueOnce({ ok: true, data: { saleId: "s1", number: "S-00001", totalCents: 50000, balanceDueCents: 0 } });
    renderPos();
    await user.click(tile(/Eye Examination/));
    const charge = screen.getByRole("button", { name: /Complete sale/ });
    await user.click(charge);
    // Wait for the failed attempt to settle (the button is disabled while a request is in flight).
    await waitFor(() => expect(charge).not.toHaveAttribute("aria-busy"));
    await waitFor(() => expect(charge).toBeEnabled());
    await user.click(charge);
    await waitFor(() => expect(pos.checkoutAction).toHaveBeenCalledTimes(2));
    const [first] = pos.checkoutAction.mock.calls[0];
    const [second] = pos.checkoutAction.mock.calls[1];
    expect(first.idempotencyKey).toBeTruthy();
    expect(second.idempotencyKey).toBe(first.idempotencyKey);
    expect(first).toMatchObject({ branchId: "b1", customerId: null, items: [{ variantId: "v-exam", quantity: 1 }], payments: [{ method: "cash", amountCents: 50000 }] });
    expect(await screen.findByText("Sale S-00001 completed")).toBeInTheDocument();
  });

  it("A2: uses a new idempotency key when the cart changes after a failed attempt", async () => {
    const user = userEvent.setup();
    pos.checkoutAction
      .mockResolvedValueOnce({ ok: false, error: "Couldn't reach the server." })
      .mockResolvedValueOnce({ ok: true, data: { saleId: "s2", number: "S-00002", totalCents: 85000, balanceDueCents: 0 } });
    renderPos();
    await user.click(tile(/Eye Examination/));
    const charge = () => screen.getByRole("button", { name: /Complete sale/ });
    await user.click(charge());
    await waitFor(() => expect(charge()).toBeEnabled());
    // The cashier adds an item before retrying: that is a different sale, so it can't reuse the old key
    // (the server would otherwise answer with the first request's result, or reject the mismatch).
    await user.click(tile(/Hard Shell Case/));
    await user.click(charge());
    await waitFor(() => expect(pos.checkoutAction).toHaveBeenCalledTimes(2));
    const [first] = pos.checkoutAction.mock.calls[0];
    const [second] = pos.checkoutAction.mock.calls[1];
    expect(second.items).toHaveLength(2);
    expect(second.idempotencyKey).toBeTruthy();
    expect(second.idempotencyKey).not.toBe(first.idempotencyKey);
  });

  it("confirms totals with the server and blocks the sale when server prices or stock differ", async () => {
    const user = userEvent.setup();
    renderPos();
    await user.click(tile(/Hard Shell Case/));
    expect(await screen.findByText("Prices and stock checked by the server")).toBeInTheDocument();
    expect(pos.quoteCartAction).toHaveBeenLastCalledWith(expect.objectContaining({ branchId: "b1", items: [expect.objectContaining({ variantId: "v-case", quantity: 1 })] }));

    pos.quoteCartAction.mockImplementation(serverQuote({ totalCents: 40000 }));
    await user.click(tile(/Microfiber Cloth/));
    expect(await screen.findByText(/Prices changed since this screen loaded/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Complete sale/ })).toBeDisabled();

    pos.quoteCartAction.mockImplementation(serverQuote({ problems: ["Microfiber Cloth (V-CLOTH): only 0 left at this branch (1 in the cart)."] }));
    await user.click(tile(/Eye Examination/));
    expect(await screen.findByText(/only 0 left at this branch/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Complete sale/ })).toBeDisabled();
  });

  it("remembers recently added products and flags low stock", async () => {
    const user = userEvent.setup();
    renderPos();
    expect(tile(/Microfiber Cloth/)).toHaveTextContent("Low · 2 left");
    await user.click(tile(/Hard Shell Case/));
    expect(within(recentGroup()).getByRole("button", { name: /Hard Shell Case/ })).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem("pos:recent:b1") ?? "[]")).toEqual(["v-case"]);
    await user.click(screen.getByRole("switch", { name: /In stock only/ }));
    expect(screen.getByRole("switch", { name: /In stock only/ })).toHaveAttribute("aria-checked", "true");
  });

  it("holds the cart without reserving stock and clears the counter", async () => {
    const user = userEvent.setup();
    pos.holdCartAction.mockResolvedValue({ ok: true, data: { id: "h1", label: "Ana" }, message: "Cart put on hold" });
    renderPos();
    await user.click(tile(/Hard Shell Case/));
    await user.click(sale().getByRole("button", { name: /Hold/ }));
    await user.type(screen.getByLabelText("Name"), "Ana");
    await user.click(screen.getByRole("button", { name: /Hold cart/ }));
    await waitFor(() => expect(pos.holdCartAction).toHaveBeenCalledTimes(1));
    expect(pos.holdCartAction.mock.calls[0][0]).toMatchObject({ branchId: "b1", label: "Ana", lines: [{ variantId: "v-case", qty: 1 }], estimatedTotalCents: 35000 });
    await waitFor(() => expect(sale().getByText("Tap a product or scan a barcode to start.")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Held carts (1)" })).toBeInTheDocument();
  });

  it("looks up an exact SKU on the server when it isn't on screen, and completes with F9", async () => {
    const user = userEvent.setup();
    const remote = item({ variantId: "v-remote", productName: "Remote Frame", priceCents: 100000, sku: "RF-1" });
    pos.posLookupAction.mockResolvedValue({ ok: true, data: remote });
    offScreen.push(remote); // the server can price it, but it isn't among the items on screen
    try {
      pos.checkoutAction.mockResolvedValue({ ok: true, data: { saleId: "s9", number: "S-00009", totalCents: 100000, balanceDueCents: 0 } });
      renderPos();
      await user.type(screen.getByLabelText("Search products"), "RF-1{Enter}");
      await waitFor(() => expect(pos.posLookupAction).toHaveBeenCalledWith("b1", "RF-1"));
      expect(await sale().findByText("Remote Frame")).toBeInTheDocument();
      await screen.findByText("Prices and stock checked by the server");
      await user.keyboard("{F9}");
      await waitFor(() => expect(pos.checkoutAction).toHaveBeenCalledTimes(1));
      expect(await screen.findByText("Sale S-00009 completed")).toBeInTheDocument();
    } finally {
      offScreen.pop();
    }
  });
});
