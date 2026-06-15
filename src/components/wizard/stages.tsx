"use client";

import React from "react";
import type { Aop } from "@/lib/types";
import {
  AutoStat,
  Button,
  Card,
  Field,
  NumberInput,
  Select,
  Stat,
  TextArea,
  TextInput,
} from "@/components/ui";
import {
  computeCollection,
  computeInvestmentKpis,
  computeRevenueKpis,
  computeSamplingKpis,
  computeTrainingKpis,
  computeUniverseKpis,
  fmtINR,
  fmtNum,
  fmtPct,
} from "@/lib/calc";

export type Patch = <K extends keyof Aop>(section: K, value: Partial<Aop[K]>) => void;

interface StageProps {
  aop: Aop;
  patch: Patch;
  errors: Record<string, string>;
  readOnly: boolean;
}

function ReadOnlyCard({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-3">
      <div className="t-overline">{label}</div>
      <div className="mt-1 text-base font-semibold tracking-tight text-gray-900">{value}</div>
      {note && <div className="mt-0.5 text-[11.5px] leading-snug text-gray-400">{note}</div>}
    </div>
  );
}

function StageIntro({ children }: { children: React.ReactNode }) {
  return <p className="mb-4 rounded-lg bg-indigo-50/50 px-3.5 py-2.5 text-[13px] leading-relaxed text-gray-600">{children}</p>;
}

