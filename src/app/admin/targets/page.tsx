"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Badge, Button, Card, PageHeader, Segmented, Spinner, StatusPill } from "@/components/ui";
import { fmtINR, fmtNum, fmtPct } from "@/lib/calc";
import { liveAdminTargets, type AdminTargetRow } from "@/lib/supabase/aop-data";
import { useStore } from "@/lib/store";
import type { AopStatus } from "@/lib/types";

type TabKey = "revenue" | "universe" | "collection";
const TABS: { key: TabKey; label: string }[] = [
  { key: "revenue", label: "Revenue" },
  { key: "universe", label: "Universe" },
  { key: "collection", label: "Collection" },
];

const n = (v: unknown): number | null => (v == null || v === "" ? null : Number(v));
const growth = (t: number | null, ly: number | null): number | null =>
  t == null || ly == null || ly <= 0 ? null : ((t - ly) / ly) * 100;

interface Milestone { collectionPct?: number; collectionAmount?: number }
const phasedPct = (r: AdminTargetRow): number | null => {
  const ms = Array.isArray(r.milestones) ? (r.milestones as Milestone[]) : null;
  if (!ms || !ms.length) return null;
  return ms.reduce((s, m) => s + (Number.isFinite(Number(m.collectionPct)) ? Number(m.collectionPct) : 0), 0);
};
const milestoneCount = (r: AdminTargetRow): number => (Array.isArray(r.milestones) ? r.milestones.length : 0);

interface Col {
  key: string;
  label: string;
  tip: string;
  /** numeric value for sorting + heatmap (null = blank) */
  val: (r: AdminTargetRow) => number | string | null;
  render: (r: AdminTargetRow, heat?: string) => ReactNode;
  heat?: boolean; // shade by value range across the column
  align?: "left" | "right";
  sticky?: boolean;
}

const money = (v: number | null) => (v == null ? <span className="text-gray-300">—</span> : fmtINR(v));
const num = (v: number | null) => (v == null ? <span className="text-gray-300">—</span> : fmtNum(v));

function growthCell(t: number | null, ly: number | null): ReactNode {
  const g = growth(t, ly);
  if (g == null) return <span className="text-gray-300">—</span>;
  const tone = g < -5 ? "text-rose-600" : g > 60 ? "text-amber-600" : g >= 0 ? "text-emerald-600" : "text-rose-600";
  const icon = g >= 0 ? "▲" : "▼";
  const alert = g > 60 || g < -5 ? " ⚠" : "";
  return <span className={`font-medium ${tone}`}>{icon} {fmtPct(Math.abs(g))}{alert}</span>;
}

// fraction (0..1) of where v sits in [min,max] → soft indigo background
function heatStyle(v: number | null, min: number, max: number): string {
  if (v == null || !Number.isFinite(v) || max <= min) return "";
  const f = Math.max(0, Math.min(1, (v - min) / (max - min)));
  const a = (0.05 + f * 0.22).toFixed(3);
  return `rgba(79,70,229,${a})`;
}

