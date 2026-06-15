"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { Badge, Button, Card, PageHeader, Stat } from "@/components/ui";
import { useStore } from "@/lib/store";
import { computeTeamDashboardMetrics, fmtINR } from "@/lib/calc";
import { blocksForDistricts, districtById, districts, zones } from "@/lib/master-data";

export default function AdminPage() {
  const router = useRouter();
  const { currentUser, users, getAop, hiring, auditLogs } = useStore();
  const [query, setQuery] = useState("");
  const [zoneFilter, setZoneFilter] = useState<string>("ALL");

  const fieldUsers = useMemo(
    () => users.filter((u) => u.role !== "ADMIN"),
    [users],
  );

  const filtered = useMemo(() => {
    let list = fieldUsers;
    if (zoneFilter !== "ALL") list = list.filter((u) => u.zoneId === zoneFilter);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        (u) =>
          u.name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          u.employeeCode.toLowerCase().includes(q),
      );
    }
    return list;
  }, [fieldUsers, zoneFilter, query]);

  const orgMetrics = useMemo(
    () => computeTeamDashboardMetrics(fieldUsers, getAop, hiring),
    [fieldUsers, getAop, hiring],
  );

  const zoneSummaries = useMemo(() => {
    return zones.map((z) => {
      const members = fieldUsers.filter((u) => u.zoneId === z.id);
      const aops = members.map((u) => getAop(u.id));
      const revenue = aops.reduce((s, a) => s + a.revenue.totalRevenueTarget, 0);
      const approved = aops.filter((a) => a.status === "approved").length;
      return { zone: z, members: members.length, revenue, approved };
    });
  }, [fieldUsers, getAop]);

  const stateSummaries = useMemo(() => {
    const map = new Map<string, { count: number; blocks: number }>();
    for (const u of fieldUsers) {
      for (const did of u.districtIds) {
        const d = districtById(did);
        if (!d) continue;
        const cur = map.get(d.state) ?? { count: 0, blocks: 0 };
        cur.count += 1;
        cur.blocks += blocksForDistricts([did]).length;
        map.set(d.state, cur);
      }
    }
    return [...map.entries()].map(([state, v]) => ({ state, ...v }));
  }, [fieldUsers]);

  if (!currentUser) return null;
  if (currentUser.role !== "ADMIN") {
    router.replace("/login");
    return null;
  }

  const exportCsv = () => {
    const headers = ["Name", "Code", "Role", "Email", "Base", "Districts", "AOP Status", "Revenue Target"];
    const rows = filtered.map((u) => {
      const a = getAop(u.id);
      return [
        u.name,
        u.employeeCode,
        u.role,
        u.email,
        u.baseLocation,
        u.districtIds.map((id) => districtById(id)?.name).join("; "),
        a.status,
        String(a.revenue.totalRevenueTarget),
      ];
    });
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "aop-org-export.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppShell>
      <PageHeader
        title="Super Admin"
        description="Organization-wide planning, coverage, and completion status."
        actions={
          <Button size="sm" variant="outline" onClick={exportCsv}>
            Export CSV
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5">
        <Stat label="Team members" value={String(orgMetrics.totalTeamMembers)} />
        <Stat label="AOP completed" value={String(orgMetrics.aopCompleted)} tone="green" />
        <Stat label="Completion %" value={`${orgMetrics.completionPct}%`} />
        <Stat label="Revenue planned" value={fmtINR(orgMetrics.totalRevenuePlanned)} />
        <Stat label="Hiring planned" value={String(orgMetrics.totalHiringPlanned)} />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Global search…"
          className="h-10 min-w-[200px] flex-1 rounded-lg border border-gray-300 bg-white px-3 text-sm"
        />
        <select
          value={zoneFilter}
          onChange={(e) => setZoneFilter(e.target.value)}
          className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm"
        >
          <option value="ALL">All zones</option>
          {zones.map((z) => (
            <option key={z.id} value={z.id}>{z.name}</option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Organization summary">
          <ul className="space-y-2 text-[13px] text-gray-700">
            <li>Total employees: {fieldUsers.length}</li>
            <li>BDMs: {fieldUsers.filter((u) => u.role === "BDM").length}</li>
            <li>BDAs: {fieldUsers.filter((u) => u.role === "BDA").length}</li>
            <li>ZDMs: {fieldUsers.filter((u) => u.role === "ZDM").length}</li>
            <li>Hiring requests: {hiring.length}</li>
          </ul>
        </Section>

        <Section title="Zone summary">
          {zoneSummaries.map(({ zone, members, revenue, approved }) => (
            <div key={zone.id} className="mb-2 flex justify-between text-[13px]">
              <span>{zone.name}</span>
              <span className="text-gray-500">{members} people · {fmtINR(revenue)} · {approved} approved</span>
            </div>
          ))}
        </Section>

        <Section title="State summary">
          {stateSummaries.map(({ state, count, blocks }) => (
            <div key={state} className="mb-2 flex justify-between text-[13px]">
              <span>{state}</span>
              <span className="text-gray-500">{count} assignments · {blocks} blocks</span>
            </div>
          ))}
        </Section>

        <Section title="Revenue planning summary">
          <p className="text-[13px] text-gray-700">
            Org-wide planned revenue: {fmtINR(orgMetrics.totalRevenuePlanned)}
          </p>
          <p className="mt-1 text-[13px] text-gray-500">
            Schools planned: {orgMetrics.totalSchoolsPlanned}
          </p>
        </Section>

        <Section title="Hiring planning summary">
          <p className="text-[13px] text-gray-700">
            Total positions planned: {orgMetrics.totalHiringPlanned}
          </p>
          <p className="mt-1 text-[13px] text-gray-500">
            Open requests: {hiring.filter((h) => h.status === "Requested").length}
          </p>
        </Section>

        <Section title="Coverage planning summary">
          <p className="text-[13px] text-gray-700">
            Districts in master: {districts.length}
          </p>
          <p className="mt-1 text-[13px] text-gray-500">
            Total block mappings: {blocksForDistricts(districts.map((d) => d.id)).length}
          </p>
        </Section>
      </div>

      <Card className="mt-6 !p-0 overflow-x-auto">
        <div className="border-b border-gray-100 px-4 py-3">
          <h3 className="t-card-heading">Team summary</h3>
        </div>
        <table className="w-full min-w-[800px] text-left text-[13px]">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50/80">
              <th className="px-3 py-2 t-overline">Name</th>
              <th className="px-3 py-2 t-overline">Role</th>
              <th className="px-3 py-2 t-overline">Zone</th>
              <th className="px-3 py-2 t-overline">Status</th>
              <th className="px-3 py-2 t-overline">Target</th>
              <th className="px-3 py-2 t-overline">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => {
              const a = getAop(u.id);
              const z = zones.find((x) => x.id === u.zoneId);
              return (
                <tr key={u.id} className="border-b border-gray-100">
                  <td className="px-3 py-2 font-medium">{u.name}</td>
                  <td className="px-3 py-2"><Badge tone="slate">{u.role}</Badge></td>
                  <td className="px-3 py-2 text-gray-600">{z?.name ?? "—"}</td>
                  <td className="px-3 py-2">{a.status}</td>
                  <td className="px-3 py-2">{fmtINR(a.revenue.totalRevenueTarget)}</td>
                  <td className="px-3 py-2">
                    <Link href={`/aop/${u.id}`} className="text-indigo-600 hover:underline">View</Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <Card className="mt-6">
        <h3 className="t-card-heading mb-3">Audit log (recent)</h3>
        {auditLogs.length === 0 ? (
          <p className="t-caption">No audit events yet.</p>
        ) : (
          <div className="max-h-48 space-y-2 overflow-y-auto">
            {auditLogs.slice(0, 20).map((log) => (
              <div key={log.id} className="rounded border border-gray-100 px-3 py-2 text-[12px] text-gray-600">
                <span className="font-medium text-gray-800">{log.action}</span> on {log.tableName} ·{" "}
                {new Date(log.createdAt).toLocaleString()}
              </div>
            ))}
          </div>
        )}
      </Card>
    </AppShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <h3 className="t-card-heading mb-3">{title}</h3>
      {children}
    </Card>
  );
}
