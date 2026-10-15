import { Glasses } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { brandVars } from "@/lib/color";
import { getSiteBusiness } from "@/server/services/settings";

async function BrandPanel() {
  const biz = await getSiteBusiness();
  return (
    <div
      className="relative hidden flex-col justify-between overflow-hidden bg-brand p-10 text-brand-ink lg:flex"
      style={biz ? (brandVars(biz.brandColor, biz.accentColor) as React.CSSProperties) : undefined}
    >
      <Link href="/" className="flex items-center gap-2.5">
        <span className="flex size-9 items-center justify-center rounded-[10px] bg-accent text-accent-ink">
          <Glasses className="size-5" aria-hidden="true" />
        </span>
        <span className="text-[15px] font-semibold">{biz?.name ?? "Optical platform"}</span>
      </Link>
      <div className="max-w-md">
        <p className="font-display text-[44px] leading-[1.02] font-semibold tracking-[-0.03em]">Run the whole shop from one place.</p>
        <p className="mt-4 text-[15px] leading-relaxed opacity-75">
          Sales, prescription orders, stock, appointments and customer follow-ups — connected, so every number on the dashboard comes from real records.
        </p>
      </div>
      <p className="text-[12px] opacity-50">Staff sign-in · {biz?.name ?? ""}</p>
      <svg aria-hidden="true" className="pointer-events-none absolute -right-24 -bottom-24 size-[420px] opacity-[0.07]" viewBox="0 0 400 300" fill="none" stroke="currentColor" strokeWidth="9">
        <circle cx="132" cy="150" r="56" />
        <circle cx="268" cy="150" r="56" />
        <path d="M190 142 Q200 128 210 142" />
      </svg>
    </div>
  );
}

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-screen bg-canvas lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <Suspense fallback={<div className="hidden bg-ink lg:block" />}>
        <BrandPanel />
      </Suspense>
      <main className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-[400px]">{children}</div>
      </main>
    </div>
  );
}
