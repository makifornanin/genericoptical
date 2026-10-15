import type { MetadataRoute } from "next";

// The public website moved to GoHighLevel (see customer-website-reference/). This deployment serves the
// staff dashboard and integration endpoints only, so nothing here should be indexed.
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", disallow: "/" }] };
}
