"use client";

import { use } from "react";
import { AppShell } from "@/components/AppShell";
import { Wizard } from "@/components/wizard/Wizard";

export default function AopPage({
  params,
}: {
  params: Promise<{ employeeId: string }>;
}) {
  const { employeeId } = use(params);
  return (
    <AppShell>
      <Wizard employeeId={employeeId} />
    </AppShell>
  );
}
