"use client";

import { useState } from "react";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/form";
import { saveWebsiteOrdersAction } from "./actions";

/** Settings → Website: whether the customer website can take orders. */
export function WebsiteOrdersCard({ initial, isDemo }: { initial: { enabled: boolean }; isDemo: boolean }) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const save = useAction(saveWebsiteOrdersAction);
  return (
    <Card>
      <CardHeader
        title="Website orders"
        subtitle="Customers order on the website and collect in branch. Orders appear in Orders with a Website badge, already confirmed, with their stock reserved at the chosen branch."
      />
      <CardBody className="flex flex-col gap-3 text-[13px]">
        <Checkbox
          label="Accept orders from the customer website"
          description="When off, the website shows products and prices but asks customers to visit or contact a branch instead of checking out."
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        <p className="rounded-[8px] bg-warn-soft px-3 py-2 text-[12.5px] text-warn">
          No payment provider is connected. &ldquo;Pay online&rdquo; on the website is a simulated card step (demo store): it is recorded as &ldquo;Online card (demo — not charged)&rdquo; and no money moves. &ldquo;Pay at pickup&rdquo; leaves the balance for the branch to collect.
          {isDemo ? null : " Connect a real payment provider before using this with customers."}
        </p>
        <Button variant="primary" className="self-start" loading={save.pending} onClick={() => save.run({ enabled })}>
          Save
        </Button>
      </CardBody>
    </Card>
  );
}
