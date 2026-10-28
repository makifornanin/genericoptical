import type { Lens, LensType, Prescription, RxMode } from "./api-types";

/*
 * The lens flow on frame pages: glasses type → lens option → prescription. Lens products and their
 * prices come from the dashboard (GET /lenses); the copy here only explains what each type is.
 */

export type GlassesType = LensType | "frame_only";

export const GLASSES_TYPES: { key: GlassesType; title: string; body: string; rx: boolean }[] = [
  { key: "single_vision", title: "Single vision", body: "One prescription across the whole lens, for distance, reading or screen work.", rx: true },
  { key: "progressive", title: "Progressive", body: "Distance, middle and reading zones in one lens with no visible line. We take a few extra measurements when you collect.", rx: true },
  { key: "bifocal", title: "Bifocal", body: "Distance above, reading below, divided by a small visible segment.", rx: true },
  { key: "frame_only", title: "Frame only", body: "Supplied with non-prescription demo lenses. You can have prescription lenses fitted at a branch later.", rx: false },
];

const FEATURE_COPY: Record<string, { title: string; body: string }> = {
  blue_light: { title: "Blue-light filter", body: "Filters part of the blue light from screens and LED lighting." },
  thin: { title: "Thin & light", body: "Higher-index material: thinner and lighter, recommended for stronger prescriptions." },
  photochromic: { title: "Light-reactive", body: "Clear indoors, darkens outdoors in UV light." },
};

/** Title and explanation for one lens product, based on its type and features. */
export function lensCopy(lens: Lens): { title: string; body: string } {
  const feature = lens.features.find((f) => FEATURE_COPY[f]);
  if (feature) return FEATURE_COPY[feature];
  if (lens.type === "progressive") return { title: "Made to measure", body: "Made to your measurements at our partner laboratory." };
  if (lens.type === "bifocal") return { title: "Flat-top", body: "Made to your prescription at our partner laboratory." };
  return { title: "Standard", body: "Clear prescription lenses made at our partner laboratory." };
}

export const lensesOfType = (lenses: Lens[], type: LensType) => lenses.filter((l) => l.type === type).sort((a, b) => a.priceCents - b.priceCents);

export const RX_MODES: { key: RxMode; title: string; body: string }[] = [
  { key: "send_later", title: "Send it later", body: "Place your order now; we'll contact you for your prescription before your lenses are made." },
  { key: "enter", title: "Enter it now", body: "Type the values from your written prescription. Our optometrist checks them before ordering your lenses." },
  { key: "on_file", title: "Use the one on file", body: "If you've had an eye exam with us, we'll use your latest prescription." },
  { key: "book_exam", title: "I need an eye exam", body: "Order now and book an exam at your pickup branch. Lenses are made after your exam." },
];

export const rxModeLabel = (mode: RxMode) => RX_MODES.find((m) => m.key === mode)?.title ?? mode;

/* ── Prescription values ─────────────────────────────────────────────────────────────────────── */

function range(from: number, to: number, step: number): string[] {
  const out: string[] = [];
  for (let v = from; v <= to + 1e-9; v += step) {
    const n = Math.round(v * 100) / 100;
    out.push(n === 0 ? "0.00" : `${n > 0 ? "+" : "-"}${Math.abs(n).toFixed(2)}`);
  }
  return out;
}

/** SPH −12.00 … +8.00 in 0.25 steps, plano in the middle. */
export const SPH_VALUES = range(-12, 8, 0.25);
/** CYL −6.00 … +6.00, excluding zero (empty = none). */
export const CYL_VALUES = range(-6, 6, 0.25).filter((v) => v !== "0.00");
export const ADD_VALUES = range(0.75, 3.5, 0.25);
export const PD_VALUES = Array.from({ length: 61 }, (_, i) => (50 + i * 0.5).toFixed(1));

export const emptyEye = () => ({ sph: "0.00", cyl: null, axis: null, add: null });

/** Client-side check before the order is sent (the dashboard validates again). */
export function rxProblems(rx: Prescription | null | undefined, needsAdd: boolean): string[] {
  if (!rx || rx.mode !== "enter") return [];
  const problems: string[] = [];
  for (const [eye, label] of [
    [rx.od, "right eye (OD)"],
    [rx.os, "left eye (OS)"],
  ] as const) {
    if (!eye) {
      problems.push(`Add the values for your ${label}.`);
      continue;
    }
    if (eye.cyl && !eye.axis) problems.push(`Add the axis for your ${label} (it goes with the cylinder).`);
    if (eye.axis && (!/^\d{1,3}$/.test(eye.axis) || Number(eye.axis) > 180)) problems.push(`The axis for your ${label} is a whole number from 0 to 180.`);
    if (needsAdd && !eye.add) problems.push(`Add the reading addition (ADD) for your ${label}.`);
  }
  return problems;
}
