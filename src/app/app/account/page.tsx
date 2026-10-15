import type { Metadata } from "next";
import { Suspense } from "react";
import { CardsSkeleton, PageBody, PageHeader } from "@/components/app/page";
import { Card, CardBody, CardHeader, DetailList } from "@/components/ui/card";
import { ROLE_LABELS } from "@/lib/permissions";
import { requireSession } from "@/server/auth/session";
import { ChangePasswordForm } from "./forms";

export const metadata: Metadata = { title: "Your account" };

async function Content() {
  const session = await requireSession();
  const { user, membership, business } = session;
  return (
    <PageBody>
      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <Card>
          <CardHeader title="Profile" subtitle="Ask an owner to change your name, role or branch." />
          <CardBody>
            <DetailList
              items={[
                { label: "Name", value: user.name },
                { label: "Email", value: user.email },
                { label: "Role", value: ROLE_LABELS[membership.role as keyof typeof ROLE_LABELS] ?? membership.role },
                { label: "Business", value: business.name },
              ]}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Change password" subtitle="Changing it signs you out on every other device." />
          <CardBody>
            <ChangePasswordForm />
          </CardBody>
        </Card>
      </div>
    </PageBody>
  );
}

export default function AccountPage() {
  return (
    <>
      <PageHeader title="Your account" subtitle="Sign-in details for this dashboard." />
      <Suspense fallback={<CardsSkeleton />}>
        <Content />
      </Suspense>
    </>
  );
}