// ---------------------------------------------------------------------------
// Stage 2: Revenue
// ---------------------------------------------------------------------------
export function RevenueStage({ aop, patch, errors, readOnly }: StageProps) {
  const r = aop.revenue;
  const k = computeRevenueKpis(r);
  const set = (field: keyof typeof r, v: number) => patch("revenue", { [field]: v } as never);

  // Auto-split the total target across categories using last year's mix.
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
      <Card>
        <StageIntro>Set how much money you want to make this year. The grey cards show last year so you have a starting point.</StageIntro>
        <h3 className="mb-4 t-card-heading">Last year (read-only)</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <ReadOnlyCard label="Last year revenue" value={fmtINR(r.lastYearRevenue)} />
          <ReadOnlyCard label="Early years" value={fmtINR(r.earlyYearsRevenueLY)} />
          <ReadOnlyCard label="Math & Science" value={fmtINR(r.mathScienceRevenueLY)} />
          <ReadOnlyCard label="Other categories" value={fmtINR(r.otherCategoriesRevenueLY)} />
          <ReadOnlyCard label="STEM" value={fmtINR(r.stemRevenueLY)} />
          <ReadOnlyCard label="Panel" value={fmtINR(r.panelRevenueLY)} />
        </div>
      </Card>

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
        <h3 className="mb-4 t-card-heading">Order size & per-school value</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <ReadOnlyCard label="Current AOV" value={fmtINR(r.currentAov)} note="Average size of one order today." />
          <Field label="Target AOV" hint="INR" note="How big you want the average order to be. Pre-filled to today's level.">
            <NumberInput value={r.targetAov} onChange={(v) => set("targetAov", v)} disabled={readOnly} />
          </Field>
          <ReadOnlyCard label="Current revenue / school" value={fmtINR(r.currentRevenuePerSchool)} note="Money each school gives today." />
          <Field label="Target revenue / school" hint="INR" note="Money you want from each school. Pre-filled to today's level.">
            <NumberInput value={r.targetRevenuePerSchool} onChange={(v) => set("targetRevenuePerSchool", v)} disabled={readOnly} />
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
// Stage 3: Universe
// ---------------------------------------------------------------------------
export function UniverseStage({ aop, patch, readOnly }: StageProps) {
  const u = aop.universe;
  const k = computeUniverseKpis(u);
  const set = (field: keyof typeof u, v: number | string | boolean) =>
    patch("universe", { [field]: v } as never);
  const setCat = (idx: number, field: string, v: number) => {
    const categories = u.categories.map((c, i) => (i === idx ? { ...c, [field]: v } : c));
    patch("universe", { categories });
  };

  return (
    <div className="space-y-4">
      <Card>
        <StageIntro>Describe the schools in your area: how many there are, how many already buy from us, and how many do not yet.</StageIntro>
        <h3 className="mb-4 t-card-heading">Schools in your area today</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Total schools" note="Every school in your area.">
            <NumberInput value={u.totalSchools} onChange={(v) => set("totalSchools", v)} disabled={readOnly} />
          </Field>
          <Field label="Active schools" note="Schools you are currently working with.">
            <NumberInput value={u.activeSchools} onChange={(v) => set("activeSchools", v)} disabled={readOnly} />
          </Field>
          <Field label="User schools" note="Schools that already buy our products.">
            <NumberInput value={u.userSchools} onChange={(v) => set("userSchools", v)} disabled={readOnly} />
          </Field>
          <Field label="Non-user schools" note="Schools that do not buy from us yet.">
            <NumberInput value={u.nonUserSchools} onChange={(v) => set("nonUserSchools", v)} disabled={readOnly} />
          </Field>
        </div>
      </Card>

      <Card>
        <h3 className="mb-1 t-card-heading">School types</h3>
        <p className="t-caption mb-4">For each type, how many you have now and how many you want by year-end.</p>
        <div className="space-y-2">
          <div className="hidden grid-cols-5 gap-2 px-1 sm:grid">
            <span className="t-overline">Type</span><span className="t-overline">Now</span><span className="t-overline">Target</span><span className="t-overline">Exp. revenue</span><span className="t-overline">Exp. conv %</span>
          </div>
          {u.categories.map((c, idx) => (
            <div key={c.category} className="grid grid-cols-2 gap-2 rounded-lg border border-gray-200 bg-gray-50/60 p-2.5 sm:grid-cols-5">
              <div className="col-span-2 self-center text-[13px] font-medium text-gray-900 sm:col-span-1">{c.category}</div>
              <NumberInput value={c.currentCount} onChange={(v) => setCat(idx, "currentCount", v)} disabled={readOnly} />
              <NumberInput value={c.targetCount} onChange={(v) => setCat(idx, "targetCount", v)} disabled={readOnly} />
              <NumberInput value={c.projectedRevenue} onChange={(v) => setCat(idx, "projectedRevenue", v)} disabled={readOnly} />
              <NumberInput value={c.projectedConversion} onChange={(v) => setCat(idx, "projectedConversion", v)} disabled={readOnly} />
            </div>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Schools now" value={fmtNum(k.currentTotalFromCategories)} />
          <Stat label="Schools target" value={fmtNum(k.targetTotalFromCategories)} />
          <Stat label="School growth" value={fmtPct(k.schoolGrowthPct)} tone="green" />
          <Stat label="Exp. revenue" value={fmtINR(k.projectedCategoryRevenue)} />
        </div>
      </Card>

      <Card>
        <h3 className="mb-4 t-card-heading">Growth plans</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Active school addition plan" note="How many sleeping schools you will wake up this year.">
            <NumberInput value={u.activeSchoolAdditionPlan} onChange={(v) => set("activeSchoolAdditionPlan", v)} disabled={readOnly} />
          </Field>
          <Field label="New school acquisition plan" note="How many brand-new schools you will win.">
            <NumberInput value={u.newSchoolAcquisitionPlan} onChange={(v) => set("newSchoolAcquisitionPlan", v)} disabled={readOnly} />
          </Field>
          <Field label="Retention plan %" note="Out of 100 current schools, how many you will keep. Pre-filled to 85.">
            <NumberInput value={u.retentionPlan} onChange={(v) => set("retentionPlan", v)} disabled={readOnly} />
          </Field>
          <Field label="Bulk deal opportunities" note="Number of big one-time orders you can chase.">
            <NumberInput value={u.bulkDealOpportunities} onChange={(v) => set("bulkDealOpportunities", v)} disabled={readOnly} />
          </Field>
          <Field label="Key account plan" note="In one line: how you will grow your most important schools.">
            <TextArea value={u.keyAccountPlan} onChange={(e) => set("keyAccountPlan", e.target.value)} disabled={readOnly} />
          </Field>
          <Field label="Chain school expansion plan" note="How you will grow within school chains.">
            <TextArea value={u.chainSchoolExpansionPlan} onChange={(e) => set("chainSchoolExpansionPlan", e.target.value)} disabled={readOnly} />
          </Field>
        </div>
      </Card>

      <Card>
        <h3 className="mb-1 t-card-heading">Distributors</h3>
        <p className="t-caption mb-4">The partners who help deliver our products to schools.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Existing distributor" note="Name of the partner you work with today.">
            <TextInput value={u.existingDistributor} onChange={(e) => set("existingDistributor", e.target.value)} disabled={readOnly} />
          </Field>
          <Field label="Need a new distributor?" note="Choose Yes if you need another partner.">
            <Select
              value={u.newDistributorRequired ? "yes" : "no"}
              onChange={(e) => set("newDistributorRequired", e.target.value === "yes")}
              disabled={readOnly}
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </Select>
          </Field>
          <Field label="Large institutional opportunities" note="Number of big institutions (not normal schools) you can target.">
            <NumberInput value={u.largeInstitutionalOpportunities} onChange={(v) => set("largeInstitutionalOpportunities", v)} disabled={readOnly} />
          </Field>
          <Field label="Strategic distributor opportunity" note="One line on any special distributor chance.">
            <TextArea value={u.strategicDistributorOpportunity} onChange={(e) => set("strategicDistributorOpportunity", e.target.value)} disabled={readOnly} />
          </Field>
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stage 4: Sampling & Conversion
// ---------------------------------------------------------------------------
export function SamplingStage({ aop, patch, readOnly }: StageProps) {
  const s = aop.sampling;
  const k = computeSamplingKpis(s, aop.universe);
  const set = (field: keyof typeof s, v: number) => patch("sampling", { [field]: v } as never);

  return (
    <div className="space-y-4">
      <Card>
        <StageIntro>Sampling means giving schools a free trial of our product. Enter how many schools you will sample, then how many you expect to start buying.</StageIntro>
        <h3 className="mb-4 t-card-heading">How many schools will you sample?</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="User schools" note="Existing buyers you will sample again."><NumberInput value={s.userSchoolsSampling} onChange={(v) => set("userSchoolsSampling", v)} disabled={readOnly} /></Field>
          <Field label="Non-user schools" note="New schools you will sample."><NumberInput value={s.nonUserSchoolsSampling} onChange={(v) => set("nonUserSchoolsSampling", v)} disabled={readOnly} /></Field>
          <Field label="Test prep" note="Samples for test-prep products."><NumberInput value={s.testPrepSampling} onChange={(v) => set("testPrepSampling", v)} disabled={readOnly} /></Field>
          <Field label="Early years" note="Samples for Early Years products."><NumberInput value={s.earlyYearsSampling} onChange={(v) => set("earlyYearsSampling", v)} disabled={readOnly} /></Field>
          <Field label="Math & Science" note="Samples for M&S products."><NumberInput value={s.msSampling} onChange={(v) => set("msSampling", v)} disabled={readOnly} /></Field>
          <Field label="STEM" note="Samples for STEM products."><NumberInput value={s.stemSampling} onChange={(v) => set("stemSampling", v)} disabled={readOnly} /></Field>
          <Field label="Panel" note="Samples for Panel products."><NumberInput value={s.panelSampling} onChange={(v) => set("panelSampling", v)} disabled={readOnly} /></Field>
          <Field label="Cost per sample" hint="INR" note="What one free trial costs us. Pre-filled, change if needed."><NumberInput value={s.costPerSample} onChange={(v) => set("costPerSample", v)} disabled={readOnly} /></Field>
          <Field label="Unique factor (0-1)" note="Some schools get many samples. 0.7 = 70% are unique. Pre-filled."><NumberInput value={s.uniqueSamplingFactor} step="0.05" onChange={(v) => set("uniqueSamplingFactor", v)} disabled={readOnly} /></Field>
        </div>
      </Card>

      <Card>
        <h3 className="mb-4 t-card-heading">How many will start buying?</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="User school conversion %" note="Out of 100 existing buyers sampled, how many order again."><NumberInput value={s.userSchoolConversion} onChange={(v) => set("userSchoolConversion", v)} disabled={readOnly} /></Field>
          <Field label="Non-user conversion %" note="Out of 100 new schools sampled, how many start buying."><NumberInput value={s.nonUserSchoolConversion} onChange={(v) => set("nonUserSchoolConversion", v)} disabled={readOnly} /></Field>
          <Field label="Revenue from sampling" hint="INR" note="Money you expect sampling to bring in."><NumberInput value={s.samplingToRevenueEstimate} onChange={(v) => set("samplingToRevenueEstimate", v)} disabled={readOnly} /></Field>
          <Field label="Orders from sampling" note="Number of orders you expect from sampling."><NumberInput value={s.samplingToOrdersEstimate} onChange={(v) => set("samplingToOrdersEstimate", v)} disabled={readOnly} /></Field>
          <Field label="New schools from sampling" note="New schools you expect to win through sampling."><NumberInput value={s.samplingToNewSchoolsEstimate} onChange={(v) => set("samplingToNewSchoolsEstimate", v)} disabled={readOnly} /></Field>
        </div>
      </Card>

      <Card>
        <h3 className="mb-4 t-card-heading">Calculated for you</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Stat label="Total samples" value={fmtNum(k.totalSamplingSchools)} sub="all streams added" />
          <Stat label="Unique schools" value={fmtNum(k.uniqueSamplingSchools)} sub="after dedup" />
          <Stat label="Sampling cost" value={fmtINR(k.samplingCost)} sub="samples × cost" />
          <Stat label="Cost / conversion" value={fmtINR(k.costPerConversion)} sub="cost to win one" />
          <Stat label="Revenue / sample" value={fmtINR(k.revenuePerSample)} />
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stage 5: Training
// ---------------------------------------------------------------------------
export function TrainingStage({ aop, patch, readOnly }: StageProps) {
  const t = aop.training;
  const k = computeTrainingKpis(t, aop.universe);
  const set = (field: keyof typeof t, v: number) => patch("training", { [field]: v } as never);

  return (
    <div className="space-y-4">
      <Card>
        <StageIntro>Training means teaching schools how to use our products well so they keep buying. Enter how many sessions you will run.</StageIntro>
        <h3 className="mb-4 t-card-heading">Trainings & workshops</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="User school trainings" note="Sessions for schools that already buy."><NumberInput value={t.userSchoolTrainings} onChange={(v) => set("userSchoolTrainings", v)} disabled={readOnly} /></Field>
          <Field label="Non-user school trainings" note="Sessions for schools that don't buy yet."><NumberInput value={t.nonUserSchoolTrainings} onChange={(v) => set("nonUserSchoolTrainings", v)} disabled={readOnly} /></Field>
          <Field label="Digital trainings" note="Online sessions."><NumberInput value={t.digitalTrainings} onChange={(v) => set("digitalTrainings", v)} disabled={readOnly} /></Field>
          <Field label="Physical trainings" note="In-person sessions."><NumberInput value={t.physicalTrainings} onChange={(v) => set("physicalTrainings", v)} disabled={readOnly} /></Field>
          <Field label="Teacher workshops" note="Workshops for teachers."><NumberInput value={t.teacherWorkshops} onChange={(v) => set("teacherWorkshops", v)} disabled={readOnly} /></Field>
          <Field label="Principal workshops" note="Workshops for principals."><NumberInput value={t.principalWorkshops} onChange={(v) => set("principalWorkshops", v)} disabled={readOnly} /></Field>
          <Field label="STEM workshops" note="Workshops about STEM."><NumberInput value={t.stemWorkshops} onChange={(v) => set("stemWorkshops", v)} disabled={readOnly} /></Field>
          <Field label="Product demos" note="Live product demonstrations."><NumberInput value={t.productDemonstrations} onChange={(v) => set("productDemonstrations", v)} disabled={readOnly} /></Field>
        </div>
      </Card>

      <Card>
        <h3 className="mb-4 t-card-heading">Assumptions</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Cost per training" hint="INR" note="What one session costs. Pre-filled."><NumberInput value={t.costPerTraining} onChange={(v) => set("costPerTraining", v)} disabled={readOnly} /></Field>
          <Field label="Participants per training" note="People who attend one session. Pre-filled."><NumberInput value={t.participantsPerTraining} onChange={(v) => set("participantsPerTraining", v)} disabled={readOnly} /></Field>
          <Field label="Expected revenue impact" hint="INR" note="Extra money you expect training to bring."><NumberInput value={t.expectedRevenueImpact} onChange={(v) => set("expectedRevenueImpact", v)} disabled={readOnly} /></Field>
        </div>
      </Card>

      <Card>
        <h3 className="mb-4 t-card-heading">Calculated for you</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Stat label="Total trainings" value={fmtNum(k.totalTrainings)} sub="all added" />
          <Stat label="Training cost" value={fmtINR(k.trainingCost)} sub="count × cost" />
          <Stat label="Cost / school" value={fmtINR(k.costPerSchool)} />
          <Stat label="Participants" value={fmtNum(k.totalParticipants)} />
          <Stat label="Cost / participant" value={fmtINR(k.costPerParticipant)} />
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stage 6: Cost (was "Investment")
// ---------------------------------------------------------------------------
export function InvestmentStage({ aop, patch, readOnly }: StageProps) {
  const inv = aop.investment;
  const k = computeInvestmentKpis(inv, aop.revenue.totalRevenueTarget, aop.universe.activeSchools);
  const set = (field: keyof typeof inv, v: number) => patch("investment", { [field]: v } as never);

  const fields: [keyof typeof inv, string, string][] = [
    ["samplingCost", "Sampling cost", "Money spent giving free trials."],
    ["reimbursementCost", "Reimbursement cost", "Money paid back to staff for expenses."],
    ["travelCost", "Travel cost", "Money spent on travel."],
    ["distributorSupportCost", "Distributor support cost", "Money to support distributor partners."],
    ["eventCost", "Event cost", "Money spent on events and fairs."],
    ["giftCost", "Gift cost", "Money spent on gifts for schools."],
    ["todCost", "TOD cost", "Turnover discount given for big buyers."],
    ["promotionalCost", "Promotional cost", "Money spent on promotions and ads."],
    ["schemeCost", "Scheme cost", "Money spent on special offers/schemes."],
    ["discountCost", "Discount cost", "Money given away as discounts."],
    ["strategicAccountInvestment", "Strategic account spend", "Extra money for your most important schools."],
    ["otherCost", "Other cost", "Anything else not listed above."],
  ];

  return (
    <div className="space-y-4">
      <Card>
        <StageIntro>List all the money you plan to spend to hit your target. Leave a box at 0 if you will not spend on it.</StageIntro>
        <h3 className="mb-4 t-card-heading">Cost & budget (INR)</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          {fields.map(([f, label, note]) => (
            <Field key={f} label={label} note={note}>
              <NumberInput value={inv[f]} onChange={(v) => set(f, v)} disabled={readOnly} />
            </Field>
          ))}
        </div>
      </Card>

      <Card>
        <h3 className="mb-4 t-card-heading">Calculated for you</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Stat label="Total cost" value={fmtINR(k.totalInvestment)} sub="all costs added" />
          <Stat label="Cost % of revenue" value={fmtPct(k.investmentPctOfRevenue)} tone={k.investmentPctOfRevenue > 25 ? "amber" : "green"} sub="spend vs target" />
          <Stat label="ROI" value={`${fmtNum(k.roiProjection)}x`} sub="return per ₹ spent" />
          <Stat label="Cost / school" value={fmtINR(k.costPerSchool)} />
          <Stat label="Cost / revenue unit" value={fmtNum(k.costPerRevenueUnit)} />
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stage 7: Collection (auto-calculated, fixed % per region)
// ---------------------------------------------------------------------------
export function CollectionStage({ aop }: { aop: Aop }) {
  const pct = aop.collection.collectionPercent;
  const target = aop.revenue.totalRevenueTarget;
  const c = computeCollection(target, pct);

  return (
    <div className="space-y-4">
      <Card>
        <StageIntro>
          Collection means the cash you actually bring in from your sales. Your region collects{" "}
          <span className="font-semibold text-gray-700">{pct}%</span> of the target, and these
          dates are filled in for you automatically. Nothing to type here.
        </StageIntro>
        <h3 className="mb-4 t-card-heading">Cash collection plan</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <AutoStat label="Collection %" value={`${pct}%`} note="Fixed for your region." />
          <AutoStat label="Total to collect" value={fmtINR(c.totalCollectionTarget)} note={`${pct}% of ${fmtINR(target)} target.`} />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <AutoStat label="By December" value={fmtINR(c.collectionByDec)} note="40% of total collection." />
          <AutoStat label="By March" value={fmtINR(c.collectionByMarch)} note="70% by now." />
          <AutoStat label="By April" value={fmtINR(c.collectionByApril)} note="85% by now." />
          <AutoStat label="By June" value={fmtINR(c.collectionByJune)} note="100% — all collected." />
        </div>
        {target === 0 && (
          <p className="mt-3 text-[12px] text-amber-600">
            Set your Total revenue target in the Revenue step and these numbers will fill in.
          </p>
        )}
      </Card>
    </div>
  );
}
