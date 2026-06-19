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
  fmtPct,
} from "@/lib/calc";
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
        <Stat label="Cost %" value={fmtPct(kpis.investmentPct)} />
        <Stat label="ROI" value={fmtPct(kpis.roiPct)} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <h4 className="t-overline mb-3">Universe growth</h4>
          <div className="space-y-2">
            <Row label="Active schools" value={String(aop.universe.activeSchools)} />
            <Row label="Target schools" value={String(uni.targetTotalFromCategories)} />
            <Row label="New acquisition plan" value={String(aop.universe.newSchoolAcquisitionPlan)} />
            <Row label="Retention plan" value={`${aop.universe.retentionPlan}%`} />
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
  const { currentUser, subordinates, getAop } = useStore();
  const team = useMemo(() => subordinates(currentUser!.id), [subordinates, currentUser]);

  const rows = team.map((u) => {
    const aop = getAop(u.id);
    const k = computeAopKpis(aop);
    return {
      user: u,
      status: aop.status,
      target: aop.revenue.totalRevenueTarget,
      growth: k.revenueGrowthPct,
      investmentPct: k.investmentPct,
      achieved: ytdAchievementPct(u),
    };
  });

  const totalTarget = rows.reduce((s, r) => s + r.target, 0);
  const submitted = rows.filter((r) => ["submitted", "approved", "in_review"].includes(r.status)).length;
  const approved = rows.filter((r) => r.status === "approved").length;
  const atRisk = rows.filter((r) => r.achieved < 75).length;
  const isZdm = currentUser?.role === "ZDM";

  // Zone rollup grouped by reporting manager (for ZDM leadership view)
  const byManager = useMemo(() => {
    const map = new Map<string, { name: string; target: number; count: number }>();
    rows.forEach((r) => {
      const mgrId = r.user.reportingManagerId ?? "none";
      const cur = map.get(mgrId) ?? { name: r.user.reportingManagerId ?? "Direct", target: 0, count: 0 };
      cur.target += r.target;
      cur.count += 1;
      map.set(mgrId, cur);
    });
    return Array.from(map.values());
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Team AOP target" value={fmtINR(totalTarget)} />
        <Stat label="Plans submitted" value={`${submitted}/${rows.length}`} tone={submitted === rows.length ? "green" : "amber"} />
        <Stat label="Approved" value={`${approved}/${rows.length}`} />
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
              {rows.map((r) => (
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
              {rows.length === 0 && (
                <tr><td colSpan={7} className="py-3 text-gray-400">No subordinates in your view.</td></tr>
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
            <Stat label="Plan completion" value={fmtPct(rows.length ? (submitted / rows.length) * 100 : 0)} />
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
