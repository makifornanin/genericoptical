"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { NavItem } from "@/lib/site-settings";
import { Icon } from "./Icon";

export interface Banner {
  strong: string;
  text: string;
  linkLabel?: string;
  href?: string;
}

interface Props {
  name: string;
  tagline: string | null;
  logoUrl: string | null;
  nav: NavItem[];
  cta: NavItem;
  banner: Banner | null;
}

function isCurrent(href: string, pathname: string): boolean {
  if (href === pathname) return true;
  // Product pages belong to the Eyewear section.
  return href === "/eyewear" && pathname.startsWith("/eyewear/");
}

/* Global header (components/header.html in the GHL-builder version): banner, brand, navigation,
   booking button and the mobile menu (below 900px). */
export function SiteHeader({ name, tagline, logoUrl, nav, cta, banner }: Props) {
  const pathname = usePathname() || "/";
  // The menu is open for the page it was opened on; navigating anywhere closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpenOn(null);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const current = (href: string) => (isCurrent(href, pathname) ? ("page" as const) : undefined);
  const close = () => setOpenOn(null);

  return (
    <div className="oc oc-header-wrap">
      <a className="oc-skip" href="#oc-main">
        Skip to content
      </a>
      {banner ? (
        <div className="oc-promo">
          {banner.strong ? <strong>{banner.strong}</strong> : null}
          {banner.strong && banner.text ? " " : null}
          {banner.text}
          {banner.href && banner.linkLabel ? (
            <>
              {" "}
              <a href={banner.href}>{banner.linkLabel}</a>
            </>
          ) : null}
        </div>
      ) : null}
      <header className="oc-header">
        <div className="oc-header__bar">
          <Link className="oc-brand" href="/" aria-label={`${name} home`}>
            {logoUrl ? (
              <span className="oc-brand__mark oc-brand__mark--logo" aria-hidden="true">
                {/* eslint-disable-next-line @next/next/no-img-element -- remote logo URL from the dashboard API; next/image would need per-deployment remotePatterns */}
                <img src={logoUrl} alt="" height={32} />
              </span>
            ) : (
              <span className="oc-brand__mark" aria-hidden="true">
                {name.trim().charAt(0).toUpperCase()}
              </span>
            )}
            <span className="oc-brand__text">
              <span className="oc-brand__name oc-truncate">{name}</span>
              {tagline ? <span className="oc-brand__tagline oc-truncate">{tagline}</span> : null}
            </span>
          </Link>
          <nav className="oc-nav" aria-label="Main">
            {nav.map((n) => (
              <Link key={n.href} href={n.href} aria-current={current(n.href)}>
                {n.label}
              </Link>
            ))}
          </nav>
          <Link className="oc-btn oc-btn--brand oc-header__cta" href={cta.href}>
            {cta.label}
          </Link>
          <button
            ref={toggleRef}
            type="button"
            className="oc-menu-btn"
            aria-expanded={open}
            aria-controls="oc-mobile-nav"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpenOn(open ? null : pathname)}
          >
            <Icon name="menu" className="oc-icon-open" />
            <Icon name="close" className="oc-icon-close" />
          </button>
        </div>
        <nav id="oc-mobile-nav" className="oc-mobile-nav" aria-label="Main" hidden={!open}>
          <ul>
            {nav.map((n) => (
              <li key={n.href}>
                <Link href={n.href} aria-current={current(n.href)} onClick={close}>
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
          <Link className="oc-btn oc-btn--brand oc-btn--lg" href={cta.href} onClick={close}>
            {cta.label}
          </Link>
        </nav>
      </header>
    </div>
  );
}
