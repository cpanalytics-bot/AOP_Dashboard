"use client";

import React, { useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Aop, CollectionMilestoneRow } from "@/lib/types";
import {
  Button,
  Card,
  Field,
  KpiCard,
  NumberInput,
  Select,
  Stat,
} from "@/components/ui";
import {
  collectionPhasingForZone,
  computeRevenueKpis,
  computeUniverseKpis,
  fmtINR,
  fmtNum,
  fmtPct,
} from "@/lib/calc";
import { zoneById } from "@/lib/master-data";
import { useStore } from "@/lib/store";

export type Patch = <K extends keyof Aop>(section: K, value: Partial<Aop[K]>) => void;

interface StageProps {
  aop: Aop;
  patch: Patch;
  errors: Record<string, string>;
  readOnly: boolean;
}

// ---------------------------------------------------------------------------
// Shared components
// ---------------------------------------------------------------------------

function FrozenCard({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg border border-amber-200/60 bg-amber-50/40 p-3 relative">
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] text-amber-500">🔒</span>
        <span className="t-overline text-amber-700">{label}</span>
      </div>
      <div className="mt-1 text-base font-semibold tracking-tight text-gray-900">{value}</div>
      {note && <div className="mt-0.5 text-[11.5px] leading-snug text-gray-400">{note}</div>}
    </div>
  );
}

function StageIntro({ children }: { children: React.ReactNode }) {
  return <p className="mb-4 rounded-lg bg-indigo-50/50 px-3.5 py-2.5 text-[13px] leading-relaxed text-gray-600">{children}</p>;
}

// Tooltip rendered through a portal with fixed positioning so it escapes the
// stacking context of sticky cards (which previously hid it) and is never
// clipped. It anchors above the trigger and flips below if there's no room.
function InfoTooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; placement: "top" | "bottom" }>({
    top: 0,
    left: 0,
    placement: "top",
  });
  const btnRef = useRef<HTMLButtonElement>(null);

  const TOOLTIP_WIDTH = 256; // w-64
  const MARGIN = 8;

  // Compute the anchored, viewport-clamped position at the moment we open.
  const open = () => {
    const el = btnRef.current;
    if (el) {
      const r = el.getBoundingClientRect();
      const placement = r.top < 140 ? "bottom" : "top";
      const half = TOOLTIP_WIDTH / 2;
      const center = r.left + r.width / 2;
      const left = Math.min(Math.max(center, half + MARGIN), window.innerWidth - half - MARGIN);
      setPos({ top: placement === "top" ? r.top - MARGIN : r.bottom + MARGIN, left, placement });
    }
    setShow(true);
  };

  return (
    <span className="inline-block">
      <button
        ref={btnRef}
        type="button"
        className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-gray-200 text-[10px] font-bold text-gray-500 hover:bg-indigo-100 hover:text-indigo-600 transition-colors"
        onMouseEnter={open}
        onMouseLeave={() => setShow(false)}
        onClick={() => (show ? setShow(false) : open())}
        aria-label="Info"
      >
        i
      </button>
      {show &&
        typeof document !== "undefined" &&
        createPortal(
          <span
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              transform: `translate(-50%, ${pos.placement === "top" ? "-100%" : "0"})`,
            }}
            className="pointer-events-none z-[1000] block w-64 rounded-lg border border-gray-200 bg-white p-2.5 text-[12px] leading-snug text-gray-700 shadow-xl"
          >
            {text}
          </span>,
          document.body,
        )}
    </span>
  );
}

// Category definitions with actual classification logic
const CATEGORY_DEFINITIONS: Record<string, string> = {
  A: "Category A: Schools with 500+ students AND ₹1L+ annual revenue. Top-tier buyers with proven purchasing history.",
  B: "Category B: Schools with 200–500 students AND ₹30K–₹1L annual revenue. Mid-tier with growth potential.",
  C: "Category C: Schools with 100–200 students AND ₹10K–₹30K annual revenue. Smaller institutions, newer relationships.",
  D: "Category D: Schools with <100 students OR <₹10K annual revenue. Low-activity or nascent territory schools.",
  Uncategorized: "Schools not yet classified — pending data collection, territory mapping, or first interaction.",
  Chain: "Schools belonging to a group or franchise network. Shared procurement decisions, centralized billing.",
};

