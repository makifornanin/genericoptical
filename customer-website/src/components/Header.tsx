"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { PRIMARY_NAV, SECONDARY_NAV } from "@/lib/content";
import { useBag } from "./BagProvider";
import { Drawer } from "./Drawer";
import { Icon } from "./Icon";

/** Site header: wordmark, collections, stores/help, search, bag and the eye-exam call to action. */
export function Header({ wordmark, notice }: { wordmark: string; notice: { text: string; href: string; link: string } | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const { count, ready } = useBag();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const current = (href: string) => (pathname === href || pathname.startsWith(`${href}/`) ? "page" : undefined);

  function submitSearch(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    setSearchOpen(false);
    setMenuOpen(false);
    router.push(q ? `/search?q=${encodeURIComponent(q)}` : "/search");
  }

  return (
    <>
      {notice ? (
        <div className="topbar">
          <p>
            {notice.text}
            <Link href={notice.href}>{notice.link}</Link>
          </p>
        </div>
      ) : null}
      <header className="header">
        <div className="wrap header__bar">
          <button type="button" className="icon-btn menu-btn" aria-label="Menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}>
            <Icon name="menu" />
          </button>
          <Link href="/" className="wordmark" aria-label={`${wordmark}, home`}>
            {wordmark}
          </Link>
          <nav className="nav" aria-label="Shop">
            {PRIMARY_NAV.map((item) => (
              <Link key={item.href} href={item.href} aria-current={current(item.href)}>
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="header__end">
            <nav className="header__links" aria-label="Visit and help">
              {SECONDARY_NAV.map((item) => (
                <Link key={item.href} href={item.href} aria-current={current(item.href)}>
                  {item.label}
                </Link>
              ))}
            </nav>
            <button type="button" className="icon-btn" aria-label="Search" aria-expanded={searchOpen} aria-controls="site-search" onClick={() => setSearchOpen((v) => !v)}>
              <Icon name="search" />
            </button>
            <Link href="/bag" className="icon-btn" aria-label={ready && count ? `Bag, ${count} item${count === 1 ? "" : "s"}` : "Bag"}>
              <Icon name="bag" />
              {ready && count ? (
                <span className="bag-count" aria-hidden="true">
                  {count}
                </span>
              ) : null}
            </Link>
            <Link href="/eye-exam" className="btn btn--accent btn--small header__exam">
              Book an eye exam
            </Link>
          </div>
        </div>
        <nav className="quicklinks" aria-label="Quick links">
          <Link href="/glasses">Glasses</Link>
          <Link href="/sunglasses">Sunglasses</Link>
          <Link href="/contact-lenses">Contact lenses</Link>
          <Link href="/eye-exam" className="is-accent">
            Eye exam
          </Link>
          <Link href="/stores">Stores</Link>
        </nav>
        {searchOpen ? (
          <div className="search-panel" id="site-search">
            <div className="wrap">
              <form role="search" onSubmit={submitSearch}>
                <label htmlFor="site-search-input" className="sr-only">
                  Search frames, sunglasses and lenses
                </label>
                <input id="site-search-input" type="search" placeholder="Search frames, sunglasses, lenses…" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
                <button type="submit" className="btn btn--primary">
                  Search
                </button>
              </form>
            </div>
          </div>
        ) : null}
      </header>
      <Drawer open={menuOpen} onClose={() => setMenuOpen(false)} title="Menu" side="left">
        <nav className="mobile-nav" aria-label="Shop" onClick={(e) => (e.target as HTMLElement).closest("a") && setMenuOpen(false)}>
          {PRIMARY_NAV.map((item) => (
            <Link key={item.href} href={item.href} aria-current={current(item.href)}>
              {item.label}
            </Link>
          ))}
        </nav>
        <nav className="mobile-nav-secondary" aria-label="More" onClick={(e) => (e.target as HTMLElement).closest("a") && setMenuOpen(false)}>
          <Link href="/stores">Stores &amp; hours</Link>
          <Link href="/order">Track an order</Link>
          <Link href="/help">Help</Link>
          <Link href="/contact">Contact us</Link>
          <Link href="/eye-exam" className="btn btn--accent" style={{ marginTop: 12, alignSelf: "flex-start" }}>
            Book an eye exam
          </Link>
        </nav>
      </Drawer>
    </>
  );
}
