"use client";

import { CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { useAction } from "@/components/app/use-action";
import { Checkbox, FormError, SelectField, TextareaField, TextField } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { LEAD_INTEREST_LABELS, LEAD_INTERESTS } from "@/lib/schemas";
import { submitInquiryAction } from "./actions";
import { siteButton } from "./site-ui";

type Branch = { id: string; name: string };

export function InquiryForm({
  branches,
  kind = "contact",
  productName,
  defaultInterest = "other",
  submitLabel = "Send message",
  className,
}: {
  branches: Branch[];
  kind?: "contact" | "product_inquiry";
  productName?: string;
  defaultInterest?: (typeof LEAD_INTERESTS)[number];
  submitLabel?: string;
  className?: string;
}) {
  const [sent, setSent] = useState<string | null>(null);
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    interest: defaultInterest as string,
    preferredBranchId: branches.length === 1 ? branches[0].id : "",
    message: productName ? `I'd like to know more about ${productName}.` : "",
    smsConsent: false,
    marketingConsent: false,
    website: "",
  });
  const { run, pending, error, fe } = useAction(submitInquiryAction, { silent: true, onSuccess: () => setSent(form.fullName.split(" ")[0] || "there") });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value }));

  if (sent) {
    return (
      <div role="status" className={cn("rounded-[20px] border border-line bg-surface p-8", className)}>
        <CheckCircle2 className="size-7 text-pos" aria-hidden />
        <h3 className="mt-4 font-display text-[24px] font-semibold">Thanks, {sent}.</h3>
        <p className="mt-2 text-[15px] leading-relaxed text-text-2">We&apos;ve received your message and a member of our team will get back to you, usually within one business day.</p>
        <button type="button" className="mt-6 text-[14px] font-medium underline underline-offset-4" onClick={() => setSent(null)}>
          Send another message
        </button>
      </div>
    );
  }

  return (
    <form
      className={cn("grid gap-4 rounded-[20px] border border-line bg-surface p-6 sm:p-8", className)}
      onSubmit={(e) => {
        e.preventDefault();
        run({ ...form, kind, productName: productName ?? null, preferredBranchId: form.preferredBranchId || null });
      }}
      noValidate
    >
      <TextField label="Full name" required autoComplete="name" value={form.fullName} onChange={set("fullName")} error={fe("fullName")} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Email" type="email" autoComplete="email" value={form.email} onChange={set("email")} error={fe("email")} />
        <TextField label="Mobile number" type="tel" autoComplete="tel" value={form.phone} onChange={set("phone")} error={fe("phone")} hint="Email or mobile — whichever you prefer." />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="I'm interested in" value={form.interest} onChange={set("interest")}>
          {LEAD_INTERESTS.map((i) => (
            <option key={i} value={i}>
              {LEAD_INTEREST_LABELS[i]}
            </option>
          ))}
        </SelectField>
        {branches.length > 1 ? (
          <SelectField label="Preferred branch" value={form.preferredBranchId} onChange={set("preferredBranchId")}>
            <option value="">No preference</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </SelectField>
        ) : null}
      </div>
      <TextareaField label="Message" rows={4} value={form.message} onChange={set("message")} error={fe("message")} />
      {/* Honeypot — hidden from people and assistive tech; bots tend to fill it. */}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Website
          <input tabIndex={-1} autoComplete="off" value={form.website} onChange={set("website")} />
        </label>
      </div>
      <div className="grid gap-2.5 pt-1">
        <Checkbox label="You may text me about this enquiry" checked={form.smsConsent} onChange={set("smsConsent")} />
        <Checkbox label="Send me occasional offers and eye-care reminders" checked={form.marketingConsent} onChange={set("marketingConsent")} />
      </div>
      <FormError message={error} />
      <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
        <p className="max-w-[360px] text-[12.5px] leading-relaxed text-text-3">
          We use your details only to reply to you. See our{" "}
          <a href="/privacy" className="underline underline-offset-2">
            privacy notice
          </a>
          .
        </p>
        <button type="submit" className={siteButton("brand", "lg")} disabled={pending} aria-busy={pending || undefined}>
          {pending ? "Sending…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
