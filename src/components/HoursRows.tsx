import type { WeeklyHours } from "@/lib/api-types";
import { groupedHours } from "@/lib/format";

/* <li class="oc-hours-row"> rows: "Mon – Sat   10am – 7pm" (consecutive days grouped). */
export function HoursRows({ hours }: { hours: WeeklyHours }) {
  return (
    <>
      {groupedHours(hours).map((g) => (
        <li className="oc-hours-row" key={g.days}>
          <span>{g.days}</span>
          <span className="oc-hours-row__time">{g.time}</span>
        </li>
      ))}
    </>
  );
}
