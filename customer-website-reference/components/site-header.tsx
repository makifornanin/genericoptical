"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { SITE_NAV, siteButton } from "./site-ui";

export function SiteHeader({ name, logoUrl, tagline }: { name: string; logoUrl: string | null; tagline: string | null }) {
  const pathname = usePathname();
  // The mobile menu stays open only for the page it was opened on, so navigating closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-[1200px] items-center gap-6 px-5 sm:px-8">
        <Link href="/" className="flex min-w-0 items-center gap-2.5" aria-label={`${name} home`}>
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="h-8 w-auto" />
          ) : (
            <span aria-hidden className="flex size-8 items-center justify-center rounded-full bg-brand text-[13px] font-semibold text-brand-ink">
              {name.slice(0, 1)}
            </span>
          )}
          <span className="flex min-w-0 flex-col leading-none">
            <span className="truncate font-display text-[17px] font-semibold text-text">{name}</span>
            {tagline ? <span className="mt-1 hidden truncate text-[11.5px] text-text-3 sm:block">{tagline}</span> : null}
          </span>
        </Link>

        <nav aria-label="Main" className="ml-auto hidden items-center gap-1 md:flex">
          {SITE_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={cn(
                "rounded-full px-3.5 py-2 text-[14px] text-text-2 transition-colors hover:text-text",
                isActive(item.href) && "bg-surface text-text shadow-[inset_0_0_0_1px_var(--line)]",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <Link href="/book" className={cn(siteButton("brand"), "ml-auto hidden md:ml-2 md:inline-flex")}>
          Book an exam
        </Link>

        <button
          type="button"
          className="ml-auto flex size-10 items-center justify-center rounded-full border border-line-strong bg-surface md:hidden"
          aria-expanded={open}
          aria-controls="site-mobile-nav"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpenOn(open ? null : pathname)}
        >
          {open ? <X className="size-4" /> : <Menu className="size-4" />}
        </button>
      </div>

      {open ? (
        <nav id="site-mobile-nav" aria-label="Main" className="border-t border-line bg-canvas px-5 pb-6 pt-2 md:hidden">
          <ul className="divide-y divide-line">
            {SITE_NAV.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="flex py-3.5 text-[17px] font-medium text-text" aria-current={isActive(item.href) ? "page" : undefined}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          <Link href="/book" className={cn(siteButton("brand", "lg"), "mt-4 w-full")}>
            Book an exam
          </Link>
        </nav>
      ) : null}
    </header>
  );
}
