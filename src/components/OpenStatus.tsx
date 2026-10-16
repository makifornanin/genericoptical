"use client";

import { useSyncExternalStore } from "react";
import type { WeeklyHours } from "@/lib/api-types";
import { openStatus } from "@/lib/format";

/*
 * Live "Open / Closed" badge and line for a branch card, in the business time zone. Pages are
 * cached (ISR), so this is computed in the browser: nothing on the server (the line keeps its
 * height to avoid a layout shift), then the current minute after hydration, refreshed each minute.
 */

function subscribe(onChange: () => void) {
  const id = window.setInterval(onChange, 30_000);
  return () => window.clearInterval(id);
}
const getMinute = () => Math.floor(Date.now() / 60_000);
const getServerMinute = () => null;

export function OpenStatus({ hours, timeZone, name }: { hours: WeeklyHours; timeZone: string; name: string }) {
  const minute = useSyncExternalStore(subscribe, getMinute, getServerMinute);
  const status = minute === null ? null : openStatus(hours, timeZone, new Date(minute * 60_000));
  return (
    <>
      <div className="oc-branch-card__top">
        <h3 className="oc-branch-card__name">{name}</h3>
        {status ? (
          <span className="oc-status" data-open={String(status.open)}>
            {status.open ? "Open" : "Closed"}
          </span>
        ) : null}
      </div>
      <p className="oc-branch-card__status">{status ? status.label : " "}</p>
    </>
  );
}
