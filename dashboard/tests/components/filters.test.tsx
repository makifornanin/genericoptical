import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ replace: vi.fn(), search: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace, push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/app/reports",
  useSearchParams: () => new URLSearchParams(nav.search),
}));

import { DateRangeFilter, ParamSelect, SearchInput } from "@/components/app/filters";

beforeEach(() => {
  nav.replace.mockReset();
  nav.search = "";
});

describe("DateRangeFilter", () => {
  it("applies a custom range to the URL", async () => {
    const user = userEvent.setup();
    render(<DateRangeFilter label="Last 30 days" />);
    await user.click(screen.getByRole("button", { name: /Last 30 days/ }));
    await user.click(await screen.findByRole("menuitem", { name: "Custom range…" }));
    const apply = screen.getByRole("button", { name: "Apply" });
    expect(apply).toBeDisabled();
    await user.type(screen.getByLabelText("From"), "2026-09-01");
    await user.type(screen.getByLabelText("To"), "2026-09-30");
    await user.click(apply);
    expect(nav.replace).toHaveBeenCalledWith("/app/reports?range=custom&from=2026-09-01&to=2026-09-30", { scroll: false });
  });

  it("switching to a preset clears custom dates and the page number", async () => {
    nav.search = "range=custom&from=2026-09-01&to=2026-09-30&page=3&branch=b1";
    const user = userEvent.setup();
    render(<DateRangeFilter label="Custom" />);
    await user.click(screen.getByRole("button", { name: /Custom/ }));
    await user.click(await screen.findByRole("menuitem", { name: "This month" }));
    expect(nav.replace).toHaveBeenCalledWith("/app/reports?range=this_month&branch=b1", { scroll: false });
  });
});

describe("SearchInput", () => {
  it("debounces typing into a single URL update", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<SearchInput placeholder="Search customers" />);
    await user.type(screen.getByLabelText("Search customers"), "ana");
    expect(nav.replace).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(350);
    });
    expect(nav.replace).toHaveBeenCalledTimes(1);
    expect(nav.replace).toHaveBeenCalledWith("/app/reports?q=ana", { scroll: false });
    vi.useRealTimers();
  });
});

describe("ParamSelect", () => {
  it("writes the chosen value and removes the param for the empty option", async () => {
    nav.search = "status=draft";
    const user = userEvent.setup();
    render(<ParamSelect param="status" label="Status" options={[{ value: "", label: "Any" }, { value: "draft", label: "Draft" }, { value: "ordered", label: "Ordered" }]} />);
    await user.selectOptions(screen.getByLabelText("Status"), "ordered");
    expect(nav.replace).toHaveBeenLastCalledWith("/app/reports?status=ordered", { scroll: false });
    await user.selectOptions(screen.getByLabelText("Status"), "");
    expect(nav.replace).toHaveBeenLastCalledWith("/app/reports", { scroll: false });
  });
});
