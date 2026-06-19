"use client";

import React, { useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Aop, CollectionMilestoneRow } from "@/lib/types";
import {
  AutoStat,
  Button,
  Card,
  Field,
  NumberInput,
  Select,
  Stat,
} from "@/components/ui";
import {
  collectionPhasingForZone,
  computeCollection,
  computeRevenueKpis,
  computeSamplingKpis,
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
    const lyParts = [
      r.earlyYearsRevenueLY,
      r.mathScienceRevenueLY,
      r.otherCategoriesRevenueLY,
      r.stemRevenueLY,
      r.panelRevenueLY,
    ];
    const lyTotal = lyParts.reduce((s, n) => s + n, 0) || 1;
    const t = r.totalRevenueTarget;
    patch("revenue", {
      earlyYearsTarget: Math.round((t * lyParts[0]) / lyTotal),
      mathScienceTarget: Math.round((t * lyParts[1]) / lyTotal),
      otherCategoriesTarget: Math.round((t * lyParts[2]) / lyTotal),
      stemTarget: Math.round((t * lyParts[3]) / lyTotal),
      panelTarget: Math.round((t * lyParts[4]) / lyTotal),
    } as never);
  };

  return (
    <div className="space-y-4">
      {/* Frozen / Read-only section — sticky single-line at top */}
      <div className="sticky top-0 z-10">
        <Card className="border-amber-200/60 bg-amber-50/20 shadow-sm">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-amber-500 text-sm">🔒</span>
            <h3 className="text-[13px] font-semibold text-amber-800">Last Year Actuals</h3>
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600">Frozen</span>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-[12.5px]">
            <span className="text-gray-500">Revenue: <span className="font-semibold text-gray-900">{fmtINR(r.lastYearRevenue)}</span></span>
            <span className="text-gray-500">Early Years: <span className="font-semibold text-gray-900">{fmtINR(r.earlyYearsRevenueLY)}</span></span>
            <span className="text-gray-500">Math & Science: <span className="font-semibold text-gray-900">{fmtINR(r.mathScienceRevenueLY)}</span></span>
            <span className="text-gray-500">Other: <span className="font-semibold text-gray-900">{fmtINR(r.otherCategoriesRevenueLY)}</span></span>
            <span className="text-gray-500">AOV: <span className="font-semibold text-gray-900">{fmtINR(r.currentAov)}</span></span>
          </div>
        </Card>
      </div>

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
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Total revenue target" hint="INR" error={errors.totalRevenueTarget}
            note="The big number: total money you plan to earn this year.">
            <NumberInput value={r.totalRevenueTarget} onChange={(v) => set("totalRevenueTarget", v)} disabled={readOnly} />
          </Field>
          <Field label="Early years target" hint="INR" note="Part of the total that comes from Early Years products.">
            <NumberInput value={r.earlyYearsTarget} onChange={(v) => set("earlyYearsTarget", v)} disabled={readOnly} />
          </Field>
          <Field label="Math & Science target" hint="INR" note="Part of the total from Math & Science products.">
            <NumberInput value={r.mathScienceTarget} onChange={(v) => set("mathScienceTarget", v)} disabled={readOnly} />
          </Field>
          <Field label="Other categories target" hint="INR" note="Part of the total from all other products.">
            <NumberInput value={r.otherCategoriesTarget} onChange={(v) => set("otherCategoriesTarget", v)} disabled={readOnly} />
          </Field>
          <Field label="STEM target" hint="INR" note="Part of the total from STEM products.">
            <NumberInput value={r.stemTarget} onChange={(v) => set("stemTarget", v)} disabled={readOnly} />
          </Field>
          <Field label="Panel target" hint="INR" note="Part of the total from Panel products.">
            <NumberInput value={r.panelTarget} onChange={(v) => set("panelTarget", v)} disabled={readOnly} />
          </Field>
        </div>
        <p className="mt-3 text-[11.5px] text-gray-400">Tip: the five category targets should add up to the total above. Use Auto-split to fill them instantly.</p>
      </Card>

      <Card>
        <h3 className="mb-1 t-card-heading">Average Order Value (AOV)</h3>
        <p className="t-caption mb-4">AOV = Total Revenue from Schools ÷ Unique School Count (excludes bulk orders).</p>
        <div className="grid gap-5 sm:grid-cols-2">
          <FrozenCard label="Current AOV" value={fmtINR(r.currentAov)} note="Calculated from school revenue data." />
          <Field label="Target AOV" hint="INR" note="How big you want the average order to be.">
            <NumberInput value={r.targetAov} onChange={(v) => set("targetAov", v)} disabled={readOnly} />
          </Field>
        </div>
      </Card>

      <Card>
        <h3 className="mb-4 t-card-heading">Live numbers (calculated for you)</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Revenue growth" value={fmtPct(k.revenueGrowthPct)} tone={k.revenueGrowthPct >= 0 ? "green" : "red"} sub="vs last year" />
          <Stat label="AOV growth" value={fmtPct(k.aovGrowthPct)} sub="bigger orders" />
          <Stat label="Category sum" value={fmtINR(k.categorySumTarget)} sub="5 categories added" />
          <Stat
            label="Sum vs total"
            value={fmtINR(k.categoryMismatch)}
            tone={Math.abs(k.categoryMismatch) > 1 ? "red" : "green"}
            sub={Math.abs(k.categoryMismatch) > 1 ? "Should be 0" : "Balanced"}
          />
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stage: Universe (merged with Sampling & Training)
// ---------------------------------------------------------------------------
export function UniverseStage({ aop, patch, readOnly }: StageProps) {
  const u = aop.universe;
  const s = aop.sampling;
  const t = aop.training;
  const k = computeUniverseKpis(u);
  const sk = computeSamplingKpis(s, u);

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
      {/* 1. Schools In Your Area Today — sticky, compact single line */}
      <div className="sticky top-0 z-10">
        <Card className="border-amber-200/60 bg-amber-50/40 shadow-sm">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-amber-500 text-sm">🔒</span>
              <h3 className="text-[13px] font-semibold text-amber-800">Schools In Your Area Today</h3>
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600">Read Only</span>
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[12.5px]">
              <span className="text-gray-500">Total: <span className="font-semibold text-gray-900">{fmtNum(u.totalSchools)}</span></span>
              <span className="text-gray-500">Active: <span className="font-semibold text-gray-900">{fmtNum(u.activeSchools)}</span></span>
              <span className="text-gray-500">User: <span className="font-semibold text-gray-900">{fmtNum(u.userSchools)}</span></span>
              <span className="text-gray-500">Non-user: <span className="font-semibold text-gray-900">{fmtNum(u.nonUserSchools)}</span></span>
            </div>
          </div>
        </Card>
      </div>

      {/* 2. Retention */}
      <Card>
        <h3 className="mb-1 t-card-heading">Retention</h3>
        <p className="t-caption mb-4">How many schools will you retain and at what value?</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Retention school count" note="Number of schools you will retain from current active schools.">
            <NumberInput value={u.retentionSchoolCount ?? 0} onChange={(v) => setU("retentionSchoolCount", v)} disabled={readOnly} />
          </Field>
          <Field label="Retention school value" hint="INR" note="Total revenue you expect from retained schools.">
            <NumberInput value={u.retentionPlanValue ?? 0} onChange={(v) => setU("retentionPlanValue", v)} disabled={readOnly} />
          </Field>
        </div>
      </Card>

      {/* 3. School Type Table */}
      <Card>
        <h3 className="mb-1 t-card-heading">School Types</h3>
        <p className="t-caption mb-4">For each type, set target schools, sampling schools, and conversion schools (actual counts).</p>
        <div className="space-y-2">
          {/* Header row */}
          <div className="hidden grid-cols-5 gap-2 px-1 sm:grid">
            <span className="t-overline">Type</span>
            <span className="t-overline">Active Schools</span>
            <span className="t-overline">Target Schools</span>
            <span className="t-overline">Sampling Schools</span>
            <span className="t-overline">Conversion Schools</span>
          </div>
          {u.categories.map((c, idx) => (
            <div key={c.category} className="grid grid-cols-2 gap-2 rounded-lg border border-gray-200 bg-gray-50/60 p-2.5 sm:grid-cols-5">
              <div className="col-span-2 flex items-center gap-1 self-center text-[13px] font-medium text-gray-900 sm:col-span-1">
                {c.category}
                <InfoTooltip text={CATEGORY_DEFINITIONS[c.category] ?? `School category: ${c.category}`} />
              </div>
              {/* Frozen current count */}
              <div className="self-center">
                <div className="flex items-center gap-1 sm:hidden"><span className="t-overline text-[10px]">Now:</span></div>
                <NumberInput value={c.currentCount} onChange={() => {}} disabled />
              </div>
              {/* Target Schools — editable */}
              <div>
                <div className="flex items-center gap-1 sm:hidden"><span className="t-overline text-[10px]">Target:</span></div>
                <NumberInput value={c.targetCount} onChange={(v) => setCat(idx, "targetCount", v)} disabled={readOnly} placeholder="Target" />
              </div>
              {/* Sampling Schools — editable */}
              <div>
                <div className="flex items-center gap-1 sm:hidden"><span className="t-overline text-[10px]">Sampling:</span></div>
                <NumberInput value={c.samplingCount} onChange={(v) => setCat(idx, "samplingCount", v)} disabled={readOnly} placeholder="Sampling" />
              </div>
              {/* Conversion Schools — editable (actual count) */}
              <div>
                <div className="flex items-center gap-1 sm:hidden"><span className="t-overline text-[10px]">Conversion:</span></div>
                <NumberInput value={c.conversionCount} onChange={(v) => setCat(idx, "conversionCount", v)} disabled={readOnly} placeholder="Count" />
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
          <Field label="User schools" note="Existing buyers you will sample again."><NumberInput value={s.userSchoolsSampling} onChange={(v) => setS("userSchoolsSampling", v)} disabled={readOnly} /></Field>
          <Field label="Non-user schools" note="New schools you will sample."><NumberInput value={s.nonUserSchoolsSampling} onChange={(v) => setS("nonUserSchoolsSampling", v)} disabled={readOnly} /></Field>
          <Field label="Test prep" note="Samples for test-prep products."><NumberInput value={s.testPrepSampling} onChange={(v) => setS("testPrepSampling", v)} disabled={readOnly} /></Field>
          <Field label="Early years" note="Samples for Early Years products."><NumberInput value={s.earlyYearsSampling} onChange={(v) => setS("earlyYearsSampling", v)} disabled={readOnly} /></Field>
          <Field label="Math & Science" note="Samples for M&S products."><NumberInput value={s.msSampling} onChange={(v) => setS("msSampling", v)} disabled={readOnly} /></Field>
          <Field label="STEM" note="Samples for STEM products."><NumberInput value={s.stemSampling} onChange={(v) => setS("stemSampling", v)} disabled={readOnly} /></Field>
        </div>
      </Card>

      {/* 5. Bulk Deal Opportunities */}
      <Card>
        <h3 className="mb-1 t-card-heading">Bulk Deal Opportunities</h3>
        <p className="t-caption mb-4">Large one-time orders or institutional deals you plan to pursue.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Bulk deal opportunities" note="Number of big one-time orders you can chase.">
            <NumberInput value={u.bulkDealOpportunities} onChange={(v) => setU("bulkDealOpportunities", v)} disabled={readOnly} />
          </Field>
          <Field label="Large distributor opportunities" note="Distributor orders above ₹40 lakhs.">
            <NumberInput value={u.largeInstitutionalOpportunities} onChange={(v) => setU("largeInstitutionalOpportunities", v)} disabled={readOnly} />
          </Field>
        </div>
      </Card>

      {/* 6. Training Section */}
      <Card>
        <h3 className="mb-1 t-card-heading">Trainings & Workshops</h3>
        <p className="t-caption mb-4">Training means teaching schools how to use our products well so they keep buying.</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="User school trainings" note="Sessions for schools that already buy."><NumberInput value={t.userSchoolTrainings} onChange={(v) => setT("userSchoolTrainings", v)} disabled={readOnly} /></Field>
          <Field label="Non-user school trainings" note="Sessions for schools that don't buy yet."><NumberInput value={t.nonUserSchoolTrainings} onChange={(v) => setT("nonUserSchoolTrainings", v)} disabled={readOnly} /></Field>
          <Field label="Digital trainings" note="Online sessions."><NumberInput value={t.digitalTrainings} onChange={(v) => setT("digitalTrainings", v)} disabled={readOnly} /></Field>
          <Field label="Physical trainings" note="In-person sessions."><NumberInput value={t.physicalTrainings} onChange={(v) => setT("physicalTrainings", v)} disabled={readOnly} /></Field>
          <Field label="Teacher workshops" note="Workshops for teachers."><NumberInput value={t.teacherWorkshops} onChange={(v) => setT("teacherWorkshops", v)} disabled={readOnly} /></Field>
          <Field label="Principal workshops" note="Workshops for principals."><NumberInput value={t.principalWorkshops} onChange={(v) => setT("principalWorkshops", v)} disabled={readOnly} /></Field>
          <Field label="STEM workshops" note="Workshops about STEM."><NumberInput value={t.stemWorkshops} onChange={(v) => setT("stemWorkshops", v)} disabled={readOnly} /></Field>
          <Field label="Product demos" note="Live product demonstrations."><NumberInput value={t.productDemonstrations} onChange={(v) => setT("productDemonstrations", v)} disabled={readOnly} /></Field>
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
  const pct = aop.collection.collectionPercent;
  const target = aop.revenue.totalRevenueTarget;
  const c = computeCollection(target, pct, phasing);

  const rows = aop.collection.milestoneRows ?? [];

  const totalCollectionTarget = c.totalCollectionTarget;

  const recalcRows = (updatedRows: CollectionMilestoneRow[]): CollectionMilestoneRow[] => {
    let cumulative = 0;
    return updatedRows.map((row) => {
      const amt = Math.round((totalCollectionTarget * row.collectionPct) / 100);
      cumulative += amt;
      return { ...row, collectionAmount: amt, cumulativeAmount: cumulative };
    });
  };

  const addRow = () => {
    const newRow: CollectionMilestoneRow = {
      id: `cm-${Date.now()}`,
      month: "",
      collectionPct: 0,
      collectionAmount: 0,
      cumulativeAmount: 0,
    };
    const updated = recalcRows([...rows, newRow]);
    patch("collection", { milestoneRows: updated } as never);
  };

  const updateRow = (idx: number, field: keyof CollectionMilestoneRow, value: string | number) => {
    const updatedRows = rows.map((r, i) => (i === idx ? { ...r, [field]: value } : r));
    const recalced = recalcRows(updatedRows);
    patch("collection", { milestoneRows: recalced } as never);
  };

  const removeRow = (idx: number) => {
    const updatedRows = rows.filter((_, i) => i !== idx);
    const recalced = recalcRows(updatedRows);
    patch("collection", { milestoneRows: recalced } as never);
  };

  return (
    <div className="space-y-4">
      <Card>
        <StageIntro>
          Collection means the cash you actually bring in from your sales.
          The summary below is pre-fetched for your region —
          <span className="font-semibold text-gray-700">
            {" "}{regionName ?? "your region"}
          </span>.
        </StageIntro>
        <h3 className="mb-1 t-card-heading">Cash collection plan</h3>
        <p className="t-caption mb-4">Region · {regionName ?? "Unmapped"} · {phasing.length} default milestones</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <AutoStat label="Region collection %" value={`${pct}%`} note="Annual collection share for this region." />
          <AutoStat label="Revenue target" value={fmtINR(target)} note="From the Revenue step." />
          <AutoStat label="Total to collect" value={fmtINR(c.totalCollectionTarget)} note={`${pct}% of revenue target.`} />
        </div>
        {target === 0 && (
          <p className="mt-3 text-[12px] text-amber-600">
            Set your Total revenue target in the Revenue step and these numbers will fill in.
          </p>
        )}
      </Card>

      {/* Editable Milestone Phasing */}
      <Card>
        <div className="mb-4 flex items-center justify-between gap-2">
          <div>
            <h3 className="t-card-heading">Milestone Phasing</h3>
            <p className="t-caption mt-0.5">Plan when you will collect cash through the year. Add rows for each milestone.</p>
          </div>
          {!readOnly && (
            <Button size="sm" variant="outline" onClick={addRow}>
              + Add Row
            </Button>
          )}
        </div>

        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50/50 px-4 py-8 text-center">
            <p className="text-[13px] text-gray-500">No milestones added yet.</p>
            {!readOnly && (
              <Button size="sm" variant="outline" onClick={addRow} className="mt-3">
                Add first milestone
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full min-w-[520px] text-left text-[13px]">
              <thead className="bg-gray-50/80 text-gray-500">
                <tr>
                  <th className="px-3 py-2 t-overline w-[160px]">Month</th>
                  <th className="px-3 py-2 t-overline">Collection %</th>
                  <th className="px-3 py-2 t-overline">Collection Amount</th>
                  <th className="px-3 py-2 t-overline">Cumulative Amount</th>
                  {!readOnly && <th className="px-3 py-2 t-overline w-[60px]"></th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={row.id} className="border-t border-gray-100">
                    <td className="px-3 py-2">
                      <Select
                        value={row.month}
                        onChange={(e) => updateRow(idx, "month", e.target.value)}
                        disabled={readOnly}
                      >
                        <option value="">Select month</option>
                        {MONTH_OPTIONS.map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </Select>
                    </td>
                    <td className="px-3 py-2">
                      <NumberInput
                        value={row.collectionPct}
                        onChange={(v) => updateRow(idx, "collectionPct", v)}
                        disabled={readOnly}
                        placeholder="%"
                      />
                    </td>
                    <td className="px-3 py-2 tabular-nums font-medium text-gray-900">
                      {fmtINR(row.collectionAmount)}
                    </td>
                    <td className="px-3 py-2 tabular-nums font-semibold text-gray-900">
                      {fmtINR(row.cumulativeAmount)}
                    </td>
                    {!readOnly && (
                      <td className="px-3 py-2">
                        <button
                          onClick={() => removeRow(idx)}
                          className="text-[12px] text-rose-500 hover:text-rose-700 font-medium"
                          aria-label="Remove row"
                        >
                          ✕
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {rows.length > 0 && (
          <div className="mt-3 flex items-center gap-4 text-[12px] text-gray-500">
            <span>Total phased: <span className="font-semibold text-gray-900">{fmtINR(rows.reduce((s, r) => s + r.collectionAmount, 0))}</span></span>
            <span>Total to collect: <span className="font-semibold text-gray-900">{fmtINR(totalCollectionTarget)}</span></span>
          </div>
        )}
      </Card>

      {/* Default regional milestones (reference) */}
      <Card>
        <h3 className="mb-1 t-card-heading">Regional Milestone Reference</h3>
        <p className="t-caption mb-3">Default milestones from the region master table for reference.</p>
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full min-w-[420px] text-left text-[13px]">
            <thead className="bg-gray-50/80 text-gray-500">
              <tr>
                <th className="px-3 py-2 t-overline">Milestone</th>
                <th className="px-3 py-2 t-overline">Collection %</th>
                <th className="px-3 py-2 t-overline">Cumulative amount</th>
              </tr>
            </thead>
            <tbody>
              {c.milestones.map((m) => (
                <tr key={m.label} className="border-t border-gray-100">
                  <td className="px-3 py-2 font-medium text-gray-900">{m.label}</td>
                  <td className="px-3 py-2 tabular-nums text-gray-700">{m.cumulativePct}%</td>
                  <td className="px-3 py-2 tabular-nums text-gray-900">{fmtINR(m.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
