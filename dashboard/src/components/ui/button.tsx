import Link from "next/link";
import { forwardRef, type ButtonHTMLAttributes, type ComponentProps } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "accent" | "secondary" | "ghost" | "danger" | "link";
type Size = "sm" | "md" | "lg" | "icon" | "icon-sm";

const variants: Record<Variant, string> = {
  primary: "bg-ink text-white hover:bg-ink-2 active:bg-ink-3 disabled:bg-ink/40",
  accent: "bg-accent text-accent-ink hover:brightness-95 active:brightness-90 disabled:opacity-50",
  secondary: "bg-surface text-text border border-line-strong hover:bg-surface-2 hover:border-text-3/50 disabled:opacity-50",
  ghost: "text-text-2 hover:bg-muted-soft hover:text-text disabled:opacity-50",
  danger: "bg-surface text-neg border border-line-strong hover:bg-neg-soft hover:border-neg/30 disabled:opacity-50",
  link: "text-text underline underline-offset-4 decoration-line-strong hover:decoration-text px-0",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5",
  md: "h-9 px-3.5 text-[13.5px] gap-2",
  lg: "h-11 px-5 text-[15px] gap-2",
  icon: "h-9 w-9 justify-center",
  "icon-sm": "h-8 w-8 justify-center",
};

export function buttonClass(variant: Variant = "secondary", size: Size = "md", className?: string) {
  return cn(
    "inline-flex shrink-0 items-center whitespace-nowrap rounded-[10px] font-medium transition-[background-color,border-color,color,filter] duration-150 disabled:cursor-not-allowed [&_svg]:size-4 [&_svg]:shrink-0",
    variants[variant],
    variant !== "link" && sizes[size],
    className,
  );
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading, className, children, disabled, type = "button", ...props },
  ref,
) {
  return (
    <button ref={ref} type={type} className={buttonClass(variant, size, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
});

export function ButtonLink({ variant = "secondary", size = "md", className, ...props }: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn("size-4 animate-spin", className)} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
