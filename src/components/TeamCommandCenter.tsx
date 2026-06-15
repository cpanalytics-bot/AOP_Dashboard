"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge, Button, Card, PageHeader, Stat } from "@/components/ui";
import { computeTeamDashboardMetrics, fmtINR } from "@/lib/calc";
import {
  blockNamesForDistricts,
  blocksForDistricts,
  districtNames,
} from "@/lib/master-data";
import { useStore } from "@/lib/store";
import type { Aop, AopStatus, Role, User } from "@/lib/types";

const statusTone: Record<AopStatus, "slate" | "amber" | "blue" | "green" | "red"> = {
  not_started: "slate",
  draft: "amber",
  submitted: "blue",
  in_review: "blue",
  changes_requested: "amber",
  approved: "green",
  rejected: "red",
};

const statusLabel: Record<AopStatus, string> = {
  not_started: "Not started",
  draft: "Draft",
  submitted: "Submitted",
  in_review: "In review",
  changes_requested: "Changes requested",
  approved: "Approved",
  rejected: "Rejected",
};

export function TeamCommandCenter({
  readOnly = false,
  title = "Command center",
  description,
}: {
  readOnly?: boolean;
  title?: string;
  description?: string;
}) {
  const { currentUser, visibleEmployees, subordinates, getAop, hiring, canEditAop } =
    useStore();
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<Role | "ALL">("ALL");
  const [statusFilter, setStatusFilter] = useState<AopStatus | "ALL">("ALL");

  const team = useMemo(() => {
    let list = visibleEmployees().filter((u) => u.role !== "ADMIN");
    if (currentUser?.role === "ZDM") {
      list = [currentUser, ...subordinates(currentUser.id)];
    }
    if (roleFilter !== "ALL") list = list.filter((e) => e.role === roleFilter);
    if (statusFilter !== "ALL") {
      list = list.filter((e) => getAop(e.id).status === statusFilter);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.employeeCode.toLowerCase().includes(q) ||
          districtNames(e.districtIds).toLowerCase().includes(q),
      );
    }
    return list.sort((a, b) => {
      const order: Record<Role, number> = { ZDM: 0, BDM: 1, BDA: 2, ADMIN: 3 };
      const d = order[a.role] - order[b.role];
      return d !== 0 ? d : a.name.localeCompare(b.name);
    });
  }, [visibleEmployees, subordinates, currentUser, roleFilter, statusFilter, query, getAop]);

  const metrics = useMemo(
    () =>
      computeTeamDashboardMetrics(
        currentUser ? subordinates(currentUser.id) : [],
        getAop,
        hiring,
      ),
    [currentUser, subordinates, getAop, hiring],
  );

  if (!currentUser) return null;

  return (
    <div>
      <PageHeader title={title} description={description} />

      <div className="sticky top-[57px] z-10 -mx-4 mb-6 border-b border-gray-200 bg-[var(--background)]/95 px-4 py-4 backdrop-blur sm:top-[57px]">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <Stat label="Team members" value={String(metrics.totalTeamMembers)} sub={`${metrics.totalBdms} BDM · ${metrics.totalBdas} BDA`} />
          <Stat label="AOP completed" value={String(metrics.aopCompleted)} tone="green" />
          <Stat label="AOP pending" value={String(metrics.aopPending)} tone="amber" />
          <Stat label="Completion" value={`${metrics.completionPct}%`} />
          <Stat label="Revenue planned" value={fmtINR(metrics.totalRevenuePlanned)} />
          <Stat label="Schools planned" value={String(metrics.totalSchoolsPlanned)} />
          <Stat label="Hiring planned" value={String(metrics.totalHiringPlanned)} sub="positions" />
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, code, district…"
          className="h-10 min-w-[200px] flex-1 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15"
        />
        <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1">
          {(["ALL", "BDM", "BDA"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className={`rounded-md px-3 py-1.5 text-[13px] font-medium ${
                roleFilter === r ? "bg-indigo-600 text-white" : "text-gray-500 hover:text-gray-900"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as AopStatus | "ALL")}
          className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm"
        >
          <option value="ALL">All statuses</option>
          {Object.entries(statusLabel).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      <Card className="!p-0 overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-[13px]">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50/80">
              <th className="px-3 py-3 t-overline w-10">#</th>
              <th className="px-3 py-3 t-overline">Name</th>
              <th className="px-3 py-3 t-overline">Code</th>
              <th className="px-3 py-3 t-overline">Designation</th>
              <th className="px-3 py-3 t-overline">Base</th>
              <th className="px-3 py-3 t-overline">Districts</th>
              <th className="px-3 py-3 t-overline">Blocks</th>
              <th className="px-3 py-3 t-overline">AOP status</th>
              <th className="px-3 py-3 t-overline">Updated</th>
              <th className="px-3 py-3 t-overline">Action</th>
            </tr>
          </thead>
          <tbody>
            {team.map((emp, i) => (
              <TeamRow
                key={emp.id}
                serial={i + 1}
                emp={emp}
                readOnly={readOnly}
                canEdit={canEditAop(emp.id)}
                getAop={getAop}
              />
            ))}
          </tbody>
        </table>
        {team.length === 0 && (
          <div className="p-8 text-center t-caption">No team members match your filters.</div>
        )}
      </Card>
    </div>
  );
}

function TeamRow({
  serial,
  emp,
  readOnly,
  canEdit,
  getAop,
}: {
  serial: number;
  emp: User;
  readOnly: boolean;
  canEdit: boolean;
  getAop: (id: string) => Aop;
}) {
  const aop = getAop(emp.id);
  const blocks = blocksForDistricts(emp.districtIds);
  const isRollup = aop.isRollup;

  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50/50">
      <td className="px-3 py-3 tabular-nums text-gray-400">{serial}</td>
      <td className="px-3 py-3 font-medium text-gray-900">
        {emp.name}
        {isRollup && <span className="ml-1.5"><Badge tone="indigo">Roll-up</Badge></span>}
      </td>
      <td className="px-3 py-3 text-gray-600">{emp.employeeCode}</td>
      <td className="px-3 py-3">
        <Badge tone="slate">{emp.role}</Badge>
      </td>
      <td className="px-3 py-3 text-gray-600">{emp.baseLocation}</td>
      <td className="px-3 py-3 max-w-[140px] truncate text-gray-600" title={districtNames(emp.districtIds)}>
        {districtNames(emp.districtIds) || "—"}
      </td>
      <td className="px-3 py-3 max-w-[140px] truncate text-gray-600" title={blockNamesForDistricts(emp.districtIds)}>
        {blocks.length} ({blockNamesForDistricts(emp.districtIds) || "—"})
      </td>
      <td className="px-3 py-3">
        <Badge tone={statusTone[aop.status]}>{statusLabel[aop.status]}</Badge>
      </td>
      <td className="px-3 py-3 text-gray-500 whitespace-nowrap">
        {new Date(aop.updatedAt).toLocaleDateString()}
      </td>
      <td className="px-3 py-3">
        <div className="flex gap-1.5">
          <Link href={`/aop/${emp.id}`}>
            <Button size="sm" variant={canEdit && !readOnly ? "primary" : "outline"}>
              {isRollup ? "View roll-up" : canEdit && !readOnly ? "Edit" : "View"}
            </Button>
          </Link>
          <Link href={`/hiring?user=${emp.id}`}>
            <Button size="sm" variant="ghost">Hiring</Button>
          </Link>
        </div>
      </td>
    </tr>
  );
}
