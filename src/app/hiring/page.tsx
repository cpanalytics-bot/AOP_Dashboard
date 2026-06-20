"use client";

import { useMemo, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { EmployeeProfile } from "@/components/EmployeeProfile";
import { Badge, Button, Card, PageHeader } from "@/components/ui";
import { HiringForm } from "@/components/HiringForm";
import { useStore } from "@/lib/store";
import type { K8HiringRow } from "@/lib/types";

// Map any HR / AOP status string to a Badge tone by keyword.
function statusTone(s: string | null): "slate" | "green" | "amber" | "red" | "blue" {
  const v = (s ?? "").toLowerCase();
  if (!v) return "slate";
  if (/(close|drop|reject|left|abscond|declin|backout|back out)/.test(v)) return "red";
  if (/(join|offer|select|approve|complete|fill|onboard)/.test(v)) return "green";
  if (/(progress|interview|sourc|pending|process|review|screen)/.test(v)) return "amber";
  if (/request/.test(v)) return "blue";
  return "slate";
}

const dash = (v: string | null) =>
  v && v.trim() ? v : <span className="text-gray-300">—</span>;

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
  const { currentUser, k8Hiring, canRaiseHiring, users } = useStore();
  const [showForm, setShowForm] = useState(false);

  const focusUser = focusUserId ? users.find((u) => u.id === focusUserId) : null;

  // The RPC already scopes rows to the signed-in ZM (HR-sync rows by reporting_zm
  // name + their own AOP requests). When focused on one member, narrow AOP rows
  // to that member; HR-sync rows aren't member-keyed, so they stay visible.
  const rows = useMemo(() => {
    if (!focusUserId) return k8Hiring;
    return k8Hiring.filter(
      (r) => r.source !== "AOP" || r.forEmployeeEmail === focusUserId,
    );
  }, [k8Hiring, focusUserId]);

  if (!currentUser) return null;

  return (
    <div>
      {focusUser && <EmployeeProfile userId={focusUser.id} />}

      {/* ---- Summary table (single source: k8_hiring) ---- */}
      <Card className="mb-6 overflow-hidden p-0">
        <div className="flex items-center justify-between px-4 py-3">
          <h3 className="t-card-heading">Hiring summary</h3>
          <span className="t-caption">{rows.length} record(s)</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[12.5px]">
            <thead className="bg-gray-50/80 text-gray-500">
              <tr>
                <th className="px-3 py-2 t-overline w-12">S No.</th>
                <th className="px-3 py-2 t-overline">State</th>
                <th className="px-3 py-2 t-overline">District</th>
                <th className="px-3 py-2 t-overline">Block</th>
                <th className="px-3 py-2 t-overline">Status</th>
                <th className="px-3 py-2 t-overline">HR Status</th>
                <th className="px-3 py-2 t-overline">Expected DOJ</th>
                <th className="px-3 py-2 t-overline">Reason for dropping out</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r: K8HiringRow, i) => (
                <tr key={r.id} className="hover:bg-gray-50/60">
                  <td className="px-3 py-2 tabular-nums align-top text-gray-500">
                    <div>{i + 1}</div>
                    {r.source === "AOP" && (
                      <Badge tone="indigo">{r.aopRef ?? "AOP"}</Badge>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top text-gray-700">{dash(r.state)}</td>
                  <td className="px-3 py-2 align-top text-gray-700">
                    <div>{dash(r.district)}</div>
                    {r.designation && (
                      <div className="t-caption">{r.designation}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top text-gray-700">{dash(r.block)}</td>
                  <td className="px-3 py-2 align-top">
                    {r.status ? (
                      <Badge tone={statusTone(r.status)}>{r.status}</Badge>
                    ) : (
                      dash(null)
                    )}
                  </td>
                  <td className="px-3 py-2 align-top">
                    {r.hrStatus ? (
                      <Badge tone={statusTone(r.hrStatus)}>{r.hrStatus}</Badge>
                    ) : (
                      <span className="text-gray-400">Not initiated</span>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top tabular-nums text-gray-700">
                    {dash(r.expectedDoj)}
                  </td>
                  <td className="px-3 py-2 align-top text-gray-600">
                    {dash(r.reasonForDroppingOut)}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-[13px] text-gray-400">
                    No hiring records yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ---- Hiring & manpower planning (ZM raises a new request) ---- */}
      <PageHeader
        title={focusUser ? `Hiring · ${focusUser.name}` : "Hiring & manpower planning"}
        description="Raise a new manpower requirement. Submitted requests appear in the summary above."
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
    </div>
  );
}
