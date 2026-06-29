"use client";

import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { Badge, Card, PageHeader, ProgressBar, Stat } from "@/components/ui";
import { useStore } from "@/lib/store";
import {
  computeAopKpis,
  computeSamplingKpis,
  computeUniverseKpis,
  fmtINR,
  fmtNum,
  fmtPct,
} from "@/lib/calc";
import { statusRank } from "@/lib/types";
import type { User } from "@/lib/types";

export default function DashboardPage() {
  return (
    <AppShell>
      <Suspense fallback={null}>
        <DashboardContent />
      </Suspense>
    </AppShell>
  );
}

function DashboardContent() {
  const { currentUser } = useStore();
  const params = useSearchParams();
  const focusUser = params.get("user");

  if (!currentUser) return null;

  // If a specific user is focused (or current user is BDA), show individual dashboard.
  const showIndividual = !!focusUser || currentUser.role === "BDA";

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={showIndividual ? "Individual performance & plan" : `${currentUser.role} command center`}
      />
      {showIndividual ? (
        <IndividualDashboard userId={focusUser ?? currentUser.id} />
      ) : (
        <TeamDashboard />
      )}
    </div>
  );
}

// Deterministic pseudo-actual (YTD) for demo: ~ a fraction of target based on code.
function ytdAchievementPct(user: User) {
  const seed = user.employeeCode.charCodeAt(user.employeeCode.length - 1);
  return 55 + (seed % 40); // 55%-94%
}

function IndividualDashboard({ userId }: { userId: string }) {
  const { getAop, users } = useStore();
  const user = users.find((u) => u.id === userId);
  const aop = getAop(userId);
  const kpis = useMemo(() => computeAopKpis(aop), [aop]);
  const uni = useMemo(() => computeUniverseKpis(aop.universe), [aop]);
  const samp = useMemo(() => computeSamplingKpis(aop.sampling, aop.universe), [aop]);

  if (!user) return <Card><p className="t-body">User not found.</p></Card>;

  const target = aop.revenue.totalRevenueTarget;
  const achievedPct = ytdAchievementPct(user);
  const actual = (target * achievedPct) / 100;

  return (
    <div className="space-y-4">
      <Card>
        <h3 className="t-card-heading">{user.name} · Target vs actual (YTD)</h3>
        <p className="t-caption mt-0.5 mb-3">Demo YTD actual vs FY26-27 AOP target.</p>
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="text-gray-600">{fmtINR(actual)} of {fmtINR(target)}</span>
          <span className="font-semibold text-gray-900">{achievedPct}%</span>
        </div>
        <ProgressBar pct={achievedPct} tone={achievedPct >= 90 ? "green" : achievedPct >= 75 ? "amber" : "red"} />
      </Card>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Revenue growth" value={fmtPct(kpis.revenueGrowthPct)} tone={kpis.revenueGrowthPct >= 0 ? "green" : "red"} />
        <Stat label="School growth" value={fmtPct(uni.schoolGrowthPct)} />
        <Stat label="Retention" value={fmtPct(kpis.retentionPct)} />
        <Stat label="Conversion" value={fmtPct(kpis.conversionPct)} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <h4 className="t-overline mb-3">Universe growth</h4>
          <div className="space-y-2">
            <Row label="Active schools" value={String(aop.universe.activeSchools)} />
            <Row label="Target schools" value={String(uni.targetTotalFromCategories)} />
            <Row label="New acquisition plan" value={String(aop.universe.newSchoolAcquisitionPlan)} />
            <Row label="Retention schools" value={String(aop.universe.retentionPlanValue ?? 0)} />
          </div>
        </Card>
        <Card>
          <h4 className="t-overline mb-3">Sampling & conversion</h4>
          <div className="space-y-2">
            <Row label="Total sampling schools" value={String(samp.totalSamplingSchools)} />
            <Row label="Est. conversions" value={String(samp.estimatedConversions)} />
            <Row label="Cost per conversion" value={fmtINR(samp.costPerConversion)} />
            <Row label="User conv %" value={`${aop.sampling.userSchoolConversion}%`} />
          </div>
        </Card>
      </div>
    </div>
  );
}

