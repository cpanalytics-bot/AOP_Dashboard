"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ProgressBar,
  StatusPill,
} from "@/components/ui";
import {
  computeAopCompletion,
  computeAopKpis,
  computeTeamDashboardMetrics,
  computeUniverseKpis,
  fmtINR,
  fmtNum,
} from "@/lib/calc";
import { districtNames } from "@/lib/master-data";
import { useStore } from "@/lib/store";
import type { Aop, AopStatus, Role, User } from "@/lib/types";

// Status visuals are centralised in `aopStatusMeta` (ui.tsx).

function relativeTime(iso: string): string {
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  if (Number.isNaN(diff)) return "";
  const m = Math.round(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

const FILTER_KEY = "aop-tcc-filters-v1";

function loadFilters(): { view: "action" | "all"; role: Role | "ALL"; query: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(FILTER_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function TeamCommandCenter({
  readOnly = false,
  title = "Command center",
  description,
}: {
  readOnly?: boolean;
  title?: string;
  description?: string;
}) {
  const {
    currentUser,
    visibleEmployees,
    subordinates,
    getAop,
    hiring,
    canEditAop,
    canApproveAop,
    recordApproval,
    auditLogs,
  } = useStore();

  const persisted = loadFilters();
  const [query, setQuery] = useState(persisted?.query ?? "");
  const [roleFilter, setRoleFilter] = useState<Role | "ALL">(persisted?.role ?? "ALL");
  const [view, setView] = useState<"action" | "all">(persisted?.view ?? "action");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Persist filters
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        FILTER_KEY,
        JSON.stringify({ view, role: roleFilter, query }),
      );
    } catch {
      /* ignore */
    }
  }, [view, roleFilter, query]);

  const teamMembers = useMemo(() => {
    let list = visibleEmployees().filter((u) => u.role !== "ADMIN");
    if (currentUser?.role === "ZDM") {
      list = subordinates(currentUser.id);
    }
    if (roleFilter !== "ALL") list = list.filter((e) => e.role === roleFilter);
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
  }, [visibleEmployees, subordinates, currentUser, roleFilter, query]);

  const metrics = useMemo(
    () =>
      computeTeamDashboardMetrics(
        currentUser ? subordinates(currentUser.id) : [],
        getAop,
        hiring,
      ),
    [currentUser, subordinates, getAop, hiring],
  );

  // Streak — approvals this calendar week (Mon-Sun) by the current user
  const approvalsThisWeek = useMemo(() => {
    if (!currentUser) return 0;
    const now = new Date();
    const startOfWeek = new Date(now);
    const day = (now.getDay() + 6) % 7; // Monday = 0
    startOfWeek.setDate(now.getDate() - day);
    startOfWeek.setHours(0, 0, 0, 0);
    return auditLogs.filter((l) => {
      if (l.changedBy !== currentUser.id) return false;
      if (l.tableName !== "aop_master") return false;
      if (new Date(l.createdAt) < startOfWeek) return false;
      const diff = l.diff as Record<string, unknown>;
      return diff.status === "approved";
    }).length;
  }, [auditLogs, currentUser]);

  const enriched = useMemo(
    () =>
      teamMembers.map((emp) => {
        const aop = getAop(emp.id);
        const { pct } = computeAopCompletion(aop);
        const kpi = computeAopKpis(aop);
        const ly = aop.revenue.lastYearRevenue;
        const t = aop.revenue.totalRevenueTarget;
        const atRisk = !!ly && !!t && (((t - ly) / ly) * 100 > 60 || ((t - ly) / ly) * 100 < -5);
        return { emp, aop, pct, kpi, atRisk };
      }),
    [teamMembers, getAop],
  );

  const awaitingApproval = enriched.filter(
    (r) => r.aop.status === "submitted" || r.aop.status === "in_review",
  );
  const notStarted = enriched.filter((r) => r.aop.status === "not_started");
  const changesRequested = enriched.filter((r) => r.aop.status === "changes_requested");
  const atRisk = enriched.filter((r) => r.atRisk);

  // Drafts are the ZM's own in-progress work, not an exception that needs a
  // nudge — they surface in "All team" and the AOP Details table, not here.
  const actionCount =
    awaitingApproval.length + notStarted.length + changesRequested.length + atRisk.length;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  // Roster rows after view filter
  const visibleRows = enriched.filter((r) => {
    if (view === "all") return true;
    return (
      ["submitted", "in_review", "not_started", "changes_requested"].includes(r.aop.status) ||
      r.atRisk
    );
  });

  // ----- Selection helpers -----
  const selectableIds = visibleRows
    .filter((r) => canApproveAop(r.emp.id))
    .map((r) => r.emp.id);

  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(selectableIds));
    }
  };

  const toggleRow = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const bulkApprove = () => {
    selected.forEach((id) => {
      const aop = getAop(id);
      if (aop.status === "submitted" || aop.status === "in_review") {
        recordApproval(id, "approve", "Bulk approved");
      }
    });
    setSelected(new Set());
  };

  const bulkRequestChanges = () => {
    selected.forEach((id) => {
      const aop = getAop(id);
      if (aop.status === "submitted" || aop.status === "in_review") {
        recordApproval(id, "request_changes", "Bulk request: please review");
      }
    });
    setSelected(new Set());
  };

  // ----- CSV export -----
  const downloadCsv = () => {
    const headers = [
      "Name",
      "Employee code",
      "Role",
      "Base",
      "Districts",
      "AOP status",
      "Completion %",
      "Revenue target",
      "Last updated",
    ];
    const rows = enriched.map((r) => [
      r.emp.name,
      r.emp.employeeCode,
      r.emp.role,
      r.emp.baseLocation,
      districtNames(r.emp.districtIds),
      r.aop.status,
      `${r.pct}%`,
      String(r.aop.revenue.totalRevenueTarget),
      r.aop.updatedAt,
    ]);
    const csv = [headers, ...rows]
      .map((row) =>
        row
          .map((cell) => {
            const s = String(cell ?? "");
            return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
          })
          .join(","),
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aop-roster-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!currentUser) return null;

  return (
    <div>
      {/* Hero — greeting + action summary */}
      <div className="mb-5 rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="t-overline text-indigo-600">{title}</p>
            <h1 className="t-display mt-1">
              {greeting}, {currentUser.name.split(" ")[0]}.
            </h1>
            <p className="t-body mt-1.5">
              {actionCount > 0
                ? `${actionCount} ${actionCount === 1 ? "thing needs" : "things need"} your attention today.`
                : "You're all caught up. No pending actions."}
            </p>
            {description && <p className="mt-1 text-[12px] text-gray-400">{description}</p>}
            {approvalsThisWeek > 0 && (
              <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[12px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
                <span aria-hidden>★</span>
                {approvalsThisWeek} plan{approvalsThisWeek === 1 ? "" : "s"} approved this week
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <ProgressRing pct={metrics.completionPct} />
            <div>
              <p className="t-overline">Zone completion</p>
              <p className="text-xl font-semibold tracking-tight text-gray-900">
                {metrics.completionPct}%
              </p>
              <p className="t-caption">
                {metrics.aopCompleted}/{metrics.totalTeamMembers} plans approved
              </p>
            </div>
          </div>
        </div>

        {/* Action inbox */}
        {actionCount > 0 ? (
          <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {awaitingApproval.length > 0 && (
              <ActionRow
                tone="blue"
                icon="●"
                title={`${awaitingApproval.length} plan${awaitingApproval.length === 1 ? "" : "s"} waiting for approval`}
                sub={awaitingApproval.slice(0, 2).map((r) => r.emp.name.split(" ")[0]).join(", ") + (awaitingApproval.length > 2 ? "…" : "")}
                action="Review"
                href={`/aop/${encodeURIComponent(awaitingApproval[0].emp.id)}`}
              />
            )}
            {changesRequested.length > 0 && (
              <ActionRow
                tone="amber"
                icon="⟳"
                title={`${changesRequested.length} plan${changesRequested.length === 1 ? "" : "s"} need changes`}
                sub="Awaiting team revision"
                action="Open"
                href={`/aop/${encodeURIComponent(changesRequested[0].emp.id)}`}
              />
            )}
            {notStarted.length > 0 && (
              <ActionRow
                tone="slate"
                icon="○"
                title={`${notStarted.length} team member${notStarted.length === 1 ? "" : "s"} haven't started`}
                sub={notStarted.slice(0, 2).map((r) => r.emp.name.split(" ")[0]).join(", ") + (notStarted.length > 2 ? "…" : "")}
                action="Nudge"
                href={`/aop/${encodeURIComponent(notStarted[0].emp.id)}`}
              />
            )}
            {atRisk.length > 0 && (
              <ActionRow
                tone="red"
                icon="▲"
                title={`${atRisk.length} plan${atRisk.length === 1 ? "" : "s"} at risk`}
                sub="Aggressive growth or revenue regression"
                action="Inspect"
                href={`/aop/${encodeURIComponent(atRisk[0].emp.id)}`}
              />
            )}
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50/40 p-4">
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-emerald-100 text-emerald-600">✓</span>
              <div>
                <p className="text-[13px] font-semibold text-emerald-800">All clear.</p>
                <p className="t-caption">Every team member has actioned their AOP. Press <span className="font-mono">⌘K</span> to jump to any plan.</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Context strip — quiet rollup numbers */}
      <div className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <ContextStat label="Revenue plan" value={fmtINR(metrics.totalRevenuePlanned)} />
        <ContextStat label="Schools" value={fmtNum(metrics.totalSchoolsPlanned || 0)} />
        <ContextStat label="Hiring" value={`${metrics.totalHiringPlanned}`} sub="positions" />
        <ContextStat label="Team" value={`${metrics.totalBdms} + ${metrics.totalBdas}`} sub="BDM + BDA" />
      </div>

      {/* Roster controls */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1">
          <ViewTab active={view === "action"} onClick={() => setView("action")}>
            Needs action <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 text-[11px] font-semibold text-amber-700">{actionCount}</span>
          </ViewTab>
          <ViewTab active={view === "all"} onClick={() => setView("all")}>
            All team <span className="ml-1.5 rounded-full bg-gray-100 px-1.5 text-[11px] font-semibold text-gray-600">{teamMembers.length}</span>
          </ViewTab>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="h-9 w-44 rounded-lg border border-gray-300 bg-white px-3 text-[13px] outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15"
          />
          <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1">
            {(["ALL", "BDM", "BDA"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRoleFilter(r)}
                className={`min-h-[32px] rounded-md px-2.5 text-[12px] font-medium ${
                  roleFilter === r ? "bg-indigo-600 text-white" : "text-gray-500 hover:text-gray-900"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={downloadCsv}>Export</Button>
        </div>
      </div>

      {/* Bulk action toolbar */}
      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3.5 py-2">
          <span className="text-[13px] font-medium text-indigo-800">
            {selected.size} selected
          </span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="success" onClick={bulkApprove}>Approve all</Button>
            <Button size="sm" variant="outline" onClick={bulkRequestChanges}>Request changes</Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
          </div>
        </div>
      )}

      {/* Action table — team roster (where the ZM takes action) */}
      <Card className="!p-0 overflow-x-auto">
        {visibleRows.length === 0 ? (
          view === "action" && actionCount === 0 ? (
            <EmptyState
              icon="✓"
              title="Inbox zero"
              description="No team member needs your attention right now. Switch to All team to see everyone."
              action={<Button size="sm" variant="outline" onClick={() => setView("all")}>Show all team</Button>}
            />
          ) : (
            <EmptyState
              icon="?"
              title="No matches"
              description="Try a different search or role filter."
              action={<Button size="sm" variant="outline" onClick={() => { setQuery(""); setRoleFilter("ALL"); }}>Clear filters</Button>}
            />
          )
        ) : (
          <table className="roster-table w-full min-w-[760px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/80">
                <th className="sticky-col w-10 px-3 py-2.5">
                  {selectableIds.length > 0 && (
                    <input
                      type="checkbox"
                      aria-label="Select all approvable rows"
                      checked={allSelected}
                      onChange={toggleAll}
                      className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                  )}
                </th>
                <th className="sticky-col px-3 py-2.5 t-overline" style={{ left: 40 }}>Member</th>
                <th className="px-3 py-2.5 t-overline">Districts</th>
                <th className="px-3 py-2.5 t-overline">Progress</th>
                <th className="px-3 py-2.5 t-overline">Status</th>
                <th className="px-3 py-2.5 t-overline">Updated</th>
                <th className="px-3 py-2.5 t-overline text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((r) => (
                <TeamRow
                  key={r.emp.id}
                  emp={r.emp}
                  aop={r.aop}
                  pct={r.pct}
                  atRisk={r.atRisk}
                  readOnly={readOnly}
                  canEdit={canEditAop(r.emp.id)}
                  canApprove={canApproveAop(r.emp.id)}
                  selected={selected.has(r.emp.id)}
                  onToggleSelect={toggleRow}
                />
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* AOP Details Table — consolidated line items per member (below the action table) */}
      <Card className="mt-4">
        <h3 className="mb-3 text-[14px] font-semibold text-gray-900">AOP Details by Member</h3>
        <p className="t-caption mb-3">Consolidated view of all AOP values filled by each team member. Revenue, schools, and hiring roll up as zone totals.</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-[12.5px]">
            <thead className="bg-gray-50/80 text-gray-500">
              <tr className="border-b border-gray-200">
                <th className="t-overline py-2 px-2 font-semibold">Employee</th>
                <th className="t-overline py-2 px-2 font-semibold">Revenue Target</th>
                <th className="t-overline py-2 px-2 font-semibold">Target AOV</th>
                <th className="t-overline py-2 px-2 font-semibold">Target Schools</th>
                <th className="t-overline py-2 px-2 font-semibold">Retention</th>
                <th className="t-overline py-2 px-2 font-semibold">Sampling</th>
                <th className="t-overline py-2 px-2 font-semibold">Conversion</th>
                <th className="t-overline py-2 px-2 font-semibold">Collection %</th>
                <th className="t-overline py-2 px-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {enriched.map((r) => {
                const uni = computeUniverseKpis(r.aop.universe);
                return (
                  <tr key={r.emp.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/50">
                    <td className="py-2 px-2 font-medium text-gray-900">
                      <Link href={`/aop/${encodeURIComponent(r.emp.id)}`} className="hover:text-indigo-600">{r.emp.name}</Link>
                    </td>
                    <td className="py-2 px-2 tabular-nums text-gray-700">{fmtINR(r.aop.revenue.totalRevenueTarget)}</td>
                    <td className="py-2 px-2 tabular-nums text-gray-700">{fmtINR(r.aop.revenue.targetAov)}</td>
                    <td className="py-2 px-2 tabular-nums text-gray-700">{fmtNum(uni.targetTotalFromCategories)}</td>
                    <td className="py-2 px-2 tabular-nums text-gray-700">{fmtNum(r.aop.universe.retentionSchoolCount ?? 0)}</td>
                    <td className="py-2 px-2 tabular-nums text-gray-700">{fmtNum(uni.totalSamplingFromCategories)}</td>
                    <td className="py-2 px-2 tabular-nums text-gray-700">{fmtNum(uni.totalConversionFromCategories)}</td>
                    <td className="py-2 px-2 tabular-nums text-gray-700">{r.aop.collection.collectionPercent}%</td>
                    <td className="py-2 px-2"><StatusPill status={r.aop.status} /></td>
                  </tr>
                );
              })}
              {enriched.length > 0 && (
                <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
                  <td className="py-2 px-2 text-gray-900">Zone Total</td>
                  <td className="py-2 px-2 tabular-nums text-gray-900">{fmtINR(metrics.totalRevenuePlanned)}</td>
                  <td className="py-2 px-2 text-gray-400">—</td>
                  <td className="py-2 px-2 tabular-nums text-gray-900">{fmtNum(metrics.totalSchoolsPlanned)}</td>
                  <td className="py-2 px-2 tabular-nums text-gray-900">{fmtNum(enriched.reduce((s, r) => s + (r.aop.universe.retentionSchoolCount ?? 0), 0))}</td>
                  <td className="py-2 px-2 tabular-nums text-gray-900">{fmtNum(enriched.reduce((s, r) => s + computeUniverseKpis(r.aop.universe).totalSamplingFromCategories, 0))}</td>
                  <td className="py-2 px-2 tabular-nums text-gray-900">{fmtNum(enriched.reduce((s, r) => s + computeUniverseKpis(r.aop.universe).totalConversionFromCategories, 0))}</td>
                  <td className="py-2 px-2 text-gray-400">—</td>
                  <td className="py-2 px-2 text-gray-400">—</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function ProgressRing({ pct }: { pct: number }) {
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;
  return (
    <svg width={56} height={56} viewBox="0 0 56 56" className="shrink-0" role="img" aria-label={`Zone completion ${pct}%`}>
      <circle cx={28} cy={28} r={radius} stroke="#E5E7EB" strokeWidth={5} fill="none" />
      <circle
        cx={28}
        cy={28}
        r={radius}
        stroke="#4F46E5"
        strokeWidth={5}
        fill="none"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 28 28)"
        style={{ transition: "stroke-dashoffset 600ms ease" }}
      />
    </svg>
  );
}

function ContextStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <div className="t-overline">{label}</div>
      <div className="mt-1 text-base font-semibold tracking-tight text-gray-900">{value}</div>
      {sub && <div className="t-caption mt-0.5">{sub}</div>}
    </div>
  );
}

function ActionRow({
  tone,
  icon,
  title,
  sub,
  action,
  href,
}: {
  tone: "blue" | "amber" | "slate" | "red";
  icon: string;
  title: string;
  sub: string;
  action: string;
  href: string;
}) {
  const dot: Record<typeof tone, string> = {
    blue: "text-sky-500",
    amber: "text-amber-500",
    slate: "text-gray-400",
    red: "text-rose-500",
  };
  return (
    <Link
      href={href}
      className="group flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-3 transition hover:border-indigo-300 hover:bg-indigo-50/40"
    >
      <div className="flex min-w-0 items-start gap-2.5">
        <span className={`text-base leading-5 ${dot[tone]}`}>{icon}</span>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-gray-900">{title}</p>
          <p className="t-caption truncate">{sub}</p>
        </div>
      </div>
      <span className="shrink-0 text-[12px] font-semibold text-indigo-600 group-hover:underline">
        {action} →
      </span>
    </Link>
  );
}

function ViewTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex min-h-[32px] items-center rounded-md px-3 text-[13px] font-medium transition ${
        active ? "bg-indigo-600 text-white" : "text-gray-600 hover:text-gray-900"
      }`}
    >
      {children}
    </button>
  );
}

function TeamRow({
  emp,
  aop,
  pct,
  atRisk,
  readOnly,
  canEdit,
  canApprove,
  selected,
  onToggleSelect,
}: {
  emp: User;
  aop: Aop;
  pct: number;
  atRisk: boolean;
  readOnly: boolean;
  canEdit: boolean;
  canApprove: boolean;
  selected: boolean;
  onToggleSelect: (id: string) => void;
}) {
  const isRollup = aop.isRollup;
  const initials = emp.name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const ringTone: "indigo" | "green" | "amber" | "red" =
    aop.status === "approved" ? "green" : pct >= 70 ? "indigo" : pct >= 30 ? "amber" : "red";

  const selectable = canApprove;

  return (
    <tr className={`sticky-bg border-b border-gray-100 transition hover:bg-indigo-50/30 ${selected ? "bg-indigo-50/40" : ""}`}>
      <td className="sticky-col w-10 px-3 py-3 align-middle">
        {selectable && (
          <input
            type="checkbox"
            aria-label={`Select ${emp.name}`}
            checked={selected}
            onChange={() => onToggleSelect(emp.id)}
            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
        )}
      </td>
      <td className="sticky-col px-3 py-3" style={{ left: 40 }}>
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-indigo-100 text-[11px] font-semibold text-indigo-700">
            {initials}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="truncate font-medium text-gray-900">{emp.name}</span>
              <Badge tone="slate">{emp.role}</Badge>
              {isRollup && <Badge tone="indigo">Roll-up</Badge>}
              {atRisk && <Badge tone="red" ariaLabel="At risk">⚠</Badge>}
            </div>
            <div className="t-caption truncate">{emp.employeeCode} · {emp.baseLocation}</div>
          </div>
        </div>
      </td>
      <td className="px-3 py-3 max-w-[160px] truncate text-gray-600" title={districtNames(emp.districtIds)}>
        {districtNames(emp.districtIds) || "—"}
      </td>
      <td className="px-3 py-3">
        <div className="flex items-center gap-2">
          <ProgressBar pct={pct} tone={ringTone} />
          <span className="w-9 shrink-0 text-right text-[12px] font-medium text-gray-700 tabular-nums">{pct}%</span>
        </div>
      </td>
      <td className="px-3 py-3">
        <StatusPill status={aop.status} />
      </td>
      <td className="px-3 py-3 whitespace-nowrap text-gray-500" title={new Date(aop.updatedAt).toLocaleString()}>
        {relativeTime(aop.updatedAt)}
      </td>
      <td className="px-3 py-3 text-right">
        <div className="flex justify-end gap-1.5">
          <Link href={`/aop/${encodeURIComponent(emp.id)}`}>
            <Button size="sm" variant={canEdit && !readOnly ? "primary" : "outline"}>
              {isRollup ? "View" : canEdit && !readOnly ? "Open" : "View"}
            </Button>
          </Link>
        </div>
      </td>
    </tr>
  );
}
