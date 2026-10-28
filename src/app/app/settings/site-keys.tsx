"use client";

import { Copy, KeyRound, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmDialog, DialogContent, DialogRoot, DialogTrigger } from "@/components/ui/dialog";
import { TextField } from "@/components/ui/form";
import { Pill } from "@/components/ui/pill";
import { Table, TableWrap, TD, TH, THead, TR } from "@/components/ui/table";
import { createSiteKeyAction, revokeSiteKeyAction } from "./actions";

export type SiteKeyRow = { id: string; name: string; prefix: string; scopes: string[]; createdAt: string; lastUsedAt: string | null; revokedAt: string | null };

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "Never");

function CopyRow({ label, value, secret }: { label: string; value: string; secret?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[12px] text-text-3">{label}</span>
      <div className="flex items-center gap-2">
        <code className={`min-w-0 flex-1 rounded-[8px] bg-surface-2 px-2 py-1.5 font-mono text-[12px] ${secret ? "break-all" : "truncate"}`}>{value}</code>
        <Button size="icon-sm" variant="ghost" aria-label={`Copy ${label}`} onClick={() => navigator.clipboard.writeText(value).then(() => toast.success("Copied"))}>
          <Copy />
        </Button>
      </div>
    </div>
  );
}

function CreateKeyDialog({ apiUrl }: { apiUrl: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("Customer website");
  const [created, setCreated] = useState<{ key: string; prefix: string } | null>(null);
  const act = useAction(createSiteKeyAction, { onSuccess: (r) => setCreated({ key: r.key, prefix: r.prefix }) });
  const close = (o: boolean) => {
    setOpen(o);
    if (!o) {
      setCreated(null);
      setName("Customer website");
      act.reset();
    }
  };
  return (
    <DialogRoot open={open} onOpenChange={close}>
      <DialogTrigger asChild>
        <Button variant="secondary">
          <Plus /> New key
        </Button>
      </DialogTrigger>
      <DialogContent
        size="sm"
        title={created ? "Copy the key now" : "New website API key"}
        description={
          created
            ? "This is the only time the key is shown. Only a hash is stored, so a lost key can't be recovered; revoke it and create another."
            : "Lets the customer website read published products, branches and services, send inquiries, and place and look up website orders. It can't see costs, exact stock, staff, or any customer record."
        }
        footer={
          created ? (
            <Button variant="primary" onClick={() => close(false)}>Done</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => close(false)}>Cancel</Button>
              <Button variant="primary" loading={act.pending} disabled={!name.trim()} onClick={() => act.run(name)}>
                Create key
              </Button>
            </>
          )
        }
      >
        {created ? (
          <div className="flex flex-col gap-4 text-[13px] text-text-2">
            <CopyRow label="DASHBOARD_SITE_KEY" value={created.key} secret />
            <CopyRow label="DASHBOARD_API_URL" value={apiUrl} />
            <p className="-mt-2 text-[12px] text-text-3">This dashboard&apos;s address; the website adds /api/public/v1 itself.</p>
            <p>
              Paste both into the <strong>website</strong> project in Vercel (Settings → Environment Variables), mark the key as sensitive, then redeploy the website. Don&apos;t send the key by chat or email.
            </p>
          </div>
        ) : (
          <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} error={act.fe("form") ?? act.error ?? undefined} hint="For your reference, e.g. “Customer website (staging)”." />
        )}
      </DialogContent>
    </DialogRoot>
  );
}

export function SiteKeysCard({ keys, apiUrl }: { keys: SiteKeyRow[]; apiUrl: string }) {
  const revoke = useAction(revokeSiteKeyAction);
  const active = keys.filter((k) => !k.revokedAt);
  return (
    <Card>
      <CardHeader
        title="Website API keys"
        subtitle={active.length ? `${active.length} active key(s). The customer website uses a key to load this business's published catalogue.` : "No active key: the customer website can't load products until you create one."}
        actions={<CreateKeyDialog apiUrl={apiUrl} />}
      />
      {keys.length ? (
        <TableWrap>
          <Table>
            <THead>
              <TH>Name</TH>
              <TH>Key</TH>
              <TH>Last used</TH>
              <TH>Status</TH>
              <TH align="right"><span className="sr-only">Actions</span></TH>
            </THead>
            <tbody>
              {keys.map((k) => (
                <TR key={k.id}>
                  <TD className="font-medium">{k.name}</TD>
                  <TD><code className="font-mono text-[12px]">{k.prefix}…</code></TD>
                  <TD className="text-text-2">{when(k.lastUsedAt)}</TD>
                  <TD>{k.revokedAt ? <Pill>Revoked</Pill> : <Pill tone="positive" dot>Active</Pill>}</TD>
                  <TD align="right">
                    {k.revokedAt ? null : (
                      <ConfirmDialog
                        trigger={<Button size="sm" variant="ghost">Revoke</Button>}
                        title={`Revoke “${k.name}”?`}
                        description="Any website using this key stops loading products and sending inquiries immediately."
                        confirmLabel="Revoke key"
                        onConfirm={async () => (await revoke.run(k.id)).ok}
                      />
                    )}
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      ) : (
        <CardBody className="flex items-center gap-2 text-[13.5px] text-text-2">
          <KeyRound className="size-4 text-text-3" aria-hidden="true" /> Create a key, then add it to the website&apos;s environment variables.
        </CardBody>
      )}
    </Card>
  );
}
