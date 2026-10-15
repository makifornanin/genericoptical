import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { formatInZone } from "@/lib/dates";
import { WEEKDAYS, type WeekHours, type Weekday } from "@/lib/types";

export const SITE_NAV = [
  { href: "/eyewear", label: "Eyewear" },
  { href: "/services", label: "Services" },
  { href: "/about", label: "About" },
  { href: "/faq", label: "FAQ" },
  { href: "/contact", label: "Contact" },
] as const;

const DAY_LABEL: Record<Weekday, string> = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };

function to12h(hm: string) {
  const [h, m] = hm.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const hh = h % 12 || 12;
  return m ? `${hh}:${String(m).padStart(2, "0")}${suffix}` : `${hh}${suffix}`;
}

export function hoursText(d: WeekHours[Weekday]) {
  return d ? `${to12h(d.open)} – ${to12h(d.close)}` : "Closed";
}

/** Open/closed right now in the business time zone, with the next change. */
export function openStatus(hours: WeekHours, timezone: string, now = new Date()) {
  const today = formatInZone(now, timezone, "EEE").toLowerCase() as Weekday;
  const hm = formatInZone(now, timezone, "HH:mm");
  const d = hours[today];
  if (d && hm >= d.open && hm < d.close) return { open: true, label: `Open now · until ${to12h(d.close)}` };
  if (d && hm < d.open) return { open: false, label: `Closed · opens ${to12h(d.open)} today` };
  const idx = WEEKDAYS.indexOf(today);
  for (let i = 1; i <= 7; i++) {
    const day = WEEKDAYS[(idx + i) % 7];
    const next = hours[day];
    if (next) return { open: false, label: `Closed · opens ${i === 1 ? "tomorrow" : DAY_LABEL[day]} ${to12h(next.open)}` };
  }
  return { open: false, label: "Closed" };
}

/** Collapses consecutive days with identical hours: "Mon – Sat 10am – 7pm". */
export function groupedHours(hours: WeekHours) {
  const groups: { from: Weekday; to: Weekday; text: string }[] = [];
  for (const day of WEEKDAYS) {
    const text = hoursText(hours[day]);
    const last = groups[groups.length - 1];
    if (last && last.text === text) last.to = day;
    else groups.push({ from: day, to: day, text });
  }
  const short = (d: Weekday) => DAY_LABEL[d].slice(0, 3);
  return groups.map((g) => ({ days: g.from === g.to ? short(g.from) : `${short(g.from)} – ${short(g.to)}`, text: g.text }));
}

export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-[1200px] px-5 sm:px-8", className)}>{children}</div>;
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-[12px] font-semibold uppercase tracking-[0.14em] text-text-3", className)}>{children}</p>;
}

export function SectionHead({ index, eyebrow, title, body, action }: { index?: string; eyebrow: string; title: ReactNode; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-10 grid gap-6 border-t border-line pt-6 md:grid-cols-[200px_1fr_auto] md:items-start">
      <Eyebrow>
        {index ? <span className="mr-2 font-mono text-text-3/80">{index}</span> : null}
        {eyebrow}
      </Eyebrow>
      <div className="max-w-[640px]">
        <h2 className="font-display text-[30px] font-semibold leading-[1.1] text-text sm:text-[38px]">{title}</h2>
        {body ? <p className="mt-3 text-[16px] leading-relaxed text-text-2">{body}</p> : null}
      </div>
      {action ? <div className="md:pt-2">{action}</div> : null}
    </div>
  );
}

export function PageIntro({ eyebrow, title, body, children }: { eyebrow: string; title: ReactNode; body?: ReactNode; children?: ReactNode }) {
  return (
    <section className="border-b border-line">
      <Container className="py-14 sm:py-20">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="mt-4 max-w-[820px] font-display text-[40px] font-semibold leading-[1.04] text-text sm:text-[56px]">{title}</h1>
        {body ? <p className="mt-5 max-w-[620px] text-[17px] leading-relaxed text-text-2">{body}</p> : null}
        {children ? <div className="mt-8">{children}</div> : null}
      </Container>
    </section>
  );
}

export function siteButton(variant: "brand" | "outline" | "light" | "accent" = "brand", size: "md" | "lg" = "md") {
  return cn(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium transition-[background-color,border-color,filter,color] duration-150 [&_svg]:size-4",
    size === "lg" ? "h-12 px-6 text-[15px]" : "h-10 px-5 text-[14px]",
    variant === "brand" && "bg-brand text-brand-ink hover:brightness-110",
    variant === "accent" && "bg-accent text-accent-ink hover:brightness-95",
    variant === "outline" && "border border-line-strong bg-surface text-text hover:border-text-3",
    variant === "light" && "border border-white/25 text-white hover:bg-white/10",
  );
}

export function SiteLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link href={href} className={cn("underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-text", className)}>
      {children}
    </Link>
  );
}

export function ProductArt({ src, alt, className }: { src: string | null; alt: string; className?: string }) {
  return (
    <div className={cn("relative aspect-[4/3] overflow-hidden rounded-[16px] bg-[#efeee8]", className)}>
      {src ? (
        // Product art is SVG served from /public or an uploaded URL; next/image would add nothing here.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" loading="lazy" />
      ) : (
        <div className="flex h-full items-center justify-center text-[13px] text-text-3">No image</div>
      )}
    </div>
  );
}
