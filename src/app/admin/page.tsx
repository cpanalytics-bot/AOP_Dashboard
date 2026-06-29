"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Badge, Button, Card, KpiCard, PageHeader, Spinner, StatusPill } from "@/components/ui";
import { useStore } from "@/lib/store";
import { fmtINR, fmtINRShort, fmtNum, fmtPct } from "@/lib/calc";
import {
  liveAdminOverview,
  liveAdminHiring,
  liveMemberSetStatus,
  type AdminOverviewRow,
  type AdminHiringRow,
} from "@/lib/supabase/aop-data";
import { statusRank, type AopStatus } from "@/lib/types";

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
  const [queueOpen, setQueueOpen] = useState(false); // Approval queue collapsed by default
  const [actionMenuFor, setActionMenuFor] = useState<string | null>(null); // open Action dropdown (by member_email)

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
    return {
      zones: zones.size, members: scopedRows.length, filled, revenue, positions, requests, pending,
      // Plan-status funnel — exhaustive, so these add up to `members`.
      notStarted: by("not_started"), draft: by("draft"), submitted: pending,
      changes: by("changes_requested"), approved: by("approved"), rejected: by("rejected"),
    };
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
        case "lyRevenue": return Number(r.last_year_revenue) || 0;
        case "revenue": return Number(r.revenue_target) || 0;
        case "growth": return growthOf(r) ?? -Infinity;
        case "lyTargetSchools": return Number(r.total_schools) || 0;
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
        // Primary: submitted/in-review on top, draft/not-started at the bottom.
        const rank = statusRank(a.member_status) - statusRank(b.member_status);
        if (rank !== 0) return rank;
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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KpiCard label="Zones" value={String(summary.zones)} accent="indigo" sub="active ZMs"
              tip="Number of Zonal Managers (zones) currently in view. Each ZM owns the AOP plans for their team. Use the zone filter below to scope everything to one ZM." />
            <KpiCard label="Members" value={String(summary.members)} accent="violet" sub="BDM + BDA total"
              tip="Total team members (BDMs + BDAs) across all zones expected to file an AOP. The Plan-status cards below break this down — Not started + Draft + Submitted + Changes requested + Approved + Rejected add up to this number." />
            <KpiCard label="Revenue planned" value={fmtINR(summary.revenue)} accent="sky" sub="all zones"
              tip="Sum of every member's Total Revenue Target for FY26-27, across all plans that have a target entered (draft or submitted)." />
            <KpiCard label="Hiring" value={String(summary.positions)} accent="slate"
              sub={`${summary.positions} position${summary.positions === 1 ? "" : "s"} · ${summary.requests} AOP request${summary.requests === 1 ? "" : "s"}`}
              tip="Hiring positions requested through AOP plans only (raised by ZMs inside the platform). This is NOT the full recruitment pipeline — the Hiring tab also shows HR-synced requisitions." />
          </div>

          {/* Plan-status funnel — every member sits in exactly one of these */}
          <div>
            <p className="mb-2 t-overline text-gray-400">Plan status · adds up to {summary.members} members</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <KpiCard label="Not started" value={String(summary.notStarted)} accent="slate" sub="no plan yet"
                tip="Members who haven't opened or started their AOP at all (status: Not started)." />
              <KpiCard label="Draft" value={String(summary.draft)} accent="amber" sub="in progress"
                tip="Plans the member is still filling in — not yet submitted for review (status: Draft)." />
              <KpiCard label="Submitted" value={String(summary.submitted)} accent="indigo" sub="awaiting review"
                tip="Plans submitted by the member and waiting for you to review — this is exactly the Approval queue below (status: Submitted / In review)." />
              <KpiCard label="Changes requested" value={String(summary.changes)} accent="violet" sub="sent back"
                tip="Plans you sent back to the member to revise. They edit and re-submit (status: Changes requested)." />
              <KpiCard label="Approved" value={String(summary.approved)} accent="emerald" sub="signed off"
                tip="Plans you reviewed and approved — locked in for FY26-27 (status: Approved)." />
              <KpiCard label="Rejected" value={String(summary.rejected)} accent="rose" sub="declined"
                tip="Plans you rejected/declined (status: Rejected)." />
            </div>
          </div>

          {/* Approval queue — collapsed by default; admin expands to review */}
          <Card>
            <button
              type="button"
              onClick={() => setQueueOpen((o) => !o)}
              className="flex w-full items-center justify-between gap-2 text-left"
              aria-expanded={queueOpen}
            >
              <span className="flex items-center gap-2">
                <h3 className="t-card-heading">Approval queue</h3>
                {pendingRows.length > 0 && (
                  <Badge tone="indigo">{pendingRows.length} pending</Badge>
                )}
              </span>
              <span className="flex h-6 w-6 items-center justify-center rounded-md border border-gray-200 text-gray-500" aria-hidden>
                {queueOpen ? "−" : "+"}
              </span>
            </button>
            {queueOpen && (
              <div className="mt-3">
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

          {/* One health-check table: ZM → members → plan health.
              Sticky header (top-0) + frozen first-4 columns (#, Member, Role, Zone)
              live inside this scroll box (overflow-auto + max-height). table-fixed +
              colgroup keep column widths exact so the sticky left offsets line up. */}
          <Card className="!p-0 overflow-auto max-h-[70vh]">
            <table className="w-full min-w-[1290px] table-fixed border-collapse text-left text-[12.5px]">
              <colgroup>
                <col style={{ width: 40 }} />
                <col style={{ width: 150 }} />
                <col style={{ width: 64 }} />
                <col style={{ width: 120 }} />
                <col style={{ width: 100 }} />
                <col style={{ width: 92 }} />
                <col style={{ width: 100 }} />
                <col style={{ width: 78 }} />
                <col style={{ width: 96 }} />
                <col style={{ width: 96 }} />
                <col style={{ width: 96 }} />
                <col style={{ width: 110 }} />
                <col style={{ width: 148 }} />
              </colgroup>
              <thead className="text-gray-500">
                <tr className="divide-x divide-gray-100 border-b border-gray-200">
                  <th className="t-overline py-2 px-2.5 font-semibold align-bottom sticky top-0 left-0 z-30 bg-gray-50">#</th>
                  <Th label="Member" col="member" tip="Team member" sort={sort} onSort={onSort} thClass="left-10 z-30" />
                  <Th label="Role" col="role" tip="BDM or BDA" sort={sort} onSort={onSort} thClass="left-[190px] z-30" />
                  <Th label="Zone" col="zone" tip="Zonal Manager who owns the plan" sort={sort} onSort={onSort} thClass="left-[254px] z-30 shadow-[6px_0_6px_-4px_rgba(15,23,42,0.14)]" />
                  <Th label="District" col="district" tip="Member's base district" sort={sort} onSort={onSort} />
                  <Th label="LY Revenue" col="lyRevenue" tip="Last year's actual revenue" sort={sort} onSort={onSort} />
                  <Th label="Revenue Target" col="revenue" tip="Total revenue planned for FY26-27" sort={sort} onSort={onSort} />
                  <Th label="Growth" col="growth" tip="Revenue target vs last year's actual revenue" sort={sort} onSort={onSort} />
                  <Th label="LY Target School" col="lyTargetSchools" tip="Total schools in the member's universe (last-year base)" sort={sort} onSort={onSort} />
                  <Th label="Target Schools" col="schools" tip="Total schools targeted across categories" sort={sort} onSort={onSort} />
                  <Th label="Status" col="status" tip="Plan status (not started → draft → submitted → approved)" sort={sort} onSort={onSort} />
                  <th className="t-overline py-2 px-2.5 font-semibold align-bottom sticky top-0 z-20 bg-gray-50">Reimbursement Budget</th>
                  <th className="t-overline py-2 px-2.5 font-semibold text-right align-bottom sticky top-0 right-0 z-30 bg-gray-50 shadow-[-6px_0_6px_-4px_rgba(15,23,42,0.14)]">Action</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r, i) => {
                  const g = growthOf(r);
                  const frozen = "sticky z-10 bg-white group-hover:bg-gray-50";
                  return (
                    <tr key={r.member_email} className="group divide-x divide-gray-100 border-b border-gray-100 last:border-0 hover:bg-gray-50">
                      <td className={`py-1.5 px-2.5 tabular-nums text-gray-400 left-0 ${frozen}`}>{i + 1}</td>
                      <td className={`py-1.5 px-2.5 font-medium text-gray-900 left-10 ${frozen}`}><span className="block truncate" title={r.member_name}>{r.member_name}</span></td>
                      <td className={`py-1.5 px-2.5 left-[190px] ${frozen}`}><Badge tone="slate">{r.member_role}</Badge></td>
                      <td className={`py-1.5 px-2.5 text-gray-700 left-[254px] shadow-[6px_0_6px_-4px_rgba(15,23,42,0.10)] ${frozen}`}><span className="block truncate" title={r.zm_name}>{r.zm_name}</span></td>
                      <td className="py-1.5 px-2.5 text-gray-600"><span className="block truncate" title={r.city_district ?? undefined}>{r.city_district ?? "—"}</span></td>
                      <td className="py-1.5 px-2.5 tabular-nums text-gray-700">{r.last_year_revenue != null ? fmtINRShort(Number(r.last_year_revenue)) : "—"}</td>
                      <td className="py-1.5 px-2.5 tabular-nums text-gray-700">{r.revenue_target != null ? fmtINRShort(Number(r.revenue_target)) : "—"}</td>
                      <td className={`py-1.5 px-2.5 tabular-nums font-medium ${g == null ? "text-gray-400" : g >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{g == null ? "—" : fmtPct(g)}</td>
                      <td className="py-1.5 px-2.5 tabular-nums text-gray-700">{r.total_schools != null ? fmtNum(Number(r.total_schools)) : "—"}</td>
                      <td className="py-1.5 px-2.5 tabular-nums text-gray-700">{r.target_schools != null ? fmtNum(Number(r.target_schools)) : "—"}</td>
                      <td className="py-1.5 px-2.5"><StatusPill status={r.member_status} /></td>
                      <td className="py-1.5 px-2.5 tabular-nums text-gray-700">{r.reimbursement_budget != null ? fmtINRShort(Number(r.reimbursement_budget)) : "—"}</td>
                      <td className={`py-1.5 px-2.5 right-0 shadow-[-6px_0_6px_-4px_rgba(15,23,42,0.10)] ${frozen}`}>
                        <ActionMenu
                          row={r}
                          acting={acting === r.member_email}
                          open={actionMenuFor === r.member_email}
                          onToggle={() => setActionMenuFor((cur) => (cur === r.member_email ? null : r.member_email))}
                          onClose={() => setActionMenuFor(null)}
                          onApprove={() => act(r, "approve")}
                          onOpen={() => openMember(r)}
                          onRevert={() => act(r, "request_changes")}
                        />
                      </td>
                    </tr>
                  );
                })}
                {visibleRows.length === 0 && (
                  <tr><td colSpan={13} className="px-3 py-6 text-center text-[13px] text-gray-400">No members match these filters.</td></tr>
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
  label, col, tip, sort, onSort, thClass = "",
}: {
  label: string; col: string; tip: string;
  sort: { col: string; dir: "asc" | "desc" }; onSort: (col: string) => void;
  // Extra classes — used to make the frozen columns (Member/Role/Zone) sticky-left.
  thClass?: string;
}) {
  const active = sort.col === col;
  return (
    <th className={`t-overline py-2 px-2.5 font-semibold align-bottom sticky top-0 z-20 bg-gray-50 ${thClass}`}>
      <button type="button" title={tip} onClick={() => onSort(col)} className="inline-flex items-start gap-1 text-left leading-tight hover:text-gray-900">
        {label}
        <span className={`text-[9px] ${active ? "text-indigo-500" : "text-gray-300"}`}>{active ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}</span>
      </button>
    </th>
  );
}

// Split action: primary "Approve" + a caret dropdown with Open / Revert.
// "Revert" sends the plan back to the ZM (request_changes) — same as the old
// "Changes" button. Approve/Revert are only meaningful once a plan is submitted.
function ActionMenu({
  row, acting, open, onToggle, onClose, onApprove, onOpen, onRevert,
}: {
  row: AdminOverviewRow;
  acting: boolean; open: boolean;
  onToggle: () => void; onClose: () => void;
  onApprove: () => void; onOpen: () => void; onRevert: () => void;
}) {
  const isPending = row.member_status === "submitted" || row.member_status === "in_review";
  const canRevert = isPending || row.member_status === "approved";
  const item = "block w-full px-3 py-1.5 text-left text-[13px] text-gray-700 hover:bg-gray-50 disabled:text-gray-300 disabled:hover:bg-white";
  const caretRef = useRef<HTMLButtonElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  // The table scrolls inside an overflow box, which would clip an absolutely
  // positioned menu — so render it fixed (via a portal) anchored to the caret.
  const toggle = () => {
    if (!open) {
      const rect = caretRef.current?.getBoundingClientRect();
      if (rect) setCoords({ top: rect.bottom + 4, left: rect.right - 128 }); // 128 = w-32
    }
    onToggle();
  };
  return (
    <div className="flex justify-end">
      <div className="inline-flex items-center">
        <Button size="sm" variant="success" className="rounded-r-none"
          disabled={acting || !isPending} onClick={onApprove}>Approve</Button>
        <button ref={caretRef} type="button" onClick={toggle} disabled={acting} aria-haspopup="menu" aria-expanded={open}
          className="inline-flex h-8 items-center rounded-lg rounded-l-none border border-l-0 border-emerald-600 bg-emerald-600 px-1.5 text-white hover:bg-emerald-700 disabled:opacity-50">
          <span className="text-[10px]">▾</span>
        </button>
      </div>
      {open && coords && typeof document !== "undefined" && createPortal(
        <>
          <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden />
          <div style={{ position: "fixed", top: coords.top, left: coords.left }}
            className="z-50 w-32 rounded-lg border border-gray-200 bg-white py-1 shadow-lg" role="menu">
            <button type="button" className={item} onClick={() => { onClose(); onOpen(); }}>Open</button>
            <button type="button" className={item} disabled={!canRevert} onClick={() => { onClose(); onRevert(); }}>Revert</button>
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}
