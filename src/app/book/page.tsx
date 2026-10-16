import "@/styles/pages/booking.css";
import type { Metadata } from "next";
import { ApiState } from "@/components/ApiState";
import { Booking } from "@/components/Booking";
import { PageIntro } from "@/components/SectionHead";
import { getSite } from "@/lib/api";
import { findBranch, findService } from "@/lib/catalog";
import { pageMetadata } from "@/lib/seo";

// Rendered per request so deep links (?branch=…&service=…) arrive with the right calendar in the
// HTML; the API data itself is cached for 60 s.
export const metadata: Metadata = pageMetadata({
  title: "Book an appointment",
  description: "Book an eye examination, contact lens consultation or eyewear consultation online.",
  path: "/book",
});

function first(v: string | string[] | undefined): string | null {
  return (Array.isArray(v) ? v[0] : v) ?? null;
}

export default async function BookPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const result = await getSite();

  return (
    <>
      <PageIntro eyebrow="Online booking" title="Book an appointment.">
        Choose a branch and a service, then pick a time in the calendar. It takes about a minute.
      </PageIntro>
      <section>
        {result.ok ? (
          <Booking
            branches={result.data.branches}
            services={result.data.services}
            widgetBase={result.data.booking.widgetBase}
            initialBranchId={findBranch(result.data.branches, first(params.branch))?.id ?? null}
            initialServiceId={findService(result.data.services, first(params.service))?.id ?? null}
            businessPhone={result.data.business.phone}
            fmt={{ currency: result.data.business.currency, locale: result.data.business.locale }}
          />
        ) : (
          <ApiState reason={result.reason === "not_found" ? "unavailable" : result.reason} what="Online booking" />
        )}
      </section>
    </>
  );
}
