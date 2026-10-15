"use client";

import { Plus, RefreshCw, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmDialog, DialogContent, DialogRoot, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox, Field, FormError, Input, MoneyInput, SelectField, Textarea, TextareaField, TextField } from "@/components/ui/form";
import { contrast } from "@/lib/color";
import { WEEKDAYS, type WeekHours } from "@/lib/types";
import {
  resetDemoAction,
  saveAppointmentTypeAction,
  saveBranchAction,
  saveHoursAction,
  saveProfileAction,
  saveTaxAction,
  saveWebsiteAction,
} from "./actions";

function SaveBar({ pending, error, onSave, label = "Save changes" }: { pending: boolean; error: string | null; onSave: () => void; label?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3">
      <div className="min-w-0 flex-1">
        <FormError message={error} />
      </div>
      <Button variant="primary" loading={pending} onClick={onSave}>
        {label}
      </Button>
    </div>
  );
}

// ─── Profile & branding ──────────────────────────────────────────────────────

export type ProfileValues = {
  name: string;
  legalName: string;
  tagline: string;
  description: string;
  logoUrl: string;
  brandColor: string;
  accentColor: string;
  email: string;
  phone: string;
  website: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
};

export function ProfileForm({ initial }: { initial: ProfileValues }) {
  const [v, setV] = useState(initial);
  const act = useAction(saveProfileAction);
  const set = (k: keyof ProfileValues, val: string) => setV((p) => ({ ...p, [k]: val }));
  const accentRatio = /^#[0-9a-f]{6}$/i.test(v.accentColor) ? Math.max(contrast(v.accentColor, "#18191b"), contrast(v.accentColor, "#ffffff")) : 0;
  return (
    <Card>
      <CardHeader title="Business profile & branding" subtitle="Shown on the website, receipts, sign-in page and dashboard." />
      <CardBody className="grid gap-4 sm:grid-cols-2">
        <TextField label="Business name" required value={v.name} onChange={(e) => set("name", e.target.value)} error={act.fe("name")} />
        <TextField label="Registered name" value={v.legalName} onChange={(e) => set("legalName", e.target.value)} />
        <TextField label="Tagline" value={v.tagline} onChange={(e) => set("tagline", e.target.value)} />
        <TextField label="Logo URL" value={v.logoUrl} onChange={(e) => set("logoUrl", e.target.value)} error={act.fe("logoUrl")} placeholder="https://… (square image)" />
        <TextareaField label="Short description" value={v.description} onChange={(e) => set("description", e.target.value)} className="sm:col-span-2" />
        <Field label="Brand colour" hint="Website headers, buttons and receipts." error={act.fe("brandColor")}>
          <div className="flex items-center gap-2">
            <input type="color" value={v.brandColor} onChange={(e) => set("brandColor", e.target.value)} className="h-9 w-12 cursor-pointer rounded-[8px] border border-line-strong bg-surface" aria-label="Pick brand colour" />
            <Input value={v.brandColor} onChange={(e) => set("brandColor", e.target.value)} className="font-mono" aria-label="Brand colour hex" />
          </div>
        </Field>
        <Field label="Accent colour" hint={accentRatio ? `Highlights and primary actions · text contrast ${accentRatio.toFixed(1)}:1${accentRatio < 4.5 ? " — low, pick a stronger tone" : ""}` : undefined} error={act.fe("accentColor")}>
          <div className="flex items-center gap-2">
            <input type="color" value={v.accentColor} onChange={(e) => set("accentColor", e.target.value)} className="h-9 w-12 cursor-pointer rounded-[8px] border border-line-strong bg-surface" aria-label="Pick accent colour" />
            <Input value={v.accentColor} onChange={(e) => set("accentColor", e.target.value)} className="font-mono" aria-label="Accent colour hex" />
          </div>
        </Field>
        <TextField label="Email" type="email" value={v.email} onChange={(e) => set("email", e.target.value)} error={act.fe("email")} />
        <TextField label="Phone" value={v.phone} onChange={(e) => set("phone", e.target.value)} error={act.fe("phone")} />
        <TextField label="Website" value={v.website} onChange={(e) => set("website", e.target.value)} />
        <TextField label="Address" value={v.addressLine1} onChange={(e) => set("addressLine1", e.target.value)} />
        <TextField label="Address line 2" value={v.addressLine2} onChange={(e) => set("addressLine2", e.target.value)} />
        <TextField label="City" value={v.city} onChange={(e) => set("city", e.target.value)} />
        <TextField label="Region / province" value={v.region} onChange={(e) => set("region", e.target.value)} />
        <TextField label="Postal code" value={v.postalCode} onChange={(e) => set("postalCode", e.target.value)} />
        <TextField label="Country (ISO code)" value={v.country} onChange={(e) => set("country", e.target.value.toUpperCase())} maxLength={2} />
      </CardBody>
      <SaveBar pending={act.pending} error={act.error && !Object.keys(act.fieldErrors).length ? act.error : null} onSave={() => act.run(v)} />
    </Card>
  );
}

