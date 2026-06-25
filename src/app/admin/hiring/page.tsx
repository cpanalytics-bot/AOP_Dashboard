"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Badge, Card, KpiCard, PageHeader, Button, Spinner } from "@/components/ui";
import { useStore } from "@/lib/store";
import { liveAdminK8Hiring } from "@/lib/supabase/aop-data";
import type { K8HiringRow } from "@/lib/types";

// Map any HR / AOP status string to a Badge tone by keyword.
function hiringStatusTone(s: string | null): "slate" | "green" | "amber" | "red" | "blue" {
  const v = (s ?? "").toLowerCase();
  if (!v) return "slate";
  if (/(close|drop|reject|left|abscond|declin|backout|back out)/.test(v)) return "red";
  if (/(join|offer|select|approve|complete|fill|onboard)/.test(v)) return "green";
  if (/(progress|interview|sourc|pending|process|review|screen)/.test(v)) return "amber";
  if (/request/.test(v)) return "blue";
  return "slate";
}

const dash = (v: string | null) => (v && v.trim() ? v : <span className="text-gray-300">—</span>);
const sortUnique = (xs: (string | null)[]) =>
  Array.from(new Set(xs.filter((x): x is string => !!x && !!x.trim()))).sort((a, b) => a.localeCompare(b));

