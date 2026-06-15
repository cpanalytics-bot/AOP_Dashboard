"use client";

import { useMemo, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { EmployeeProfile } from "@/components/EmployeeProfile";
import { Badge, Button, Card, PageHeader, Select } from "@/components/ui";
import { HiringForm } from "@/components/HiringForm";
import { useStore } from "@/lib/store";
import { districtNames } from "@/lib/master-data";
import { fmtINR } from "@/lib/calc";
import type { HiringStatus } from "@/lib/types";

const STATUSES: HiringStatus[] = ["Requested", "Approved", "In Progress", "Closed"];
const statusTone: Record<HiringStatus, "amber" | "green" | "blue" | "slate"> = {
  Requested: "amber",
  Approved: "green",
  "In Progress": "blue",
  Closed: "slate",
};

export default function HiringPage() {
  return (
    <AppShell>
      <Suspense>
        <HiringContent />
      </Suspense>
    </AppShell>
  );
}

function HiringContent() {
  const searchParams = useSearchParams();
  const focusUserId = searchParams.get("user");
  const { currentUser, hiring, canRaiseHiring, canManageHiringStatus, updateHiringStatus, subordinates, users } =
    useStore();
  const [showForm, setShowForm] = useState(false);

  const focusUser = focusUserId ? users.find((u) => u.id === focusUserId) : null;

  const visible = useMemo(() => {
    if (!currentUser) return [];
    if (focusUserId) {
      return hiring.filter((h) => h.forUserId === focusUserId);
    }
    if (currentUser.role === "BDA") {
      return hiring.filter((h) => h.forUserId === currentUser.id);
    }
    if (currentUser.role === "ADMIN") return hiring;
    const subIds = new Set(subordinates(currentUser.id).map((u) => u.id));
    return hiring.filter((h) => h.forUserId && subIds.has(h.forUserId));
  }, [hiring, currentUser, subordinates, focusUserId]);

  if (!currentUser) return null;

  const requesterName = (id: string) => users.find((u) => u.id === id)?.name ?? "-";
  const forUserName = (id: string | null) =>
    id ? users.find((u) => u.id === id)?.name ?? "-" : "-";

  return (
    <div>
      {focusUser && <EmployeeProfile userId={focusUser.id} />}

      <PageHeader
        title={focusUser ? `Hiring · ${focusUser.name}` : "Hiring & manpower planning"}
        description={`${visible.length} request(s) in your view.`}
        actions={
          canRaiseHiring() && (
            <Button size="sm" onClick={() => setShowForm(!showForm)}>
              {showForm ? "Close" : "+ Add hiring request"}
            </Button>
          )
        }
      />

      {showForm && canRaiseHiring() && (
        <div className="mb-5">
          <HiringForm
            onDone={() => setShowForm(false)}
            forUserId={focusUserId}
            defaultDistrictIds={focusUser?.districtIds ?? []}
            defaultBaseLocation={focusUser?.baseLocation ?? ""}
          />
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {visible.length === 0 && (
          <Card><p className="t-body">No hiring requests yet.</p></Card>
        )}
        {visible.map((h) => (
          <Card key={h.id}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">
                  {h.numberOfPositions} × {h.designation}
                </h3>
                <div className="t-caption mt-0.5">
                  For {forUserName(h.forUserId)} · {districtNames(h.districtIds)}
                </div>
              </div>
              <Badge tone={statusTone[h.status]}>{h.status}</Badge>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2.5">
              <Info label="Reason" value={h.reason} />
              <Info label="Priority" value={h.priority} />
              <Info label="Timeline" value={h.hiringTimeline} />
              <Info label="Revenue impact" value={fmtINR(h.expectedRevenueImpact)} />
              <Info label="Raised by" value={requesterName(h.requestedByUserId)} />
            </div>
            <p className="mt-3 text-[13px] text-gray-600">{h.businessJustification}</p>
            {canManageHiringStatus() && (
              <div className="mt-4">
                <span className="t-overline mb-1.5 block">Update status</span>
                <Select
                  value={h.status}
                  onChange={(e) => updateHiringStatus(h.id, e.target.value as HiringStatus)}
                >
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </Select>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="t-overline">{label}</dt>
      <dd className="mt-0.5 text-[13px] text-gray-700">{value}</dd>
    </div>
  );
}
