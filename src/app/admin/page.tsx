"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Badge, Button, Card, KpiCard, PageHeader, Spinner, StatusPill } from "@/components/ui";
import { useStore } from "@/lib/store";
import { fmtINR, fmtNum, fmtPct } from "@/lib/calc";
import {
  liveAdminOverview,
  liveAdminHiring,
  liveMemberSetStatus,
  type AdminOverviewRow,
  type AdminHiringRow,
} from "@/lib/supabase/aop-data";
import type { AopStatus } from "@/lib/types";

const STATUS_FILTERS: { key: AopStatus | "all" | "pending"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Needs review" },
  { key: "submitted", label: "Submitted" },
  { key: "approved", label: "Approved" },
  { key: "changes_requested", label: "Changes" },
  { key: "draft", label: "Draft" },
  { key: "not_started", label: "Not started" },
];

const growthOf = (r: AdminOverviewRow): number | null => {
  const ly = Number(r.last_year_revenue) || 0;
  if (r.revenue_target == null || ly <= 0) return null; // no target → not filled yet
  const t = Number(r.revenue_target);
  if (!Number.isFinite(t) || t <= 0) return null;
  return ((t - ly) / ly) * 100;
};

export default function AdminPage() {
  const router = useRouter();
  const { currentUser, loadZmContext, hydrating } = useStore();
  const [rows, setRows] = useState<AdminOverviewRow[]>([]);
  const [hiring, setHiring] = useState<AdminHiringRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof STATUS_FILTERS)[number]["key"]>("all");
  const [zmFilter, setZmFilter] = useState<string>("all");
  const [sort, setSort] = useState<{ col: string; dir: "asc" | "desc" }>({ col: "zone", dir: "asc" });
  const [acting, setActing] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [ov, hi] = await Promise.all([liveAdminOverview(), liveAdminHiring()]);
    setRows(ov);
    setHiring(hi);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (currentUser?.role === "ADMIN") void refresh();
  }, [currentUser, refresh]);

  // Redirect to login on logout (AppShell is a child here, so it can't do it).
  useEffect(() => {
    if (!hydrating && !currentUser) router.replace("/login");
  }, [hydrating, currentUser, router]);

  const zmOptions = useMemo(() => {
    const m = new Map<string, string>();
    rows.forEach((r) => m.set(r.zm_email, r.zm_name));
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  // Everything above the table respects the ZONE (ZM) filter, so the totals,
  // hiring summary and approval queue all change when a zone is selected.
  const scopedRows = useMemo(
    () => (zmFilter === "all" ? rows : rows.filter((r) => r.zm_email === zmFilter)),
    [rows, zmFilter],
  );
  const scopedHiring = useMemo(
    () => (zmFilter === "all" ? hiring : hiring.filter((h) => h.zm_email === zmFilter)),
    [hiring, zmFilter],
  );
  const summary = useMemo(() => {
    const zones = new Set(scopedRows.map((r) => r.zm_email));
    const by = (s: AopStatus) => scopedRows.filter((r) => r.member_status === s).length;
    const pending = scopedRows.filter((r) => r.member_status === "submitted" || r.member_status === "in_review").length;
    const revenue = scopedRows.reduce((s, r) => s + (Number(r.revenue_target) || 0), 0);
    const filled = scopedRows.filter((r) => r.is_filled).length;
    const positions = scopedHiring.reduce((s, h) => s + (h.positions || 0), 0);
    const requests = scopedHiring.reduce((s, h) => s + (h.requests || 0), 0);
    return { zones: zones.size, members: scopedRows.length, filled, approved: by("approved"), pending, revenue, positions, requests };
  }, [scopedRows, scopedHiring]);

  const pendingRows = useMemo(
    () => scopedRows.filter((r) => r.member_status === "submitted" || r.member_status === "in_review"),
    [scopedRows],
  );

  const onSort = (col: string) =>
    setSort((s) => ({ col, dir: s.col === col && s.dir === "asc" ? "desc" : "asc" }));

  const visibleRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sortVal = (r: AdminOverviewRow): string | number => {
      switch (sort.col) {
        case "member": return r.member_name.toLowerCase();
        case "role": return r.member_role;
        case "district": return (r.city_district ?? "").toLowerCase();
        case "revenue": return Number(r.revenue_target) || 0;
        case "growth": return growthOf(r) ?? -Infinity;
        case "schools": return Number(r.target_schools) || 0;
        case "status": return r.member_status;
        default: return r.zm_name.toLowerCase();
      }
    };
    return rows
      .filter((r) => {
        if (zmFilter !== "all" && r.zm_email !== zmFilter) return false;
        if (filter === "pending" && !(r.member_status === "submitted" || r.member_status === "in_review")) return false;
        if (filter !== "all" && filter !== "pending" && r.member_status !== filter) return false;
        if (!q) return true;
        return r.member_name.toLowerCase().includes(q) || r.zm_name.toLowerCase().includes(q) || (r.city_district ?? "").toLowerCase().includes(q);
      })
      .sort((a, b) => {
        const av = sortVal(a), bv = sortVal(b);
        const cmp = typeof av === "string" && typeof bv === "string" ? av.localeCompare(bv) : Number(av) - Number(bv);
        return sort.dir === "asc" ? cmp : -cmp;
      });
  }, [rows, query, filter, zmFilter, sort]);

  const act = async (r: AdminOverviewRow, action: "approve" | "reject" | "request_changes") => {
    let comment = "";
    if (action !== "approve") {
      comment = window.prompt(action === "reject" ? "Reason for rejection:" : "What changes are needed?") ?? "";
      if (!comment) return;
    }
    setActing(r.member_email);
    await liveMemberSetStatus(r.member_email, r.zm_email, action, currentUser?.email ?? "", comment);
    await refresh();
    setActing(null);
  };

  const openMember = async (r: AdminOverviewRow) => {
    await loadZmContext(r.zm_email);
    router.push(`/aop/${encodeURIComponent(r.member_email)}`);
  };

  if (!currentUser) return null;
  if (currentUser.role !== "ADMIN") { router.replace("/login"); return null; }

  return (
    <AppShell>
      <PageHeader
        title="Admin Team · Project Health"
        description="Cross-zone visibility of every Zonal Manager's FY26-27 AOP. Review and approve each member plan."
        actions={<Button size="sm" variant="outline" onClick={refresh} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</Button>}
      />

      {loading && rows.length === 0 ? (
        <Card><div className="flex items-center gap-2 p-2 text-[13px] text-gray-500"><Spinner className="text-indigo-600" /> Loading project health…</div></Card>
      ) : (
        <div className="space-y-5">
          {/* Headline KPIs */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <KpiCard label="Zones" value={String(summary.zones)} accent="indigo" sub="active ZMs" />
            <KpiCard label="Members" value={String(summary.members)} accent="violet" sub={`${summary.filled} filled`} />
            <KpiCard label="Needs review" value={String(summary.pending)} accent="amber" sub="submitted plans" />
            <KpiCard label="Approved" value={String(summary.approved)} accent="emerald" sub="member plans" />
            <KpiCard label="Revenue planned" value={fmtINR(summary.revenue)} accent="sky" sub="all zones" />
            <KpiCard label="Hiring" value={String(summary.positions)} accent="slate" sub={`${summary.requests} requests`} />
          </div>

          {/* Approval queue */}
          <Card>
            <h3 className="t-card-heading">Approval queue</h3>
            <p className="t-caption mt-0.5 mb-3">Member plans submitted for the Admin Team to review.</p>
            {pendingRows.length === 0 ? (
              <div className="rounded-lg border border-emerald-100 bg-emerald-50/40 px-4 py-6 text-center text-[13px] text-emerald-700">Nothing awaiting review right now.</div>
            ) : (
              <div className="space-y-2">
                {pendingRows.map((r) => (
                  <div key={r.member_email} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50/50 px-3 py-2.5">
                    <div className="min-w-0 flex flex-wrap items-center gap-1.5">
                      <span className="text-[13px] font-medium text-gray-900">{r.member_name}</span>
                      <Badge tone="slate">{r.member_role}</Badge>
                      <span className="t-caption">· {r.zm_name} · {fmtINR(Number(r.revenue_target) || 0)}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Button size="sm" variant="primary" onClick={() => openMember(r)}>Open</Button>
                      <Button size="sm" variant="success" disabled={acting === r.member_email} onClick={() => act(r, "approve")}>Approve</Button>
                      <Button size="sm" variant="outline" disabled={acting === r.member_email} onClick={() => act(r, "request_changes")}>Changes</Button>
                      <Button size="sm" variant="danger" disabled={acting === r.member_email} onClick={() => act(r, "reject")}>Reject</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Controls: ZM filter + status filter + search */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={zmFilter}
                onChange={(e) => setZmFilter(e.target.value)}
                className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-[13px] outline-none focus:border-indigo-500"
              >
                <option value="all">All zones ({zmOptions.length})</option>
                {zmOptions.map(([email, name]) => <option key={email} value={email}>{name}</option>)}
              </select>
              <div className="flex flex-wrap items-center gap-1 rounded-lg border border-gray-200 bg-white p-1">
                {STATUS_FILTERS.map((f) => (
                  <button key={f.key} onClick={() => setFilter(f.key)}
                    className={`min-h-[30px] rounded-md px-2.5 text-[12px] font-medium ${filter === f.key ? "bg-indigo-600 text-white" : "text-gray-500 hover:text-gray-900"}`}>
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search member, ZM, district…"
              className="h-9 w-56 rounded-lg border border-gray-300 bg-white px-3 text-[13px] outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15" />
          </div>

          {/* One health-check table: ZM → members → plan health */}
          <Card className="!p-0 overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-[12.5px]">
              <thead className="bg-gray-50/80 text-gray-500">
                <tr className="border-b border-gray-200">
                  <th className="t-overline py-2 px-3 font-semibold w-10">#</th>
                  <Th label="Member" col="member" tip="Team member" sort={sort} onSort={onSort} />
                  <Th label="Role" col="role" tip="BDM or BDA" sort={sort} onSort={onSort} />
                  <Th label="Zone" col="zone" tip="Zonal Manager who owns the plan" sort={sort} onSort={onSort} />
                  <Th label="District" col="district" tip="Member's base district" sort={sort} onSort={onSort} />
                  <Th label="Revenue Target" col="revenue" tip="Total revenue planned for FY26-27" sort={sort} onSort={onSort} />
                  <Th label="Growth" col="growth" tip="Revenue target vs last year's actual revenue" sort={sort} onSort={onSort} />
                  <Th label="Target Schools" col="schools" tip="Total schools targeted across categories" sort={sort} onSort={onSort} />
                  <Th label="Status" col="status" tip="Plan status (not started → draft → submitted → approved)" sort={sort} onSort={onSort} />
                  <th className="t-overline py-2 px-3 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r, i) => {
                  const g = growthOf(r);
                  return (
                    <tr key={r.member_email} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/50">
                      <td className="py-2 px-3 tabular-nums text-gray-400">{i + 1}</td>
                      <td className="py-2 px-3 font-medium text-gray-900">{r.member_name}</td>
                      <td className="py-2 px-3"><Badge tone="slate">{r.member_role}</Badge></td>
                      <td className="py-2 px-3 text-gray-700">{r.zm_name}</td>
                      <td className="py-2 px-3 text-gray-600">{r.city_district ?? "—"}</td>
                      <td className="py-2 px-3 tabular-nums text-gray-700">{r.revenue_target != null ? fmtINR(Number(r.revenue_target)) : "—"}</td>
                      <td className={`py-2 px-3 tabular-nums font-medium ${g == null ? "text-gray-400" : g >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{g == null ? "—" : fmtPct(g)}</td>
                      <td className="py-2 px-3 tabular-nums text-gray-700">{r.target_schools != null ? fmtNum(Number(r.target_schools)) : "—"}</td>
                      <td className="py-2 px-3"><StatusPill status={r.member_status} /></td>
                      <td className="py-2 px-3">
                        <div className="flex justify-end gap-1.5">
                          <Button size="sm" variant="primary" onClick={() => openMember(r)}>Open</Button>
                          {(r.member_status === "submitted" || r.member_status === "in_review") && (
                            <Button size="sm" variant="success" disabled={acting === r.member_email} onClick={() => act(r, "approve")}>Approve</Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {visibleRows.length === 0 && (
                  <tr><td colSpan={10} className="px-3 py-6 text-center text-[13px] text-gray-400">No members match these filters.</td></tr>
                )}
              </tbody>
            </table>
          </Card>
        </div>
      )}
    </AppShell>
  );
}

function Th({
  label, col, tip, sort, onSort,
}: {
  label: string; col: string; tip: string;
  sort: { col: string; dir: "asc" | "desc" }; onSort: (col: string) => void;
}) {
  const active = sort.col === col;
  return (
    <th className="t-overline py-2 px-3 font-semibold">
      <button type="button" title={tip} onClick={() => onSort(col)} className="inline-flex items-center gap-1 hover:text-gray-900">
        {label}
        <span className={`text-[9px] ${active ? "text-indigo-500" : "text-gray-300"}`}>{active ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}</span>
      </button>
    </th>
  );
}
