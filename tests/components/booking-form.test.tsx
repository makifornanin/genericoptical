import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  publicSlotsAction: vi.fn(),
  bookAppointmentAction: vi.fn(),
  submitInquiryAction: vi.fn(),
}));
vi.mock("@/app/(site)/actions", () => actions);
vi.mock("next/navigation", () => ({ usePathname: () => "/book", useRouter: () => ({ push: vi.fn() }) }));

import { BookingForm } from "@/app/(site)/book/booking-form";
import type { WeekHours } from "@/lib/types";

const open = { open: "10:00", close: "19:00" };
const hours: WeekHours = { mon: open, tue: open, wed: open, thu: open, fri: open, sat: open, sun: null };
const branches = [
  { id: "b-mkt", name: "Makati", address: "118 Lumen Street", hours },
  { id: "b-qc", name: "Quezon City", address: "52 Verde Avenue", hours },
];
const types = [
  { id: "t-exam", name: "Comprehensive eye exam", description: null, durationMinutes: 45, price: "₱500.00" },
  { id: "t-cl", name: "Contact lens fitting", description: null, durationMinutes: 30, price: "₱800.00" },
];

beforeEach(() => {
  actions.publicSlotsAction.mockReset();
  actions.bookAppointmentAction.mockReset();
});

describe("BookingForm", () => {
  it("disables closed days and only loads slots once branch, service and day are chosen", async () => {
    const user = userEvent.setup();
    actions.publicSlotsAction.mockResolvedValue({ ok: true, data: ["10:00", "10:15", "14:30"] });
    // 2026-10-18 is a Sunday.
    render(<BookingForm branches={branches} types={types} today="2026-10-15" />);
    expect(screen.getByText(/Choose a branch and a service first/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Makati/ }));
    await user.click(screen.getByRole("button", { name: /Comprehensive eye exam/ }));
    expect(screen.getByRole("radio", { name: /Sunday, October 18 \(closed\)/ })).toBeDisabled();
    expect(actions.publicSlotsAction).not.toHaveBeenCalled();

    await user.click(screen.getByRole("radio", { name: /Friday, October 16/ }));
    expect(actions.publicSlotsAction).toHaveBeenCalledWith({ branchId: "b-mkt", appointmentTypeId: "t-exam", date: "2026-10-16" });
    expect(await screen.findByRole("radio", { name: "2:30 pm" })).toBeInTheDocument();
  });

  it("submits the chosen slot with contact details and shows a confirmation", async () => {
    const user = userEvent.setup();
    actions.publicSlotsAction.mockResolvedValue({ ok: true, data: ["11:00"] });
    actions.bookAppointmentAction.mockResolvedValue({ ok: true, data: { ok: true, startsAt: "2026-10-16T03:00:00.000Z", typeName: "Contact lens fitting", branchName: "Quezon City" } });
    render(<BookingForm branches={branches} types={types} today="2026-10-15" initialBranch="b-qc" initialType="t-cl" />);

    const submit = screen.getByRole("button", { name: "Request appointment" });
    expect(submit).toBeDisabled();
    await user.click(screen.getByRole("radio", { name: /Friday, October 16/ }));
    await user.click(await screen.findByRole("radio", { name: "11:00 am" }));
    await user.type(screen.getByLabelText(/Full name/), "Ana Cruz");
    await user.type(screen.getByLabelText(/Mobile number/), "09171234567");
    await user.click(screen.getByLabelText("Text me appointment reminders"));
    expect(submit).toBeEnabled();
    await user.click(submit);

    expect(actions.bookAppointmentAction).toHaveBeenCalledWith(
      expect.objectContaining({ branchId: "b-qc", appointmentTypeId: "t-cl", date: "2026-10-16", time: "11:00", fullName: "Ana Cruz", phone: "09171234567", email: null, smsConsent: true, website: "" }),
    );
    expect(await screen.findByText("You're booked in.")).toBeInTheDocument();
    expect(screen.getByText(/Friday, October 16/)).toBeInTheDocument();
  });

  it("shows the server's reason when a slot was taken in the meantime", async () => {
    const user = userEvent.setup();
    actions.publicSlotsAction.mockResolvedValue({ ok: true, data: ["11:00"] });
    actions.bookAppointmentAction.mockResolvedValue({ ok: false, error: "That time was just taken or is outside opening hours. Please pick another slot." });
    render(<BookingForm branches={branches} types={types} today="2026-10-15" initialBranch="b-qc" initialType="t-cl" />);
    await user.click(screen.getByRole("radio", { name: /Friday, October 16/ }));
    await user.click(await screen.findByRole("radio", { name: "11:00 am" }));
    await user.type(screen.getByLabelText(/Full name/), "Ana Cruz");
    await user.type(screen.getByLabelText(/Mobile number/), "09171234567");
    await user.click(screen.getByRole("button", { name: "Request appointment" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That time was just taken");
  });
});