// ─── Currency, tax & receipts ────────────────────────────────────────────────

export type TaxValues = { currency: string; locale: string; timezone: string; taxName: string; taxRatePct: string; pricesIncludeTax: boolean; taxRegistration: string; receiptFooter: string; maxDiscountPct: string };

export function TaxForm({ initial }: { initial: TaxValues }) {
  const [v, setV] = useState(initial);
  const act = useAction(saveTaxAction);
  const set = <K extends keyof TaxValues>(k: K, val: TaxValues[K]) => setV((p) => ({ ...p, [k]: val }));
  return (
    <Card>
      <CardHeader title="Currency, tax & receipts" subtitle="Changes apply to new sales; past sales keep the tax settings they were made with." />
      <CardBody className="grid gap-4 sm:grid-cols-3">
        <TextField label="Currency (ISO)" value={v.currency} onChange={(e) => set("currency", e.target.value.toUpperCase())} maxLength={3} error={act.fe("currency")} />
        <TextField label="Number format locale" value={v.locale} onChange={(e) => set("locale", e.target.value)} hint="e.g. en-PH, en-US" error={act.fe("locale")} />
        <TextField label="Time zone" value={v.timezone} onChange={(e) => set("timezone", e.target.value)} hint="IANA name, e.g. Asia/Manila" error={act.fe("timezone")} />
        <TextField label="Tax name" value={v.taxName} onChange={(e) => set("taxName", e.target.value)} />
        <TextField label="Tax rate (%)" inputMode="decimal" value={v.taxRatePct} onChange={(e) => set("taxRatePct", e.target.value)} error={act.fe("taxRateBps")} />
        <SelectField label="Prices are…" value={v.pricesIncludeTax ? "incl" : "excl"} onChange={(e) => set("pricesIncludeTax", e.target.value === "incl")}>
          <option value="incl">Tax-inclusive (shelf price includes tax)</option>
          <option value="excl">Tax-exclusive (tax added at checkout)</option>
        </SelectField>
        <TextField label="Tax registration (TIN)" value={v.taxRegistration} onChange={(e) => set("taxRegistration", e.target.value)} />
        <TextField label="Staff discount limit (%)" inputMode="decimal" value={v.maxDiscountPct} onChange={(e) => set("maxDiscountPct", e.target.value)} hint="Higher discounts need a manager." />
        <div />
        <TextareaField label="Receipt footer" value={v.receiptFooter} onChange={(e) => set("receiptFooter", e.target.value)} className="sm:col-span-3" />
      </CardBody>
      <SaveBar
        pending={act.pending}
        error={act.error}
        onSave={() =>
          act.run({
            currency: v.currency,
            locale: v.locale,
            timezone: v.timezone,
            taxName: v.taxName,
            taxRateBps: Math.round(Number(v.taxRatePct) * 100),
            pricesIncludeTax: v.pricesIncludeTax,
            taxRegistration: v.taxRegistration,
            receiptFooter: v.receiptFooter,
            maxStaffDiscountBps: Math.round(Number(v.maxDiscountPct) * 100),
          })
        }
      />
    </Card>
  );
}

