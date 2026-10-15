"use client";

import { cloneElement, forwardRef, isValidElement, useId, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { centsToInput, parseMoney } from "@/lib/money";

const control =
  "w-full rounded-[10px] border border-line-strong bg-surface px-3 text-[13.5px] text-text placeholder:text-text-3 transition-colors hover:border-text-3/60 focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/10 disabled:bg-surface-2 disabled:text-text-3 aria-[invalid=true]:border-neg aria-[invalid=true]:ring-neg/10";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(control, "h-9", className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(control, "min-h-[84px] py-2 leading-relaxed", className)} {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...props }, ref) {
  return (
    <select
      ref={ref}
      className={cn(
        control,
        "h-9 appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%2386888d%22 stroke-width=%222%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[length:12px] bg-[right_10px_center] bg-no-repeat pr-8",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
});

export function Field({
  label,
  hint,
  error,
  children,
  className,
  required,
  htmlFor,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | string[] | null;
  children: ReactNode;
  className?: string;
  required?: boolean;
  htmlFor?: string;
}) {
  const message = Array.isArray(error) ? error[0] : error;
  // Link the label to a single control child automatically, so every field has an accessible name.
  const autoId = useId();
  let control = children;
  let target = htmlFor;
  if (!target && isValidElement<{ id?: string }>(children) && LINKABLE.has(children.type)) {
    target = children.props.id ?? autoId;
    if (!children.props.id) control = cloneElement(children, { id: target });
  }
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={target} className="text-[12.5px] font-medium text-text-2">
        {label}
        {required ? <span className="text-neg"> *</span> : null}
      </label>
      {control}
      {message ? (
        <p className="text-[12px] text-neg" role="alert">
          {message}
        </p>
      ) : hint ? (
        <p className="text-[12px] text-text-3">{hint}</p>
      ) : null}
    </div>
  );
}

/** Labeled input with automatic id wiring. */
export function TextField({
  label,
  hint,
  error,
  required,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; hint?: ReactNode; error?: string | string[] | null }) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={id} className={className}>
      <Input id={id} aria-invalid={error ? true : undefined} required={required} {...props} />
    </Field>
  );
}

export function SelectField({
  label,
  hint,
  error,
  required,
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: ReactNode; hint?: ReactNode; error?: string | string[] | null }) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={id} className={className}>
      <Select id={id} aria-invalid={error ? true : undefined} required={required} {...props}>
        {children}
      </Select>
    </Field>
  );
}

export function TextareaField({
  label,
  hint,
  error,
  required,
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: ReactNode; hint?: ReactNode; error?: string | string[] | null }) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={id} className={className}>
      <Textarea id={id} aria-invalid={error ? true : undefined} required={required} {...props} />
    </Field>
  );
}

export function Checkbox({ label, description, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; description?: ReactNode }) {
  const id = useId();
  return (
    <label htmlFor={id} className={cn("flex cursor-pointer items-start gap-2.5 text-[13.5px]", className)}>
      <input id={id} type="checkbox" className="mt-0.5 size-4 shrink-0 cursor-pointer rounded border-line-strong accent-[var(--ink)]" {...props} />
      <span>
        <span className="font-medium">{label}</span>
        {description ? <span className="block text-[12.5px] text-text-3">{description}</span> : null}
      </span>
    </label>
  );
}

/**
 * Money input that works in minor units: accepts "1,234.5"-style typing, shows "1234.50" and reports cents.
 * Keeps the user's typing while editing; normalises on blur.
 */
export function MoneyInput({
  value,
  onValueChange,
  currencySymbol = "₱",
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & { value: number | null; onValueChange: (cents: number | null) => void; currencySymbol?: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value === null || value === undefined ? "" : centsToInput(value));
  return (
    <div className={cn("relative", className)}>
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[13px] text-text-3">{currencySymbol}</span>
      <Input
        inputMode="decimal"
        autoComplete="off"
        className="pl-7 text-right tabular"
        value={shown}
        onChange={(e) => {
          setDraft(e.target.value);
          onValueChange(parseMoney(e.target.value));
        }}
        onBlur={() => setDraft(null)}
        {...props}
      />
    </div>
  );
}

const LINKABLE = new Set<unknown>([Input, Select, Textarea, MoneyInput]);

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-[10px] border border-neg/20 bg-neg-soft px-3 py-2 text-[13px] text-neg">
      {message}
    </div>
  );
}
