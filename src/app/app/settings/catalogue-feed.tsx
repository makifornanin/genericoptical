"use client";

import { Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Checkbox, TextareaField } from "@/components/ui/form";
import { saveCatalogueFeedAction } from "./actions";

/** Settings → Website: the anonymous catalogue feed used by an externally hosted website (GoHighLevel). */
export function CatalogueFeedCard({ initial, baseUrl }: { initial: { enabled: boolean; origins: string[] }; baseUrl: string }) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [origins, setOrigins] = useState(initial.origins.join("\n"));
  const save = useAction(saveCatalogueFeedAction);
  const urls = [`${baseUrl}/site`, `${baseUrl}/products`, `${baseUrl}/products/<product-slug>`];
  return (
    <Card>
      <CardHeader
        title="Public catalogue feed"
        subtitle="For a website hosted outside this dashboard (e.g. GoHighLevel custom code). Shares only what's already public: published products with coarse availability (never exact stock or costs), branches, hours and services. No key needed; off until you switch it on."
      />
      <CardBody className="flex flex-col gap-4 text-[13px]">
        <Checkbox label="Publish the catalogue feed" description="Browsers on the origins below may read it; anyone can read public product data from the URL." checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        <TextareaField
          label="Website origins allowed to read it from a browser"
          value={origins}
          onChange={(e) => setOrigins(e.target.value)}
          rows={3}
          hint="One per line, e.g. https://www.your-optical.com (your GHL site's domain). This limits which sites can embed it; it isn't a password."
          error={save.fe("origins") ?? save.fe("origins.0")}
        />
        {enabled ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-[12px] text-text-3">Feed URLs (set as the website&apos;s feed base in global.js)</span>
            {urls.map((u) => (
              <div key={u} className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-[8px] bg-surface-2 px-2 py-1.5 font-mono text-[12px]">{u}</code>
                <Button size="icon-sm" variant="ghost" aria-label={`Copy ${u}`} onClick={() => navigator.clipboard.writeText(u).then(() => toast.success("Copied"))}>
                  <Copy />
                </Button>
              </div>
            ))}
          </div>
        ) : null}
        <Button
          variant="primary"
          className="self-start"
          loading={save.pending}
          onClick={() => save.run({ enabled, origins: origins.split(/\s+/).map((o) => o.trim()).filter(Boolean) })}
        >
          Save feed settings
        </Button>
      </CardBody>
    </Card>
  );
}
