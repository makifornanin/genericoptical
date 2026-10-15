import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const pos = vi.hoisted(() => ({ checkoutAction: vi.fn(), posCustomerSearchAction: vi.fn() }));
vi.mock("@/app/app/pos/actions", () => pos);
vi.mock("@/app/app/customers/actions", () => ({ saveCustomerAction: vi.fn(), archiveCustomerAction: vi.fn(), savePrescriptionAction: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/app/pos" }));

import { PosTerminal, type PosItem } from "@/app/app/pos/terminal";

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
  ...o,
});
const items = [
  item({ variantId: "v-cloth", productName: "Microfiber Cloth", priceCents: 12000, available: 2 }),
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
const tile = (name: RegExp) => within(screen.getByRole("region", { name: "Products" })).getByRole("button", { name });

beforeEach(() => pos.checkoutAction.mockReset());

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
});