// ─── Hours ───────────────────────────────────────────────────────────────────

const DAY_NAMES: Record<string, string> = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };

function HoursEditor({ value, onChange }: { value: WeekHours; onChange: (v: WeekHours) => void }) {
  return (
    <div className="divide-y divide-line">
      {WEEKDAYS.map((d) => {
        const h = value[d];
        return (
          <div key={d} className="flex flex-wrap items-center gap-3 py-2">
            <span className="w-24 text-[13px] font-medium">{DAY_NAMES[d]}</span>
            <Checkbox label="Open" checked={Boolean(h)} onChange={(e) => onChange({ ...value, [d]: e.target.checked ? { open: "10:00", close: "19:00" } : null })} />
            {h ? (
              <div className="flex items-center gap-2">
                <Input type="time" aria-label={`${DAY_NAMES[d]} opens`} value={h.open} onChange={(e) => onChange({ ...value, [d]: { ...h, open: e.target.value } })} className="h-8 w-32" />
                <span className="text-text-3">–</span>
                <Input type="time" aria-label={`${DAY_NAMES[d]} closes`} value={h.close} onChange={(e) => onChange({ ...value, [d]: { ...h, close: e.target.value } })} className="h-8 w-32" />
              </div>
            ) : (
              <span className="text-[13px] text-text-3">Closed</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function HoursForm({ initial }: { initial: WeekHours }) {
  const [v, setV] = useState(initial);
  const act = useAction(saveHoursAction);
  return (
    <Card>
      <CardHeader title="Business hours" subtitle="Default for all branches (a branch can override). Bookings must fit inside these hours." />
      <CardBody>
        <HoursEditor value={v} onChange={setV} />
      </CardBody>
      <SaveBar pending={act.pending} error={act.error} onSave={() => act.run(v)} />
    </Card>
  );
}

// ─── Branches ────────────────────────────────────────────────────────────────

export type BranchValues = { name: string; code: string; addressLine1: string; addressLine2: string; city: string; region: string; phone: string; email: string; mapUrl: string; imageUrl: string; businessHours: WeekHours | null; isActive: boolean };

export function BranchDialog({ id, initial, defaultHours, trigger }: { id?: string; initial: BranchValues; defaultHours: WeekHours; trigger: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(initial);
  const act = useAction(saveBranchAction, { onSuccess: () => setOpen(false) });
  const set = <K extends keyof BranchValues>(k: K, val: BranchValues[K]) => setV((p) => ({ ...p, [k]: val }));
  return (
    <DialogRoot open={open} onOpenChange={(o) => { setOpen(o); if (o) { setV(initial); act.reset(); } }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        size="lg"
        title={id ? `Edit ${initial.name}` : "Add branch"}
        description={id ? undefined : "A stockroom is created automatically for each branch."}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={act.pending} onClick={() => act.run(id ?? null, v)}>Save branch</Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField label="Branch name" value={v.name} onChange={(e) => set("name", e.target.value)} error={act.fe("name")} className="sm:col-span-2" />
          <TextField label="Code" value={v.code} onChange={(e) => set("code", e.target.value.toUpperCase())} error={act.fe("code")} />
          <TextField label="Address" value={v.addressLine1} onChange={(e) => set("addressLine1", e.target.value)} className="sm:col-span-2" />
          <TextField label="City" value={v.city} onChange={(e) => set("city", e.target.value)} />
          <TextField label="Phone" value={v.phone} onChange={(e) => set("phone", e.target.value)} error={act.fe("phone")} />
          <TextField label="Email" value={v.email} onChange={(e) => set("email", e.target.value)} error={act.fe("email")} />
          <TextField label="Map link" value={v.mapUrl} onChange={(e) => set("mapUrl", e.target.value)} placeholder="https://maps…" />
          <div className="sm:col-span-3">
            <Checkbox label="Custom hours for this branch" checked={Boolean(v.businessHours)} onChange={(e) => set("businessHours", e.target.checked ? defaultHours : null)} />
            {v.businessHours ? <HoursEditor value={v.businessHours} onChange={(h) => set("businessHours", h)} /> : null}
          </div>
          {id ? <Checkbox label="Active" description="Inactive branches can't sell or take bookings." checked={v.isActive} onChange={(e) => set("isActive", e.target.checked)} /> : null}
          <div className="sm:col-span-3"><FormError message={act.error && !Object.keys(act.fieldErrors).length ? act.error : null} /></div>
        </div>
      </DialogContent>
    </DialogRoot>
  );
}

// ─── Appointment types ───────────────────────────────────────────────────────

export type ApptTypeValues = { name: string; code: string; description: string; durationMinutes: string; requiresPractitioner: boolean; isPublic: boolean; priceCents: number | null; isActive: boolean };

export function AppointmentTypeDialog({ id, initial, trigger }: { id?: string; initial: ApptTypeValues; trigger: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(initial);
  const act = useAction(saveAppointmentTypeAction, { onSuccess: () => setOpen(false) });
  const set = <K extends keyof ApptTypeValues>(k: K, val: ApptTypeValues[K]) => setV((p) => ({ ...p, [k]: val }));
  return (
    <DialogRoot open={open} onOpenChange={(o) => { setOpen(o); if (o) { setV(initial); act.reset(); } }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        title={id ? `Edit ${initial.name}` : "Add appointment type"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={act.pending} onClick={() => act.run(id ?? null, { ...v, durationMinutes: Number(v.durationMinutes) })}>Save</Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Name" value={v.name} onChange={(e) => set("name", e.target.value)} error={act.fe("name")} />
          <TextField label="Code" value={v.code} onChange={(e) => set("code", e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))} error={act.fe("code")} />
          <TextField label="Duration (minutes)" type="number" min={5} max={480} value={v.durationMinutes} onChange={(e) => set("durationMinutes", e.target.value)} error={act.fe("durationMinutes")} />
          <Field label="Price shown online (optional)">
            <MoneyInput value={v.priceCents} onValueChange={(c) => set("priceCents", c)} />
          </Field>
          <TextareaField label="Description" value={v.description} onChange={(e) => set("description", e.target.value)} className="sm:col-span-2" />
          <Checkbox label="Needs a practitioner" description="Blocks the practitioner's calendar; double-booking is prevented." checked={v.requiresPractitioner} onChange={(e) => set("requiresPractitioner", e.target.checked)} />
          <Checkbox label="Bookable on the website" checked={v.isPublic} onChange={(e) => set("isPublic", e.target.checked)} />
          <Checkbox label="Active" checked={v.isActive} onChange={(e) => set("isActive", e.target.checked)} />
          <div className="sm:col-span-2"><FormError message={act.error && !Object.keys(act.fieldErrors).length ? act.error : null} /></div>
        </div>
      </DialogContent>
    </DialogRoot>
  );
}

// ─── Website content ─────────────────────────────────────────────────────────

export type WebsiteValues = { heroEyebrow: string; heroTitle: string; heroBody: string; aboutTitle: string; aboutBody: string; privacyContactEmail: string; values: { title: string; body: string }[]; faqs: { question: string; answer: string }[] };

export function WebsiteForm({ initial }: { initial: WebsiteValues }) {
  const [v, setV] = useState(initial);
  const act = useAction(saveWebsiteAction);
  const set = <K extends keyof WebsiteValues>(k: K, val: WebsiteValues[K]) => setV((p) => ({ ...p, [k]: val }));
  return (
    <Card>
      <CardHeader title="Website content" subtitle="Edit the public site without touching code. Products marked “Show on website” appear on the eyewear page automatically." />
      <CardBody className="grid gap-4 sm:grid-cols-2">
        <TextField label="Hero eyebrow" value={v.heroEyebrow} onChange={(e) => set("heroEyebrow", e.target.value)} />
        <TextField label="Hero headline" value={v.heroTitle} onChange={(e) => set("heroTitle", e.target.value)} />
        <TextareaField label="Hero text" value={v.heroBody} onChange={(e) => set("heroBody", e.target.value)} className="sm:col-span-2" />
        <TextField label="About headline" value={v.aboutTitle} onChange={(e) => set("aboutTitle", e.target.value)} />
        <TextField label="Privacy contact email" value={v.privacyContactEmail} onChange={(e) => set("privacyContactEmail", e.target.value)} error={act.fe("privacyContactEmail")} />
        <TextareaField label="About text" value={v.aboutBody} onChange={(e) => set("aboutBody", e.target.value)} className="sm:col-span-2" rows={5} />
        <div className="sm:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[12.5px] font-medium text-text-2">Highlights</p>
            <Button size="sm" onClick={() => set("values", [...v.values, { title: "", body: "" }])} disabled={v.values.length >= 8}>
              <Plus /> Add
            </Button>
          </div>
          <div className="flex flex-col gap-2">
            {v.values.map((x, i) => (
              <div key={i} className="flex gap-2">
                <Input aria-label="Highlight title" value={x.title} onChange={(e) => set("values", v.values.map((y, j) => (j === i ? { ...y, title: e.target.value } : y)))} className="w-56" placeholder="Title" />
                <Input aria-label="Highlight text" value={x.body} onChange={(e) => set("values", v.values.map((y, j) => (j === i ? { ...y, body: e.target.value } : y)))} placeholder="Short description" />
                <Button variant="ghost" size="icon" aria-label="Remove highlight" onClick={() => set("values", v.values.filter((_, j) => j !== i))}>
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>
        </div>
        <div className="sm:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[12.5px] font-medium text-text-2">FAQs</p>
            <Button size="sm" onClick={() => set("faqs", [...v.faqs, { question: "", answer: "" }])}>
              <Plus /> Add question
            </Button>
          </div>
          <div className="flex flex-col gap-3">
            {v.faqs.map((x, i) => (
              <div key={i} className="rounded-[12px] border border-line p-3">
                <div className="flex gap-2">
                  <Input aria-label="Question" value={x.question} onChange={(e) => set("faqs", v.faqs.map((y, j) => (j === i ? { ...y, question: e.target.value } : y)))} placeholder="Question" className="font-medium" />
                  <Button variant="ghost" size="icon" aria-label="Remove question" onClick={() => set("faqs", v.faqs.filter((_, j) => j !== i))}>
                    <Trash2 />
                  </Button>
                </div>
                <Textarea aria-label="Answer" value={x.answer} onChange={(e) => set("faqs", v.faqs.map((y, j) => (j === i ? { ...y, answer: e.target.value } : y)))} placeholder="Answer" className="mt-2 min-h-[64px]" />
              </div>
            ))}
          </div>
        </div>
      </CardBody>
      <SaveBar pending={act.pending} error={act.error} onSave={() => act.run(v)} />
    </Card>
  );
}

// ─── Integrations ────────────────────────────────────────────────────────────

export function DemoPanel() {
  const [pending, setPending] = useState(false);
  return (
    <Card>
      <CardHeader title="Demo data" subtitle="Available only because DEMO_MODE is on and this is the demo business." />
      <CardBody className="flex flex-col gap-3 text-[13.5px] text-text-2">
        <p>Resetting deletes this demo business&apos;s records (and only demo businesses) and regenerates about nine months of sample trading through the same business rules as live use. It takes around a minute and signs everyone out.</p>
        <ConfirmDialog
          trigger={
            <Button variant="danger" loading={pending} className="self-start">
              <RefreshCw /> Reset demo data
            </Button>
          }
          title="Reset all demo data?"
          description="Every change made in the demo is discarded and fresh sample data is generated."
          confirmLabel="Reset now"
          onConfirm={async () => {
            setPending(true);
            toast.info("Rebuilding demo data — this takes about a minute…");
            const r = await resetDemoAction();
            setPending(false);
            if (r && !r.ok) toast.error(r.error);
            return true;
          }}
        />
      </CardBody>
    </Card>
  );
}