// ---------------------------------------------------------------------------
// Stage: Revenue
// ---------------------------------------------------------------------------
export function RevenueStage({ aop, patch, errors, readOnly }: StageProps) {
  const r = aop.revenue;
  const k = computeRevenueKpis(r);
  const set = (field: keyof typeof r, v: number) => patch("revenue", { [field]: v } as never);

  const autoSplit = () => {
    // Split the TOTAL across the 3 core categories only (STEM/Panel are add-ons).
    const lyParts = [
      r.earlyYearsRevenueLY || 0,
      r.mathScienceRevenueLY || 0,
      r.otherCategoriesRevenueLY || 0,
    ];
    const lyTotal = lyParts.reduce((s, n) => s + n, 0) || 1;
    const t = Number.isFinite(r.totalRevenueTarget) ? r.totalRevenueTarget : 0;
    patch("revenue", {
      earlyYearsTarget: Math.round((t * lyParts[0]) / lyTotal),
      mathScienceTarget: Math.round((t * lyParts[1]) / lyTotal),
      otherCategoriesTarget: Math.round((t * lyParts[2]) / lyTotal),
    } as never);
  };

  return (
    <div className="space-y-4">
      {/* Last-year actuals — proper KPI cards (read-only, from live order data) */}
      <Card>
        <div className="mb-3 flex items-center gap-2">
          <h3 className="t-card-heading">Last Year Actuals</h3>
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">FY25-26 · Live</span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <KpiCard label="Revenue" value={fmtINR(r.lastYearRevenue)} accent="indigo" frozen sub="total last year" />
          <KpiCard label="Early Years" value={fmtINR(r.earlyYearsRevenueLY)} accent="emerald" frozen />
          <KpiCard label="Math & Science" value={fmtINR(r.mathScienceRevenueLY)} accent="sky" frozen />
          <KpiCard label="Other Books" value={fmtINR(r.otherCategoriesRevenueLY)} accent="violet" frozen />
          <KpiCard label="AOV" value={fmtINR(r.currentAov)} accent="amber" frozen sub="per unique school" />
        </div>
      </Card>

      {/* Editable section */}
      <Card>
        <div className="mb-4 flex items-center justify-between gap-2">
          <h3 className="t-card-heading">Targets for FY26-27</h3>
          {!readOnly && (
            <Button size="sm" variant="outline" onClick={autoSplit} disabled={!r.totalRevenueTarget}>
              Auto-split by last year
            </Button>
          )}
        </div>
        <Field label="Total revenue target" hint="INR" required error={errors.totalRevenueTarget}
          note="The headline number: total revenue you plan to earn in FY26-27.">
          <NumberInput value={r.totalRevenueTarget} onChange={(v) => set("totalRevenueTarget", v)} disabled={readOnly} />
        </Field>

        <div className="mt-5 rounded-lg bg-indigo-50/50 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-gray-600">
          <span className="font-semibold text-gray-700">Total revenue target = Early Years + Math &amp; Science + Other Books.</span>{" "}
          STEM &amp; Panel are <span className="font-medium text-gray-700">optional add-ons, over and above the total</span> — they are NOT part of this sum.
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Early Years target" hint="INR" required error={errors.earlyYearsTarget} note="Revenue from Early Years books (Pre-Nursery to UKG).">
            <NumberInput value={r.earlyYearsTarget} onChange={(v) => set("earlyYearsTarget", v)} disabled={readOnly} />
          </Field>
          <Field label="Math & Science target" hint="INR" required error={errors.mathScienceTarget} note="Revenue from Maths & Science books (Grade 1–8).">
            <NumberInput value={r.mathScienceTarget} onChange={(v) => set("mathScienceTarget", v)} disabled={readOnly} />
          </Field>
          <Field label="Other Books target" hint="INR" required error={errors.otherCategoriesTarget} note="Revenue from books OTHER than Early Years and Maths & Science (all other book categories).">
            <NumberInput value={r.otherCategoriesTarget} onChange={(v) => set("otherCategoriesTarget", v)} disabled={readOnly} />
          </Field>
          <div className="hidden sm:block" />
          <Field label="STEM target · add-on" hint="INR" note="Extra revenue from STEM kits — over and above the total. Optional.">
            <NumberInput value={r.stemTarget} onChange={(v) => set("stemTarget", v)} disabled={readOnly} placeholder="Optional add-on" />
          </Field>
          <Field label="Panel target · add-on" hint="INR" note="Extra revenue from interactive panels / displays — over and above the total. Optional.">
            <NumberInput value={r.panelTarget} onChange={(v) => set("panelTarget", v)} disabled={readOnly} placeholder="Optional add-on" />
          </Field>
        </div>

        <div className={`mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3.5 py-2 text-[12.5px] ${
          Number.isFinite(r.totalRevenueTarget) && Math.abs(k.categoryMismatch) > 1
            ? "border-rose-200 bg-rose-50 text-rose-700"
            : "border-emerald-200 bg-emerald-50 text-emerald-700"
        }`}>
          <span>Early Years + Math &amp; Science + Other Books = <span className="font-semibold">{fmtINR(k.categorySumTarget)}</span>{Number.isFinite(r.totalRevenueTarget) ? ` vs total ${fmtINR(r.totalRevenueTarget)}` : ""}</span>
          <span className="font-semibold">
            {Number.isFinite(r.totalRevenueTarget) && Math.abs(k.categoryMismatch) > 1
              ? `Off by ${fmtINR(Math.abs(k.categoryMismatch))}`
              : "Balanced ✓"}
          </span>
        </div>
      </Card>

      <Card>
        <h3 className="mb-1 t-card-heading">Average Order Value (AOV)</h3>
        <p className="t-caption mb-4">Current AOV = sum of FY26-27 valid order value ÷ count of unique schools ordered from. Bulk orders are excluded from both.</p>
        <div className="grid gap-5 sm:grid-cols-2">
          <FrozenCard label="Current AOV" value={fmtINR(r.currentAov)} note="orders_agg: Σ order amount (excl. cancelled) ÷ unique schools (bulk excluded)." />
          <Field label="Target AOV" hint="INR" required error={errors.targetAov} note="How big you want the average order to be.">
            <NumberInput value={r.targetAov} onChange={(v) => set("targetAov", v)} disabled={readOnly} />
          </Field>
        </div>
      </Card>

      <Card>
        <h3 className="mb-4 t-card-heading">Live numbers (calculated for you)</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Revenue growth" value={fmtPct(k.revenueGrowthPct)} tone={k.revenueGrowthPct >= 0 ? "green" : "red"} sub="vs last year" />
          <Stat label="Current AOV" value={fmtINR(r.currentAov)} sub="per unique school" />
          <Stat label="Target AOV" value={fmtINR(r.targetAov)} sub="your goal" />
          <Stat label="AOV growth" value={fmtPct(k.aovGrowthPct)} tone={k.aovGrowthPct >= 0 ? "green" : "red"} sub="vs current" />
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stage: Universe (merged with Sampling & Training)
// ---------------------------------------------------------------------------
export function UniverseStage({ aop, patch, errors, readOnly }: StageProps) {
  const u = aop.universe;
  const s = aop.sampling;
  const t = aop.training;
  const k = computeUniverseKpis(u);

  const setU = (field: keyof typeof u, v: number | string | boolean) =>
    patch("universe", { [field]: v } as never);
  const setS = (field: keyof typeof s, v: number) => patch("sampling", { [field]: v } as never);
  const setT = (field: keyof typeof t, v: number) => patch("training", { [field]: v } as never);

  const setCat = (idx: number, field: string, v: number) => {
    const categories = u.categories.map((c, i) => {
      if (i !== idx) return c;
      return { ...c, [field]: v };
    });
    patch("universe", { categories });
  };

  return (
    <div className="space-y-4">
      {/* 1. Schools In Your Area Today — proper KPI cards (read-only, live) */}
      <Card>
        <div className="mb-3 flex items-center gap-2">
          <h3 className="t-card-heading">Schools In Your Area Today</h3>
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">Read only · Live</span>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label="Total schools" value={fmtNum(u.totalSchools)} accent="slate" frozen sub="mapped in your area" />
          <KpiCard label="Active schools" value={fmtNum(u.activeSchools)} accent="emerald" frozen sub="currently active" />
          <KpiCard label="User schools" value={fmtNum(u.userSchools)} accent="indigo" frozen sub="have transacted" />
          <KpiCard label="Non-user schools" value={fmtNum(u.nonUserSchools)} accent="amber" frozen sub="never ordered" />
        </div>
      </Card>

      {/* 2. Retention */}
      <Card>
        <h3 className="mb-1 t-card-heading">Retention</h3>
        <p className="t-caption mb-4">How many schools will you retain and at what value?</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Retention school count" required error={errors.retentionSchoolCount} note="Number of schools you will retain from current active schools.">
            <NumberInput value={u.retentionSchoolCount ?? NaN} onChange={(v) => setU("retentionSchoolCount", v)} disabled={readOnly} />
          </Field>
          <Field label="Retention school value" hint="INR" required error={errors.retentionPlanValue} note="Total revenue you expect from retained schools.">
            <NumberInput value={u.retentionPlanValue ?? 0} onChange={(v) => setU("retentionPlanValue", v)} disabled={readOnly} />
          </Field>
        </div>
      </Card>

      {/* 3. School Type Table */}
      <Card>
        <h3 className="mb-1 t-card-heading">School Types <span className="text-rose-500">*</span></h3>
        <p className="t-caption mb-1">For each category you see today&apos;s <span className="font-medium text-gray-600">Active</span> and <span className="font-medium text-gray-600">User</span> schools (read-only). <span className="font-medium text-gray-600">Target, Sampling and Conversion are required for every type.</span></p>
        {(errors.targetCount || errors.samplingCount || errors.conversionCount) && (
          <p className="mb-2 text-[12px] font-medium text-rose-600">Fill Target, Sampling and Conversion for every school type.</p>
        )}
        <div className="space-y-2 scroll-mt-28" data-field-error={(errors.targetCount || errors.samplingCount || errors.conversionCount) ? "true" : undefined}>
          {/* Header row */}
          <div className="hidden grid-cols-6 gap-2 px-1 sm:grid">
            <span className="t-overline">Type</span>
            <span className="t-overline">Active</span>
            <span className="t-overline">User</span>
            <span className="t-overline">Target <span className="text-rose-500">*</span></span>
            <span className="t-overline">Sampling <span className="text-rose-500">*</span></span>
            <span className="t-overline">Conversion <span className="text-rose-500">*</span></span>
          </div>
          {u.categories.map((c, idx) => (
            <div key={c.category} className="grid grid-cols-2 gap-2 rounded-lg border border-gray-200 bg-gray-50/60 p-2.5 sm:grid-cols-6">
              <div className="col-span-2 flex items-center gap-1 self-center text-[13px] font-medium text-gray-900 sm:col-span-1">
                {c.category}
                <InfoTooltip text={CATEGORY_DEFINITIONS[c.category] ?? `School category: ${c.category}`} />
              </div>
              {/* Frozen — active schools today */}
              <div className="self-center">
                <div className="flex items-center gap-1 sm:hidden"><span className="t-overline text-[10px]">Active:</span></div>
                <NumberInput value={c.activeCount} onChange={() => {}} disabled />
              </div>
              {/* Frozen — user schools today */}
              <div className="self-center">
                <div className="flex items-center gap-1 sm:hidden"><span className="t-overline text-[10px]">User:</span></div>
                <NumberInput value={c.userCount} onChange={() => {}} disabled />
              </div>
              {/* Target Schools — editable */}
              <div>
                <div className="flex items-center gap-1 sm:hidden"><span className="t-overline text-[10px]">Target:</span></div>
                <NumberInput value={c.targetCount} onChange={(v) => setCat(idx, "targetCount", v)} disabled={readOnly} placeholder="Target" invalid={!!errors.targetCount && !Number.isFinite(c.targetCount)} />
              </div>
              {/* Sampling Schools — editable */}
              <div>
                <div className="flex items-center gap-1 sm:hidden"><span className="t-overline text-[10px]">Sampling:</span></div>
                <NumberInput value={c.samplingCount} onChange={(v) => setCat(idx, "samplingCount", v)} disabled={readOnly} placeholder="Sampling" invalid={!!errors.samplingCount && !Number.isFinite(c.samplingCount)} />
              </div>
              {/* Conversion Schools — editable (actual count) */}
              <div>
                <div className="flex items-center gap-1 sm:hidden"><span className="t-overline text-[10px]">Conversion:</span></div>
                <NumberInput value={c.conversionCount} onChange={(v) => setCat(idx, "conversionCount", v)} disabled={readOnly} placeholder="Count" invalid={!!errors.conversionCount && !Number.isFinite(c.conversionCount)} />
              </div>
            </div>
          ))}
        </div>
        {/* Bottom summary — reordered: Target → Sampling → Conversion → Growth */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Schools target" value={fmtNum(k.targetTotalFromCategories)} sub="total target" />
          <Stat label="Sampling schools" value={fmtNum(k.totalSamplingFromCategories)} sub="from all types" />
          <Stat label="Conversion schools" value={fmtNum(k.totalConversionFromCategories)} sub="ordered schools" />
          <Stat label="School growth" value={`+${fmtNum(k.schoolGrowthCount)}`} tone={k.schoolGrowthCount >= 0 ? "green" : "red"} sub={fmtPct(k.schoolGrowthPct)} />
        </div>
      </Card>

      {/* 4. Sampling Section — "How Many Schools Will You Sample?" */}
      <Card>
        <h3 className="mb-1 t-card-heading">How Many Schools Will You Sample?</h3>
        <p className="t-caption mb-4">Break down your sampling plan by product category. These are the schools you will give a free trial.</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="User schools" required error={errors.userSchoolsSampling} note="Existing buyers you will sample again."><NumberInput value={s.userSchoolsSampling} onChange={(v) => setS("userSchoolsSampling", v)} disabled={readOnly} /></Field>
          <Field label="Non-user schools" required error={errors.nonUserSchoolsSampling} note="New schools you will sample."><NumberInput value={s.nonUserSchoolsSampling} onChange={(v) => setS("nonUserSchoolsSampling", v)} disabled={readOnly} /></Field>
          <Field label="Test prep" required error={errors.testPrepSampling} note="Samples for test-prep products."><NumberInput value={s.testPrepSampling} onChange={(v) => setS("testPrepSampling", v)} disabled={readOnly} /></Field>
          <Field label="Early years" required error={errors.earlyYearsSampling} note="Samples for Early Years products."><NumberInput value={s.earlyYearsSampling} onChange={(v) => setS("earlyYearsSampling", v)} disabled={readOnly} /></Field>
          <Field label="Math & Science" required error={errors.msSampling} note="Samples for M&S products."><NumberInput value={s.msSampling} onChange={(v) => setS("msSampling", v)} disabled={readOnly} /></Field>
          <Field label="STEM" required error={errors.stemSampling} note="Samples for STEM products."><NumberInput value={s.stemSampling} onChange={(v) => setS("stemSampling", v)} disabled={readOnly} /></Field>
        </div>
      </Card>

      {/* 5. Bulk Deal Opportunities */}
      <Card>
        <h3 className="mb-1 t-card-heading">Bulk Deal Opportunities <span className="font-normal text-gray-400">· optional</span></h3>
        <p className="t-caption mb-4">Optional. Large one-time orders or institutional deals you plan to pursue.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Bulk deal opportunities" note="Optional. Number of big one-time orders you can chase.">
            <NumberInput value={u.bulkDealOpportunities} onChange={(v) => setU("bulkDealOpportunities", v)} disabled={readOnly} placeholder="Optional" />
          </Field>
          <Field label="Large distributor opportunities" note="Distributor orders above ₹40 lakhs.">
            <NumberInput value={u.largeInstitutionalOpportunities} onChange={(v) => setU("largeInstitutionalOpportunities", v)} disabled={readOnly} />
          </Field>
        </div>
      </Card>

      {/* 6. Training Section */}
      <Card>
        <h3 className="mb-1 t-card-heading">Trainings & Workshops <span className="font-normal text-gray-400">· optional</span></h3>
        <p className="t-caption mb-4">Optional. Training means teaching schools how to use our products well so they keep buying.</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="User school trainings" note="Sessions for schools that already buy."><NumberInput value={t.userSchoolTrainings} onChange={(v) => setT("userSchoolTrainings", v)} disabled={readOnly} placeholder="Optional" /></Field>
          <Field label="Non-user school trainings" note="Sessions for schools that don't buy yet."><NumberInput value={t.nonUserSchoolTrainings} onChange={(v) => setT("nonUserSchoolTrainings", v)} disabled={readOnly} placeholder="Optional" /></Field>
          <Field label="Digital trainings" note="Online sessions."><NumberInput value={t.digitalTrainings} onChange={(v) => setT("digitalTrainings", v)} disabled={readOnly} placeholder="Optional" /></Field>
          <Field label="Physical trainings" note="In-person sessions."><NumberInput value={t.physicalTrainings} onChange={(v) => setT("physicalTrainings", v)} disabled={readOnly} placeholder="Optional" /></Field>
          <Field label="Teacher workshops" note="Workshops for teachers."><NumberInput value={t.teacherWorkshops} onChange={(v) => setT("teacherWorkshops", v)} disabled={readOnly} placeholder="Optional" /></Field>
          <Field label="Principal workshops" note="Workshops for principals."><NumberInput value={t.principalWorkshops} onChange={(v) => setT("principalWorkshops", v)} disabled={readOnly} placeholder="Optional" /></Field>
          <Field label="STEM workshops" note="Workshops about STEM."><NumberInput value={t.stemWorkshops} onChange={(v) => setT("stemWorkshops", v)} disabled={readOnly} placeholder="Optional" /></Field>
          <Field label="Product demos" note="Live product demonstrations."><NumberInput value={t.productDemonstrations} onChange={(v) => setT("productDemonstrations", v)} disabled={readOnly} placeholder="Optional" /></Field>
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stage: Collections (enhanced with editable milestone phasing)
// ---------------------------------------------------------------------------

const MONTH_OPTIONS = [
  "Apr 2026", "May 2026", "Jun 2026", "Jul 2026", "Aug 2026", "Sep 2026",
  "Oct 2026", "Nov 2026", "Dec 2026", "Jan 2027", "Feb 2027", "Mar 2027",
  "Apr 2027", "May 2027", "Jun 2027",
];

export function CollectionStage({ aop, patch, readOnly }: { aop: Aop; patch: Patch; readOnly: boolean }) {
  const { users } = useStore();
  const owner = users.find((u) => u.id === aop.userId);
  const zone = zoneById(owner?.zoneId ?? "");
  const regionName = zone?.name;
  const phasing = collectionPhasingForZone(regionName);
  const target = aop.revenue.totalRevenueTarget;
  const totalToCollect = Number.isFinite(target) ? target : 0; // FULL revenue target
  const hasTarget = totalToCollect > 0;
  const rows = aop.collection.milestoneRows ?? [];

  // Re-compute amounts (% of the full revenue target) + running cumulative.
  const recalc = (rs: CollectionMilestoneRow[]): CollectionMilestoneRow[] => {
    let cum = 0;
    return rs.map((r) => {
      const pct = Number.isFinite(r.collectionPct) ? r.collectionPct : 0;
      const amt = Math.round((totalToCollect * pct) / 100);
      cum += amt;
      return { ...r, collectionAmount: amt, cumulativeAmount: cum };
    });
  };
  const commit = (rs: CollectionMilestoneRow[]) => patch("collection", { milestoneRows: recalc(rs) } as never);

  const addRow = () =>
    commit([...rows, { id: `cm-${Date.now()}`, month: "", collectionPct: NaN, collectionAmount: 0, cumulativeAmount: 0 }]);
  const updateRow = (idx: number, field: keyof CollectionMilestoneRow, value: string | number) =>
    commit(rows.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  const removeRow = (idx: number) => commit(rows.filter((_, i) => i !== idx));
  // Optional helper: prefill rows from the region's suggested cumulative curve.
  const loadSuggestion = () => {
    let prev = 0;
    commit(
      phasing.map((m, i) => {
        const inc = m.cumulativePct - prev;
        prev = m.cumulativePct;
        return { id: `cm-sug-${i}`, month: m.label, collectionPct: inc, collectionAmount: 0, cumulativeAmount: 0 };
      }),
    );
  };

  const totalPhasedPct = rows.reduce((s, r) => s + (Number.isFinite(r.collectionPct) ? r.collectionPct : 0), 0);
  const totalPhased = rows.reduce((s, r) => s + (r.collectionAmount || 0), 0);

  return (
    <div className="space-y-4">
      <Card>
        <StageIntro>
          Collection is the cash you bring in from your sales. You collect the
          <span className="font-semibold text-gray-700"> full revenue target</span> — add the
          months below and the % of that target you plan to collect by each.
        </StageIntro>
        <h3 className="mb-3 t-card-heading">Cash collection plan</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <KpiCard label="Revenue target" value={fmtINR(target)} accent="indigo" sub="from the Revenue step" />
          <KpiCard label="Total to collect" value={fmtINR(totalToCollect)} accent="emerald" sub="100% of the revenue target" />
        </div>
        {!hasTarget && (
          <p className="mt-3 text-[12px] text-amber-600">
            Set your Total revenue target in the Revenue step, then add collection milestones below.
          </p>
        )}
      </Card>

      {/* Custom, editable milestone lines */}
      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="t-card-heading">Collection Milestones</h3>
            <p className="t-caption mt-0.5">Add a line for each month and the % of the full revenue target collected by then. Amounts compute automatically.</p>
          </div>
          {!readOnly && (
            <div className="flex gap-2">
              {regionName && <Button size="sm" variant="ghost" onClick={loadSuggestion}>Use {regionName} suggestion</Button>}
              <Button size="sm" variant="outline" onClick={addRow}>+ Add line</Button>
            </div>
          )}
        </div>

        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50/50 px-4 py-8 text-center">
            <p className="text-[13px] text-gray-500">No milestones yet.</p>
            {!readOnly && (
              <Button size="sm" variant="outline" onClick={addRow} className="mt-3">Add first milestone</Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full min-w-[560px] text-left text-[13px]">
              <thead className="bg-gray-50/80 text-gray-500">
                <tr>
                  <th className="px-3 py-2 t-overline w-[160px]">Month</th>
                  <th className="px-3 py-2 t-overline">Collection %</th>
                  <th className="px-3 py-2 t-overline">Collection amount</th>
                  <th className="px-3 py-2 t-overline">Cumulative</th>
                  {!readOnly && <th className="px-3 py-2 t-overline w-[50px]"></th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={row.id} className="border-t border-gray-100">
                    <td className="px-3 py-2">
                      <Select value={row.month} onChange={(e) => updateRow(idx, "month", e.target.value)} disabled={readOnly}>
                        <option value="">Select month</option>
                        {MONTH_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
                      </Select>
                    </td>
                    <td className="px-3 py-2">
                      <NumberInput value={row.collectionPct} onChange={(v) => updateRow(idx, "collectionPct", v)} disabled={readOnly} placeholder="%" />
                    </td>
                    <td className="px-3 py-2 tabular-nums font-medium text-gray-900">{fmtINR(row.collectionAmount)}</td>
                    <td className="px-3 py-2 tabular-nums font-semibold text-gray-900">{fmtINR(row.cumulativeAmount)}</td>
                    {!readOnly && (
                      <td className="px-3 py-2">
                        <button onClick={() => removeRow(idx)} className="text-[12px] font-medium text-rose-500 hover:text-rose-700" aria-label="Remove">✕</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {rows.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-4 text-[12px] text-gray-500">
            <span>Phased: <span className={`font-semibold ${Math.round(totalPhasedPct) > 100 ? "text-rose-600" : "text-gray-900"}`}>{fmtNum(totalPhasedPct)}%</span> of target</span>
            <span>Total phased: <span className="font-semibold text-gray-900">{fmtINR(totalPhased)}</span> / {fmtINR(totalToCollect)}</span>
          </div>
        )}
      </Card>
    </div>
  );
}