export default function TargetsPage() {
  const router = useRouter();
  const { currentUser, loadZmContext, hydrating } = useStore();
  const [rows, setRows] = useState<AdminTargetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>("revenue");
  const [zmFilter, setZmFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [filledOnly, setFilledOnly] = useState(false);
  const [sort, setSort] = useState<{ col: string; dir: "asc" | "desc" }>({ col: "member", dir: "asc" });

  const refresh = useCallback(async () => { setLoading(true); setRows(await liveAdminTargets()); setLoading(false); }, []);
  useEffect(() => { if (currentUser?.role === "ADMIN") void refresh(); }, [currentUser, refresh]);
  // Redirect to login on logout (AppShell is a child here, so it can't do it).
  useEffect(() => { if (!hydrating && !currentUser) router.replace("/login"); }, [hydrating, currentUser, router]);

  const zmOptions = useMemo(() => {
    const m = new Map<string, string>();
    rows.forEach((r) => m.set(r.zm_email, r.zm_name));
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  // ---- columns per tab ----
  const columns: Col[] = useMemo(() => {
    const common: Col[] = [
      { key: "member", label: "Member", tip: "Team member", sticky: true, val: (r) => r.member_name.toLowerCase(), render: (r) => <span className="font-medium text-gray-900">{r.member_name}</span> },
      { key: "role", label: "Role", tip: "BDM or BDA", val: (r) => r.member_role, render: (r) => <Badge tone="slate">{r.member_role}</Badge> },
      { key: "zone", label: "Zone", tip: "Zonal Manager", val: (r) => r.zm_name.toLowerCase(), render: (r) => <span className="text-gray-600">{r.zm_name}</span> },
    ];
    const status: Col = { key: "status", label: "Status", tip: "Plan status", val: (r) => r.member_status, render: (r) => <StatusPill status={r.member_status} /> };

    if (tab === "revenue") {
      return [
        ...common,
        { key: "ly", label: "Last Year", tip: "Last-year actual revenue (from order data)", heat: true, align: "right", val: (r) => n(r.last_year_revenue), render: (r) => money(n(r.last_year_revenue)) },
        { key: "target", label: "Total Target", tip: "Total revenue target for FY26-27", heat: true, align: "right", val: (r) => n(r.total_revenue_target), render: (r) => money(n(r.total_revenue_target)) },
        { key: "growth", label: "Growth", tip: "Total target vs last-year revenue", align: "right", val: (r) => growth(n(r.total_revenue_target), n(r.last_year_revenue)) ?? -Infinity, render: (r) => growthCell(n(r.total_revenue_target), n(r.last_year_revenue)) },
        { key: "ey", label: "Early Years", tip: "Early Years books target", align: "right", val: (r) => n(r.early_years_target), render: (r) => money(n(r.early_years_target)) },
        { key: "ms", label: "Math & Sci", tip: "Maths & Science books target", align: "right", val: (r) => n(r.math_science_target), render: (r) => money(n(r.math_science_target)) },
        { key: "ob", label: "Other Books", tip: "Other books target", align: "right", val: (r) => n(r.other_books_target), render: (r) => money(n(r.other_books_target)) },
        { key: "stem", label: "STEM*", tip: "STEM add-on (over & above the total)", align: "right", val: (r) => n(r.stem_target), render: (r) => money(n(r.stem_target)) },
        { key: "panel", label: "Panel*", tip: "Panel add-on (over & above the total)", align: "right", val: (r) => n(r.panel_target), render: (r) => money(n(r.panel_target)) },
        { key: "caov", label: "Current AOV", tip: "Σ valid order value ÷ unique schools (bulk excluded)", align: "right", val: (r) => n(r.current_aov), render: (r) => money(n(r.current_aov)) },
        { key: "taov", label: "Target AOV", tip: "Planned average order value", align: "right", val: (r) => n(r.target_aov), render: (r) => money(n(r.target_aov)) },
        { key: "aovg", label: "AOV Growth", tip: "Target AOV vs current AOV", align: "right", val: (r) => growth(n(r.target_aov), n(r.current_aov)) ?? -Infinity, render: (r) => growthCell(n(r.target_aov), n(r.current_aov)) },
        status,
      ];
    }
    if (tab === "universe") {
      return [
        ...common,
        { key: "total", label: "Total", tip: "Total schools mapped today", align: "right", val: (r) => n(r.total_schools), render: (r) => num(n(r.total_schools)) },
        { key: "active", label: "Active", tip: "Active schools today", align: "right", val: (r) => n(r.active_schools), render: (r) => num(n(r.active_schools)) },
        { key: "user", label: "User", tip: "Schools that have transacted", align: "right", val: (r) => n(r.user_schools), render: (r) => num(n(r.user_schools)) },
        { key: "nonuser", label: "Non-user", tip: "Schools that never ordered", align: "right", val: (r) => n(r.non_user_schools), render: (r) => num(n(r.non_user_schools)) },
        { key: "tschools", label: "Target Schools", tip: "Schools targeted across categories", heat: true, align: "right", val: (r) => n(r.target_schools), render: (r) => num(n(r.target_schools)) },
        { key: "cover", label: "Coverage", tip: "Target schools as a % of active schools today", align: "right", val: (r) => { const t = n(r.target_schools), a = n(r.active_schools); return t != null && a ? (t / a) * 100 : -Infinity; }, render: (r) => { const t = n(r.target_schools), a = n(r.active_schools); if (t == null || !a) return <span className="text-gray-300">—</span>; const p = (t / a) * 100; return <span className={p >= 100 ? "text-emerald-600 font-medium" : "text-gray-700"}>{fmtPct(p)}</span>; } },
        { key: "retc", label: "Retention #", tip: "Schools the member plans to retain", align: "right", val: (r) => n(r.retention_count), render: (r) => num(n(r.retention_count)) },
        { key: "retv", label: "Retention ₹", tip: "Revenue expected from retained schools", heat: true, align: "right", val: (r) => n(r.retention_value), render: (r) => money(n(r.retention_value)) },
        { key: "samp", label: "Sampling", tip: "Schools planned for sampling (all categories)", align: "right", val: (r) => n(r.sampling_schools), render: (r) => num(n(r.sampling_schools)) },
        { key: "conv", label: "Conversion", tip: "Schools planned to convert to orders", align: "right", val: (r) => n(r.conversion_schools), render: (r) => num(n(r.conversion_schools)) },
        status,
      ];
    }
    // collection
    return [
      ...common,
      { key: "collect", label: "To Collect", tip: "Full revenue target to be collected", heat: true, align: "right", val: (r) => n(r.collection_target) ?? n(r.total_revenue_target), render: (r) => money(n(r.collection_target) ?? n(r.total_revenue_target)) },
      { key: "mcount", label: "Milestones", tip: "Number of collection milestone lines added", align: "right", val: (r) => milestoneCount(r), render: (r) => { const c = milestoneCount(r); return c === 0 ? <span className="text-gray-300">—</span> : num(c); } },
      { key: "phased", label: "Phased %", tip: "Sum of milestone collection % — should reach 100%", align: "right", val: (r) => phasedPct(r) ?? -Infinity, render: (r) => { const p = phasedPct(r); if (p == null) return <span className="text-gray-300">—</span>; const tone = Math.round(p) === 100 ? "text-emerald-600" : p > 100 ? "text-rose-600" : "text-amber-600"; const alert = Math.round(p) !== 100 ? " ⚠" : ""; return <span className={`font-medium ${tone}`}>{fmtPct(p)}{alert}</span>; } },
      status,
    ];
  }, [tab]);

  // ---- filter + sort ----
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const col = columns.find((c) => c.key === sort.col) ?? columns[0];
    return rows
      .filter((r) => {
        if (zmFilter !== "all" && r.zm_email !== zmFilter) return false;
        if (filledOnly && !r.is_filled) return false;
        if (!q) return true;
        return r.member_name.toLowerCase().includes(q) || r.zm_name.toLowerCase().includes(q);
      })
      .sort((a, b) => {
        const av = col.val(a), bv = col.val(b);
        const cmp = typeof av === "string" && typeof bv === "string" ? av.localeCompare(bv) : Number(av) - Number(bv);
        return sort.dir === "asc" ? cmp : -cmp;
      });
  }, [rows, columns, sort, zmFilter, query, filledOnly]);

  // heatmap ranges per heat column over the visible rows
  const heatRanges = useMemo(() => {
    const m: Record<string, { min: number; max: number }> = {};
    columns.filter((c) => c.heat).forEach((c) => {
      const vals = visible.map((r) => c.val(r)).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
      if (vals.length) m[c.key] = { min: Math.min(...vals), max: Math.max(...vals) };
    });
    return m;
  }, [columns, visible]);

  const onSort = (key: string) => setSort((s) => ({ col: key, dir: s.col === key && s.dir === "asc" ? "desc" : "asc" }));
  const openMember = async (r: AdminTargetRow) => { await loadZmContext(r.zm_email); router.push(`/aop/${encodeURIComponent(r.member_email)}`); };

  if (!currentUser) return null;
  if (currentUser.role !== "ADMIN") { router.replace("/login"); return null; }

  return (
    <AppShell>
      <PageHeader
        title="Targets"
        description="Every member's filled AOP across Revenue, Universe and Collection — filter, sort and scan with range heatmaps and alerts."
        actions={<Button size="sm" variant="outline" onClick={refresh} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</Button>}
      />

      {/* Tabs + controls */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Segmented options={TABS.map((t) => ({ key: t.key, label: t.label }))} value={tab} onChange={setTab} />
        <div className="flex flex-wrap items-center gap-2">
          <select value={zmFilter} onChange={(e) => setZmFilter(e.target.value)}
            className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-[13px] outline-none focus:border-indigo-500">
            <option value="all">All zones ({zmOptions.length})</option>
            {zmOptions.map(([email, name]) => <option key={email} value={email}>{name}</option>)}
          </select>
          <button onClick={() => setFilledOnly((v) => !v)}
            className={`h-9 rounded-lg border px-3 text-[12px] font-medium ${filledOnly ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-gray-300 bg-white text-gray-500"}`}>
            Filled only
          </button>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search member / ZM…"
            className="h-9 w-48 rounded-lg border border-gray-300 bg-white px-3 text-[13px] outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15" />
        </div>
      </div>

      {loading && rows.length === 0 ? (
        <Card><div className="flex items-center gap-2 p-2 text-[13px] text-gray-500"><Spinner className="text-indigo-600" /> Loading targets…</div></Card>
      ) : (
        <Card className="!p-0 overflow-x-auto">
          <table className="targets-table w-full text-left text-[12.5px]">
            <thead className="bg-gray-50/80 text-gray-500">
              <tr className="border-b border-gray-200">
                <th className="px-3 py-2 t-overline w-9">#</th>
                {columns.map((c) => (
                  <th key={c.key} className={`px-3 py-2 t-overline ${c.align === "right" ? "text-right" : ""} ${c.sticky ? "sticky-c" : ""}`}>
                    <button type="button" title={c.tip} onClick={() => onSort(c.key)}
                      className={`inline-flex items-center gap-1 hover:text-gray-900 ${c.align === "right" ? "flex-row-reverse" : ""}`}>
                      {c.label}
                      <span className={`text-[9px] ${sort.col === c.key ? "text-indigo-500" : "text-gray-300"}`}>{sort.col === c.key ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}</span>
                    </button>
                  </th>
                ))}
                <th className="px-3 py-2 t-overline text-right">Open</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r, i) => (
                <tr key={r.member_email} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/40">
                  <td className="px-3 py-2 tabular-nums text-gray-400">{i + 1}</td>
                  {columns.map((c) => {
                    const heat = c.heat ? heatStyle(typeof c.val(r) === "number" ? (c.val(r) as number) : null, heatRanges[c.key]?.min ?? 0, heatRanges[c.key]?.max ?? 0) : "";
                    return (
                      <td key={c.key} className={`px-3 py-2 tabular-nums ${c.align === "right" ? "text-right" : ""} ${c.sticky ? "sticky-c bg-white" : ""}`}
                        style={heat ? { backgroundColor: heat } : undefined}>
                        {c.render(r)}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-right">
                    <Button size="sm" variant="ghost" onClick={() => openMember(r)}>Open</Button>
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr><td colSpan={columns.length + 2} className="px-3 py-6 text-center text-[13px] text-gray-400">No members match these filters.</td></tr>
              )}
            </tbody>
          </table>
        </Card>
      )}

      <p className="mt-3 text-[11.5px] text-gray-400">
        Shaded cells are range heatmaps (darker = higher within the column). ▲▼ show growth direction; ⚠ flags values needing a look (aggressive growth, off-100% phasing).
      </p>
    </AppShell>
  );
}