export default function AdminHiringPage() {
  const router = useRouter();
  const { currentUser, hydrating } = useStore();
  const [rows, setRows] = useState<K8HiringRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [zmFilter, setZmFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  const [districtFilter, setDistrictFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [query, setQuery] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setRows(await liveAdminK8Hiring());
    setLoading(false);
  }, []);

  useEffect(() => {
    if (currentUser?.role === "ADMIN") void refresh();
  }, [currentUser, refresh]);

  // Redirect to login on logout (AppShell is a child here, so it can't do it).
  useEffect(() => {
    if (!hydrating && !currentUser) router.replace("/login");
  }, [hydrating, currentUser, router]);

  // Filter dropdown options (district narrows to the selected state).
  const zmOptions = useMemo(() => sortUnique(rows.map((r) => r.reportingZm)), [rows]);
  const stateOptions = useMemo(() => sortUnique(rows.map((r) => r.state)), [rows]);
  const districtOptions = useMemo(
    () => sortUnique(rows.filter((r) => stateFilter === "all" || r.state === stateFilter).map((r) => r.district)),
    [rows, stateFilter],
  );
  const statusOptions = useMemo(() => sortUnique(rows.map((r) => r.status)), [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (zmFilter !== "all" && r.reportingZm !== zmFilter) return false;
      if (stateFilter !== "all" && r.state !== stateFilter) return false;
      if (districtFilter !== "all" && r.district !== districtFilter) return false;
      if (statusFilter !== "all" && (r.status ?? "") !== statusFilter) return false;
      if (!q) return true;
      return [r.reportingZm, r.state, r.district, r.block, r.status, r.hrStatus, r.designation]
        .some((v) => (v ?? "").toLowerCase().includes(q));
    });
  }, [rows, zmFilter, stateFilter, districtFilter, statusFilter, query]);

  // By-status summary (positions / requests) over the filtered set.
  const byStatus = useMemo(() => {
    const acc: Record<string, { requests: number; positions: number }> = {};
    filtered.forEach((r) => {
      const k = r.status || "Requested";
      acc[k] = acc[k] ?? { requests: 0, positions: 0 };
      acc[k].requests += 1;
      acc[k].positions += r.numberOfPositions ?? 1;
    });
    return Object.entries(acc);
  }, [filtered]);

  const onStateChange = (v: string) => { setStateFilter(v); setDistrictFilter("all"); };
  const resetFilters = () => {
    setZmFilter("all"); setStateFilter("all"); setDistrictFilter("all"); setStatusFilter("all"); setQuery("");
  };
  const anyFilter = zmFilter !== "all" || stateFilter !== "all" || districtFilter !== "all" || statusFilter !== "all" || query.trim() !== "";

  if (!currentUser) return null;
  if (currentUser.role !== "ADMIN") { router.replace("/login"); return null; }

  const sel = "h-9 rounded-lg border border-gray-300 bg-white px-3 text-[13px] outline-none focus:border-indigo-500";

  return (
    <AppShell>
      <PageHeader
        title="ZM Hiring Summary"
        description="Every hiring record across teams (AOP requests + HR pipeline). Filter by ZM / Zone, State, District or Status."
        actions={<Button size="sm" variant="outline" onClick={refresh} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</Button>}
      />

      {loading && rows.length === 0 ? (
        <Card><div className="flex items-center gap-2 p-2 text-[13px] text-gray-500"><Spinner className="text-indigo-600" /> Loading hiring records…</div></Card>
      ) : (
        <div className="space-y-5">
          {/* By-status summary (reflects the active filters) */}
          {byStatus.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {byStatus.map(([status, v]) => (
                <KpiCard key={status} label={status} value={`${v.positions} positions`} accent="violet" sub={`${v.requests} request${v.requests === 1 ? "" : "s"}`} />
              ))}
            </div>
          )}

          {/* Filters: ZM/Zone · State · District · Status + search */}
          <div className="flex flex-wrap items-center gap-2">
            <select value={zmFilter} onChange={(e) => setZmFilter(e.target.value)} className={sel}>
              <option value="all">All ZM / Zone ({zmOptions.length})</option>
              {zmOptions.map((z) => <option key={z} value={z}>{z}</option>)}
            </select>
            <select value={stateFilter} onChange={(e) => onStateChange(e.target.value)} className={sel}>
              <option value="all">All states ({stateOptions.length})</option>
              {stateOptions.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={districtFilter} onChange={(e) => setDistrictFilter(e.target.value)} className={sel}>
              <option value="all">All districts ({districtOptions.length})</option>
              {districtOptions.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={sel}>
              <option value="all">All statuses ({statusOptions.length})</option>
              {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search ZM, state, district, status…"
              className="h-9 w-60 rounded-lg border border-gray-300 bg-white px-3 text-[13px] outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15"
            />
            {anyFilter && (
              <button type="button" onClick={resetFilters} className="text-[12.5px] font-medium text-indigo-600 hover:underline">Reset</button>
            )}
          </div>

          {/* Detailed table */}
          <Card className="overflow-hidden p-0">
            <div className="flex items-center justify-between px-4 py-3">
              <h3 className="t-card-heading">Hiring records</h3>
              <span className="t-caption">{filtered.length} of {rows.length} record(s)</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-[12.5px]">
                <thead className="bg-gray-50/80 text-gray-500">
                  <tr>
                    <th className="px-3 py-2 t-overline w-12">S No.</th>
                    <th className="px-3 py-2 t-overline">ZM / Zone</th>
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
                  {filtered.map((r, i) => (
                    <tr key={r.id} className="hover:bg-gray-50/60">
                      <td className="px-3 py-2 tabular-nums align-top text-gray-500">
                        <div>{i + 1}</div>
                        {r.source === "AOP" && <Badge tone="indigo">{r.aopRef ?? "AOP"}</Badge>}
                      </td>
                      <td className="px-3 py-2 align-top text-gray-700">{dash(r.reportingZm)}</td>
                      <td className="px-3 py-2 align-top text-gray-700">{dash(r.state)}</td>
                      <td className="px-3 py-2 align-top text-gray-700">
                        <div>{dash(r.district)}</div>
                        {r.designation && <div className="t-caption">{r.designation}</div>}
                      </td>
                      <td className="px-3 py-2 align-top text-gray-700">{dash(r.block)}</td>
                      <td className="px-3 py-2 align-top">
                        {r.status ? <Badge tone={hiringStatusTone(r.status)}>{r.status}</Badge> : dash(null)}
                      </td>
                      <td className="px-3 py-2 align-top">
                        {r.hrStatus ? <Badge tone={hiringStatusTone(r.hrStatus)}>{r.hrStatus}</Badge> : <span className="text-gray-400">Not initiated</span>}
                      </td>
                      <td className="px-3 py-2 align-top tabular-nums text-gray-700">{dash(r.expectedDoj)}</td>
                      <td className="px-3 py-2 align-top text-gray-600">{dash(r.reasonForDroppingOut)}</td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr><td colSpan={9} className="px-3 py-8 text-center text-[13px] text-gray-400">No hiring records match these filters.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </AppShell>
  );
}
