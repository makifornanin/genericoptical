import "server-only";
import type { Metadata } from "next";
import { getSite } from "./api";
import { noindexForced } from "./env";

/** Search engines are kept out when SITE_NOINDEX=1 or the dashboard marks the business as a demo. */
export async function shouldNoindex(): Promise<boolean> {
  if (noindexForced()) return true;
  const site = await getSite();
  return site.ok && site.data.business.isDemo;
}

/**
 * Per-page metadata. The root layout's title template turns "Eyewear" into "Eyewear · {business}".
 */
export function pageMetadata({ title, description, path, noindex = false }: { title: string; description: string; path: string; noindex?: boolean }): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title, description, url: path },
    ...(noindex ? { robots: { index: false, follow: false } } : {}),
  };
}