function TeamDashboard() {
  const { currentUser, subordinates, getAop, hiring } = useStore();
  const team = useMemo(() => subordinates(currentUser!.id), [subordinates, currentUser]);

  const detailedRows = useMemo(() => team.map((u) => {
    const aop = getAop(u.id);
    const k = computeAopKpis(aop);
    const uni = computeUniverseKpis(aop.universe);
    return {
      user: u,
      aop,
      status: aop.status,
      target: aop.revenue.totalRevenueTarget,
      targetAov: aop.revenue.targetAov,
      growth: k.revenueGrowthPct,
      retentionPct: k.retentionPct,
      achieved: ytdAchievementPct(u),
      targetSchools: uni.targetTotalFromCategories,
      builtSchools: uni.currentTotalFromCategories,
      samplingSchools: uni.totalSamplingFromCategories,
      conversionSchools: uni.totalConversionFromCategories,
      retentionCount: aop.universe.retentionSchoolCount ?? 0,
    };
  }), [team, getAop]);

  // Render order: submitted/in-review on top, draft/not-started at the bottom.
  const orderedDetailRows = useMemo(
    () => [...detailedRows].sort((a, b) => statusRank(a.status) - statusRank(b.status)),
    [detailedRows],
  );

  const totalTarget = detailedRows.reduce((s, r) => s + r.target, 0);
  const totalSchools = detailedRows.reduce((s, r) => s + r.targetSchools, 0);
  const submitted = detailedRows.filter((r) => ["submitted", "approved", "in_review"].includes(r.status)).length;
  const approved = detailedRows.filter((r) => r.status === "approved").length;
  const atRisk = detailedRows.filter((r) => r.achieved < 75).length;
  const isZdm = currentUser?.role === "ZDM";

  const teamIds = new Set(team.map((u) => u.id));
  const totalHiring = (hiring ?? [])
    .filter((h: { forUserId: string | null; numberOfPositions: number }) => h.forUserId && teamIds.has(h.forUserId))
    .reduce((s: number, h: { numberOfPositions: number }) => s + h.numberOfPositions, 0);

  // Zone rollup grouped by reporting manager (for ZDM leadership view)
  const byManager = useMemo(() => {
    const map = new Map<string, { name: string; target: number; count: number }>();
    detailedRows.forEach((r) => {
      const mgrId = r.user.reportingManagerId ?? "none";
      const cur = map.get(mgrId) ?? { name: r.user.reportingManagerId ?? "Direct", target: 0, count: 0 };
      cur.target += r.target;
      cur.count += 1;
      map.set(mgrId, cur);
    });
    return Array.from(map.values());
  }, [detailedRows]);

  return (
    <div className="space-y-4">
      {/* ZM Roll-up stats */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        <Stat label="Team revenue target" value={fmtINR(totalTarget)} />
        <Stat label="Team schools target" value={fmtNum(totalSchools)} />
        <Stat label="Hiring positions" value={String(totalHiring)} />
        <Stat label="Plans submitted" value={`${submitted}/${detailedRows.length}`} tone={submitted === detailedRows.length ? "green" : "amber"} />
        <Stat label="Approved" value={`${approved}/${detailedRows.length}`} />
        <Stat label="At risk (<75%)" value={String(atRisk)} tone={atRisk > 0 ? "red" : "green"} />
      </div>

      <Card>
        <h3 className="mb-4 t-card-heading">
          {isZdm ? "Zone team comparison" : "Team comparison"}
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="t-overline py-2 pr-3 font-semibold">Employee</th>
                <th className="t-overline py-2 pr-3 font-semibold">Role</th>
                <th className="t-overline py-2 pr-3 font-semibold">AOP target</th>
                <th className="t-overline py-2 pr-3 font-semibold">Growth</th>
                <th className="t-overline py-2 pr-3 font-semibold">YTD</th>
                <th className="t-overline py-2 pr-3 font-semibold">Status</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {detailedRows.map((r) => (
                <tr key={r.user.id} className="border-b border-gray-100 last:border-0">
                  <td className="py-2.5 pr-3 font-medium text-gray-900">{r.user.name}</td>
                  <td className="py-2.5 pr-3"><Badge tone={r.user.role === "BDM" ? "blue" : "slate"}>{r.user.role}</Badge></td>
                  <td className="py-2.5 pr-3 text-gray-700">{fmtINR(r.target)}</td>
                  <td className={`py-2.5 pr-3 font-medium ${r.growth >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{fmtPct(r.growth)}</td>
                  <td className={`py-2.5 pr-3 font-medium ${r.achieved >= 90 ? "text-emerald-600" : r.achieved >= 75 ? "text-amber-600" : "text-rose-600"}`}>{r.achieved}%</td>
                  <td className="py-2.5 pr-3 text-gray-500">{r.status}</td>
                  <td className="py-2.5">
                    <Link href={`/aop/${encodeURIComponent(r.user.id)}`} className="font-medium text-indigo-600 hover:text-indigo-700">Open</Link>
                  </td>
                </tr>
              ))}
              {detailedRows.length === 0 && (
                <tr><td colSpan={7} className="py-3 text-gray-400">No subordinates in your view.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* AOP Details Table — line-item visibility for ZM */}
      <Card>
        <h3 className="mb-4 t-card-heading">AOP Details by Member</h3>
        <p className="t-caption mb-3">Consolidated view of all AOP line items filled by each team member.</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-[12.5px]">
            <thead className="bg-gray-50/80 text-gray-500">
              <tr className="border-b border-gray-200">
                <th className="t-overline py-2 px-2 font-semibold sticky left-0 bg-gray-50/80">Employee</th>
                <th className="t-overline py-2 px-2 font-semibold">Revenue Target</th>
                <th className="t-overline py-2 px-2 font-semibold">Target AOV</th>
                <th className="t-overline py-2 px-2 font-semibold">Target Schools</th>
                <th className="t-overline py-2 px-2 font-semibold">Retention</th>
                <th className="t-overline py-2 px-2 font-semibold">Sampling</th>
                <th className="t-overline py-2 px-2 font-semibold">Conversion</th>
                <th className="t-overline py-2 px-2 font-semibold">Universe Built</th>
                <th className="t-overline py-2 px-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {orderedDetailRows.map((r) => (
                <tr key={r.user.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/50">
                  <td className="py-2 px-2 font-medium text-gray-900 sticky left-0 bg-white">
                    <Link href={`/aop/${encodeURIComponent(r.user.id)}`} className="hover:text-indigo-600">{r.user.name}</Link>
                  </td>
                  <td className="py-2 px-2 tabular-nums text-gray-700">{fmtINR(r.target)}</td>
                  <td className="py-2 px-2 tabular-nums text-gray-700">{fmtINR(r.targetAov)}</td>
                  <td className="py-2 px-2 tabular-nums text-gray-700">{fmtNum(r.targetSchools)}</td>
                  <td className="py-2 px-2 tabular-nums text-gray-700">{fmtNum(r.retentionCount)}</td>
                  <td className="py-2 px-2 tabular-nums text-gray-700">{fmtNum(r.samplingSchools)}</td>
                  <td className="py-2 px-2 tabular-nums text-gray-700">{fmtNum(r.conversionSchools)}</td>
                  <td className="py-2 px-2 tabular-nums text-gray-700">
                    {fmtNum(r.builtSchools)}<span className="text-gray-400"> / {fmtNum(r.targetSchools)}</span>
                  </td>
                  <td className="py-2 px-2">
                    <Badge tone={r.status === "approved" ? "green" : r.status === "submitted" ? "blue" : "slate"}>{r.status}</Badge>
                  </td>
                </tr>
              ))}
              {detailedRows.length > 0 && (
                <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
                  <td className="py-2 px-2 text-gray-900 sticky left-0 bg-gray-50">Zone Total</td>
                  <td className="py-2 px-2 tabular-nums text-gray-900">{fmtINR(totalTarget)}</td>
                  <td className="py-2 px-2 text-gray-400">—</td>
                  <td className="py-2 px-2 tabular-nums text-gray-900">{fmtNum(totalSchools)}</td>
                  <td className="py-2 px-2 tabular-nums text-gray-900">{fmtNum(detailedRows.reduce((s, r) => s + r.retentionCount, 0))}</td>
                  <td className="py-2 px-2 tabular-nums text-gray-900">{fmtNum(detailedRows.reduce((s, r) => s + r.samplingSchools, 0))}</td>
                  <td className="py-2 px-2 tabular-nums text-gray-900">{fmtNum(detailedRows.reduce((s, r) => s + r.conversionSchools, 0))}</td>
                  <td className="py-2 px-2 tabular-nums text-gray-900">
                    {fmtNum(detailedRows.reduce((s, r) => s + r.builtSchools, 0))}<span className="text-gray-400"> / {fmtNum(totalSchools)}</span>
                  </td>
                  <td className="py-2 px-2 text-gray-400">—</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {isZdm && (
        <Card>
          <h3 className="mb-4 t-card-heading">Leadership rollup · target by BDM line</h3>
          <div className="space-y-3">
            {byManager.map((m, i) => {
              const pct = totalTarget > 0 ? (m.target / totalTarget) * 100 : 0;
              return (
                <div key={i}>
                  <div className="mb-1.5 flex items-center justify-between text-[13px]">
                    <span className="text-gray-600">{m.count} reports</span>
                    <span className="font-medium text-gray-900">{fmtINR(m.target)} ({pct.toFixed(0)}%)</span>
                  </div>
                  <ProgressBar pct={pct} />
                </div>
              );
            })}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat label="Zone target" value={fmtINR(totalTarget)} />
            <Stat label="Plan completion" value={fmtPct(detailedRows.length ? (submitted / detailedRows.length) * 100 : 0)} />
            <Stat label="Revenue at risk" value={String(atRisk)} tone={atRisk > 0 ? "red" : "green"} sub="reports < 75% YTD" />
          </div>
        </Card>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-[13px]">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-900">{value}</span>
    </div>
  );
}
