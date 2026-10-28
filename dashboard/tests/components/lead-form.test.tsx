// A non-UTC zone, so the test fails if UTC clock time is shown as local time.
process.env.TZ = "Asia/Manila";

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const leads = vi.hoisted(() => ({
  saveLeadAction: vi.fn(async () => ({ ok: true, data: { id: "lead-1" } })),
  addNoteAction: vi.fn(),
  assignLeadAction: vi.fn(),
  changeStageAction: vi.fn(),
  convertLeadAction: vi.fn(),
  duplicatesAction: vi.fn(),
  setFollowUpAction: vi.fn(),
}));
vi.mock("@/app/app/leads/actions", () => leads);
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/app/leads/lead-1" }));

import { LeadFormDialog } from "@/app/app/leads/forms";

describe("B7: lead follow-up time", () => {
  it("shows the saved instant in local time and saves it back unchanged when nothing is edited", async () => {
    const user = userEvent.setup();
    const saved = "2026-10-20T01:30:00.000Z";
    render(<LeadFormDialog id="lead-1" initial={{ firstName: "Ana", lastName: "Reyes", followUpAt: saved }} staff={[]} branches={[]} canAssign={false} trigger={<button>Edit</button>} />);
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const d = new Date(saved);
    expect(d.getTimezoneOffset()).toBe(-480);
    const pad = (n: number) => String(n).padStart(2, "0");
    const local = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    expect(screen.getByLabelText("Follow up on")).toHaveValue(local);
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(leads.saveLeadAction).toHaveBeenCalledTimes(1));
    const [, values] = leads.saveLeadAction.mock.calls[0] as unknown as [string, { followUpAt: string }];
    // Previously the edit form showed the UTC clock time as local time, so each save moved it by the zone offset.
    expect(values.followUpAt).toBe(saved);
  });
});
