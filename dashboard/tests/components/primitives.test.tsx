import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { MoneyInput } from "@/components/ui/form";
import { Delta } from "@/components/ui/misc";

function MoneyHarness({ onChange }: { onChange: (c: number | null) => void }) {
  const [v, setV] = useState<number | null>(null);
  return (
    <>
      <MoneyInput
        aria-label="Amount"
        value={v}
        onValueChange={(c) => {
          setV(c);
          onChange(c);
        }}
      />
      <button type="button">elsewhere</button>
    </>
  );
}

describe("MoneyInput", () => {
  it("reports centavos while typing and normalises on blur", async () => {
    const onChange = vi.fn();
    render(<MoneyHarness onChange={onChange} />);
    const input = screen.getByLabelText("Amount");
    await userEvent.type(input, "1,234.5");
    expect(onChange).toHaveBeenLastCalledWith(123450);
    await userEvent.click(screen.getByText("elsewhere"));
    expect(input).toHaveValue("1234.50");
  });

  it("treats empty or invalid input as no amount", async () => {
    const onChange = vi.fn();
    render(<MoneyHarness onChange={onChange} />);
    const input = screen.getByLabelText("Amount");
    await userEvent.type(input, "abc");
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});

describe("Delta", () => {
  it("shows direction and judges higher as better by default", () => {
    const { container } = render(<Delta value={12.5} />);
    expect(container).toHaveTextContent("↑ 12.5%");
    expect(container.firstElementChild?.className).toContain("bg-accent-soft");
  });

  it("inverts the judgement for costs", () => {
    const { container } = render(<Delta value={8} inverse />);
    expect(container).toHaveTextContent("↑ 8%");
    expect(container.firstElementChild?.className).toContain("bg-neg-soft");
  });

  it("stays neutral for values like tax", () => {
    const { container } = render(<Delta value={-4} neutral />);
    expect(container).toHaveTextContent("↓ 4%");
    expect(container.firstElementChild?.className).toContain("bg-muted-soft");
  });

  it("says when there is no prior data rather than inventing a percentage", () => {
    render(<Delta value={null} />);
    expect(screen.getByText("no prior data")).toBeInTheDocument();
  });
});
