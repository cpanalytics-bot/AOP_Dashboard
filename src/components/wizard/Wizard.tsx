"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import {
  Badge,
  Button,
  Card,
  ConfettiBurst,
  Field,
  Kbd,
  Stat,
  StatusPill,
  TextArea,
} from "@/components/ui";
import { EmployeeProfile } from "@/components/EmployeeProfile";
import { HiringForm } from "@/components/HiringForm";
import { districtNames } from "@/lib/master-data";
import {
  CollectionStage,
  InvestmentStage,
  RevenueStage,
  SamplingStage,
  TrainingStage,
  UniverseStage,
  type Patch,
} from "./stages";
import type { Aop, AopStatus } from "@/lib/types";
import {
  computeAopKpis,
  computeCollection,
  flagUnrealisticTargets,
  fmtINR,
  fmtPct,
} from "@/lib/calc";
import { stageSchemas, type StageKey } from "@/lib/validation";

const STAGES = [
  { key: "hiring", label: "Hiring" },
  { key: "revenue", label: "Revenue" },
  { key: "universe", label: "Universe" },
  { key: "sampling", label: "Sampling" },
  { key: "training", label: "Training" },
  { key: "investment", label: "Cost" },
  { key: "collection", label: "Collection" },
  { key: "review", label: "Review" },
] as const;

type WizardStageKey = (typeof STAGES)[number]["key"];

const LOCKED: AopStatus[] = ["submitted", "in_review", "approved"];

type StageStatus = "empty" | "in_progress" | "valid" | "invalid";

function computeStageStatus(aop: Aop, key: WizardStageKey): StageStatus {
  // Per-stage "untouched" signal: stage stays grey unless the user actually
  // typed something. This stops the stepper flashing red on a fresh plan.
  const untouchedByStage: Record<string, () => boolean> = {
    revenue: () => aop.revenue.totalRevenueTarget === 0,
    universe: () =>
      aop.universe.activeSchoolAdditionPlan === 0 &&
      aop.universe.newSchoolAcquisitionPlan === 0 &&
      aop.universe.categories.every((c) => c.targetCount === c.currentCount && c.projectedRevenue === 0),
    sampling: () =>
      aop.sampling.userSchoolsSampling +
        aop.sampling.nonUserSchoolsSampling +
        aop.sampling.testPrepSampling +
        aop.sampling.earlyYearsSampling +
        aop.sampling.msSampling +
        aop.sampling.stemSampling +
        aop.sampling.panelSampling ===
      0,
    training: () =>
      aop.training.userSchoolTrainings +
        aop.training.nonUserSchoolTrainings +
        aop.training.digitalTrainings +
        aop.training.physicalTrainings +
        aop.training.teacherWorkshops +
        aop.training.principalWorkshops +
        aop.training.stemWorkshops +
        aop.training.productDemonstrations ===
      0,
    investment: () => {
      const i = aop.investment;
      return (
        i.samplingCost + i.reimbursementCost + i.travelCost + i.distributorSupportCost + i.eventCost +
          i.giftCost + i.todCost + i.promotionalCost + i.discountCost + i.otherCost ===
        0
      );
    },
  };

  const schemaKey = (["revenue", "universe", "sampling", "training", "investment"] as const).find(
    (k) => k === key,
  );
  if (schemaKey) {
    if (untouchedByStage[schemaKey]()) return "empty";
    const data = (aop as unknown as Record<string, unknown>)[schemaKey];
    const result = stageSchemas[schemaKey as StageKey].safeParse(data);
    return result.success ? "valid" : "invalid";
  }
  if (key === "collection") return aop.revenue.totalRevenueTarget > 0 ? "valid" : "empty";
  if (key === "review") return "in_progress";
  return "in_progress"; // hiring
}

export function Wizard({ employeeId }: { employeeId: string }) {
  const router = useRouter();
  const {
    currentUser,
    users,
    getAop,
    saveAop,
    recordApproval,
    canEditAop,
    canApproveAop,
    isRollupAop,
  } = useStore();

  const target = users.find((u) => u.id === employeeId);
  const stored = getAop(employeeId);
  const [draft, setDraft] = useState<Aop>(stored);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [showHiringForm, setShowHiringForm] = useState(false);
  const [celebrating, setCelebrating] = useState(false);

  const rollup = isRollupAop(employeeId) || !!draft.isRollup;
  const isEditor = canEditAop(employeeId) && !rollup;
  const isApprover = canApproveAop(employeeId);
  const locked = LOCKED.includes(draft.status) || rollup;
  const readOnly = !isEditor || locked;

  const patch: Patch = (section, value) => {
    setDraft((d) => ({ ...d, [section]: { ...(d[section] as object), ...value } }));
  };

  const kpis = useMemo(() => computeAopKpis(draft), [draft]);
  const flags = useMemo(() => flagUnrealisticTargets(draft), [draft]);

  const stageStatuses = useMemo(
    () => STAGES.map((s) => computeStageStatus(draft, s.key)) as StageStatus[],
    [draft],
  );

  const persist = (status?: AopStatus) => {
    if (rollup) return;
    const next: Aop = {
      ...draft,
      status: status ?? (draft.status === "not_started" ? "draft" : draft.status),
    };
    setDraft(next);
    saveAop(next);
    setSavedAt(new Date().toLocaleTimeString());
  };

  const validateStageKey = (key: string): boolean => {
    if (!(key in stageSchemas)) return true;
    const result = stageSchemas[key as StageKey].safeParse(
      (draft as unknown as Record<string, unknown>)[key],
    );
    if (result.success) {
      setErrors({});
      return true;
    }
    const e: Record<string, string> = {};
    result.error.issues.forEach((i) => {
      const k = i.path[i.path.length - 1]?.toString() ?? i.path.join(".");
      if (!e[k]) e[k] = i.message;
    });
    setErrors(e);
    return false;
  };

  const goNext = () => {
    const key = STAGES[step].key;
    if (!readOnly && !validateStageKey(key)) return;
    if (!readOnly) persist();
    setStep((s) => Math.min(s + 1, STAGES.length - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const goBack = () => {
    setStep((s) => Math.max(s - 1, 0));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const hasBlockingErrors = flags.some((f) => f.level === "error");

  const submit = () => {
    if (hasBlockingErrors) return;
    persist("submitted");
    recordApproval(employeeId, "submit", "Submitted for review.");
    setCelebrating(true);
    setTimeout(() => {
      setCelebrating(false);
      router.push("/");
    }, 2200);
  };

  const managerAction = (action: "approve" | "reject" | "request_changes", comment: string) => {
    recordApproval(employeeId, action, comment || action);
    router.push("/");
  };

  const stageKey = STAGES[step].key;

  // ----- Keyboard shortcuts -----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Don't intercept inside inputs / textareas
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      const isField = tag === "input" || tag === "textarea" || tag === "select";

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!readOnly) persist();
        return;
      }
      if (isField) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goBack();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, readOnly, draft]);

  if (!target) {
    return <Card><p className="t-body">Employee not found.</p></Card>;
  }

  return (
    <div>
      <ConfettiBurst play={celebrating} />
      {celebrating && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-white/40 backdrop-blur-sm">
          <div className="rounded-2xl border border-emerald-200 bg-white px-6 py-5 text-center shadow-xl">
            <div className="mx-auto mb-2 grid h-12 w-12 place-items-center rounded-full bg-emerald-100 text-2xl text-emerald-600">✓</div>
            <h3 className="t-card-heading">Plan submitted!</h3>
            <p className="t-caption mt-1">{target.name}&apos;s FY26-27 AOP is on its way for review.</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <button
            onClick={() => router.push(currentUser?.role === "ZDM" ? "/" : currentUser?.role === "ADMIN" ? "/admin" : "/view")}
            className="t-caption mb-1 inline-flex items-center gap-1 hover:text-gray-700"
          >
            &larr; Back to dashboard
          </button>
          <h1 className="t-display flex items-center gap-2">
            AOP · {target.name}
            {rollup && <Badge tone="indigo">Zone roll-up</Badge>}
          </h1>
          <p className="t-body mt-1">
            {target.designation} · {districtNames(target.districtIds) || "No districts"} · FY26-27
          </p>
        </div>
        <div className="text-left sm:text-right">
          <StatusPill status={draft.status} />
          {savedAt && <div className="t-caption mt-1.5">Saved {savedAt}</div>}
        </div>
      </div>

      {stageKey === "hiring" && <EmployeeProfile userId={employeeId} />}

      {rollup && (
        <div className="mb-5 rounded-lg border border-indigo-200 bg-indigo-50 px-3.5 py-2.5 text-[13px] text-indigo-800">
          This is your zone AOP — automatically calculated by adding up all your team members plans. You cannot edit it directly.
        </div>
      )}

      {readOnly && !rollup && (
        <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[13px] text-amber-800">
          {locked
            ? "This AOP is locked because it has been submitted/approved. Use Request changes to reopen."
            : "You have view-only access to this AOP."}
        </div>
      )}

      {/* Stepper with validity dots */}
      <div className="no-scrollbar mb-5 flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        {STAGES.map((s, i) => {
          const status = stageStatuses[i];
          const active = i === step;
          return (
            <button
              key={s.key}
              onClick={() => setStep(i)}
              aria-current={active ? "step" : undefined}
              aria-label={`Step ${i + 1}: ${s.label} (${status})`}
              className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition-colors ${
                active
                  ? "bg-indigo-600 text-white"
                  : status === "valid"
                    ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                    : status === "invalid"
                      ? "border border-rose-200 bg-rose-50 text-rose-700"
                      : i < step
                        ? "border border-indigo-200 bg-indigo-50 text-indigo-700"
                        : "border border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
              }`}
            >
              <span
                className={`grid h-4 w-4 place-items-center rounded-full text-[10px] font-semibold ${
                  active
                    ? "bg-white/25 text-white"
                    : status === "valid"
                      ? "bg-emerald-500 text-white"
                      : status === "invalid"
                        ? "bg-rose-500 text-white"
                        : "bg-gray-100 text-gray-500"
                }`}
                aria-hidden
              >
                {status === "valid" ? "✓" : status === "invalid" ? "!" : i + 1}
              </span>
              {s.label}
            </button>
          );
        })}
      </div>

      {/* Stage body */}
      <div className="min-h-[40vh]">
        {stageKey === "hiring" && (
          <HiringStage
            employeeId={employeeId}
            showForm={showHiringForm}
            setShowForm={setShowHiringForm}
            onApplyDefaults={!readOnly ? () => applySmartDefaults(draft, target.currentRevenue, (d) => setDraft(d)) : undefined}
            draftStarted={draft.revenue.totalRevenueTarget > 0}
          />
        )}
        {stageKey === "revenue" && <RevenueStage aop={draft} patch={patch} errors={errors} readOnly={readOnly} />}
        {stageKey === "universe" && <UniverseStage aop={draft} patch={patch} errors={errors} readOnly={readOnly} />}
        {stageKey === "sampling" && <SamplingStage aop={draft} patch={patch} errors={errors} readOnly={readOnly} />}
        {stageKey === "training" && <TrainingStage aop={draft} patch={patch} errors={errors} readOnly={readOnly} />}
        {stageKey === "investment" && <InvestmentStage aop={draft} patch={patch} errors={errors} readOnly={readOnly} />}
        {stageKey === "collection" && <CollectionStage aop={draft} />}
        {stageKey === "review" && (
          <ReviewStage
            aop={draft}
            kpis={kpis}
            flags={flags}
            isEditor={isEditor}
            isApprover={isApprover}
            locked={locked}
            onSubmit={submit}
            onManagerAction={managerAction}
            hasBlockingErrors={hasBlockingErrors}
            jumpToStage={(k) => {
              const idx = STAGES.findIndex((s) => s.key === k);
              if (idx >= 0) setStep(idx);
            }}
          />
        )}
      </div>

      {/* Spacer so content never hides behind the fixed action bar */}
      <div aria-hidden className="h-20 sm:h-16" />

      {/* Persistent action bar */}
      <div className="fixed inset-x-0 bottom-[calc(52px+env(safe-area-inset-bottom))] z-30 border-t border-gray-200 bg-white/95 backdrop-blur sm:bottom-0">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-2 px-4 py-2.5 sm:py-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={goBack} disabled={step === 0}>
              <span className="hidden sm:inline">← </span>Back
            </Button>
            <span className="hidden text-[12px] text-gray-400 sm:inline">
              Step {step + 1} of {STAGES.length} · {STAGES[step].label}
            </span>
            <span className="hidden items-center gap-1 text-[11px] text-gray-300 md:inline-flex">
              <Kbd>←</Kbd> <Kbd>→</Kbd>
              <span className="ml-2">save</span> <Kbd>⌘</Kbd><Kbd>S</Kbd>
            </span>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            {savedAt && <span className="hidden text-[12px] text-gray-400 md:inline">Saved {savedAt}</span>}
            {!readOnly && stageKey !== "review" && (
              <Button variant="outline" size="sm" onClick={() => persist()}>
                Save draft
              </Button>
            )}
            {step < STAGES.length - 1 ? (
              <Button size="sm" onClick={goNext}>Next →</Button>
            ) : (
              isEditor && !locked && (
                <Button variant="success" size="sm" onClick={submit} disabled={hasBlockingErrors}>
                  Submit AOP
                </Button>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Smart defaults helper — give the user a head-start when starting a plan from zero.
function applySmartDefaults(draft: Aop, lastYearRevenue: number, setDraft: (a: Aop) => void) {
  if (!lastYearRevenue) return;
  const growth = 1.12; // sensible default ~12% YoY growth
  const total = Math.round(lastYearRevenue * growth);

  const lyParts = [
    draft.revenue.earlyYearsRevenueLY,
    draft.revenue.mathScienceRevenueLY,
    draft.revenue.otherCategoriesRevenueLY,
    draft.revenue.stemRevenueLY,
    draft.revenue.panelRevenueLY,
  ];
  const lyTotal = lyParts.reduce((s, n) => s + n, 0) || 1;

  setDraft({
    ...draft,
    revenue: {
      ...draft.revenue,
      totalRevenueTarget: total,
      earlyYearsTarget: Math.round((total * lyParts[0]) / lyTotal),
      mathScienceTarget: Math.round((total * lyParts[1]) / lyTotal),
      otherCategoriesTarget: Math.round((total * lyParts[2]) / lyTotal),
      stemTarget: Math.round((total * lyParts[3]) / lyTotal),
      panelTarget: Math.round((total * lyParts[4]) / lyTotal),
      targetAov: Math.round(draft.revenue.currentAov * growth),
      targetRevenuePerSchool: Math.round(draft.revenue.currentRevenuePerSchool * growth),
    },
    universe: {
      ...draft.universe,
      activeSchoolAdditionPlan: draft.universe.activeSchoolAdditionPlan || 15,
      newSchoolAcquisitionPlan: draft.universe.newSchoolAcquisitionPlan || 20,
      retentionPlan: draft.universe.retentionPlan || 85,
    },
  });
}

function HiringStage({
  employeeId,
  showForm,
  setShowForm,
  onApplyDefaults,
  draftStarted,
}: {
  employeeId: string;
  showForm: boolean;
  setShowForm: (v: boolean) => void;
  onApplyDefaults?: () => void;
  draftStarted: boolean;
}) {
  const { hiring, canRaiseHiring, users } = useStore();
  const target = users.find((u) => u.id === employeeId);
  const relevant = hiring.filter(
    (h) =>
      h.forUserId === employeeId ||
      (h.forUserId === null && target && h.districtIds.some((id) => target.districtIds.includes(id))),
  );

  return (
    <div className="space-y-4">
      {onApplyDefaults && !draftStarted && (
        <Card className="!border-indigo-200 !bg-gradient-to-br !from-indigo-50/70 !to-white">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="t-card-heading">Start with sensible defaults</h3>
              <p className="t-caption mt-1 max-w-xl">
                Pre-fill targets based on last year&apos;s revenue, mix, and a 12% growth assumption.
                You can edit everything afterwards. Skips empty inputs across the whole plan.
              </p>
            </div>
            <Button size="sm" onClick={onApplyDefaults}>Use defaults →</Button>
          </div>
        </Card>
      )}

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="t-card-heading">Stage 1 · Hiring & manpower</h3>
            <p className="t-caption mt-0.5">Identify manpower gaps before business planning.</p>
          </div>
          {canRaiseHiring() && (
            <Button size="sm" onClick={() => setShowForm(!showForm)}>
              {showForm ? "Close" : "+ Add request"}
            </Button>
          )}
        </div>
        {!canRaiseHiring() && (
          <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-[13px] text-gray-500">
            Hiring requests are raised by your ZDM.
          </p>
        )}
      </Card>

      {showForm && canRaiseHiring() && (
        <HiringForm
          onDone={() => setShowForm(false)}
          forUserId={employeeId}
          defaultDistrictIds={target?.districtIds ?? []}
          defaultBaseLocation={target?.baseLocation ?? ""}
        />
      )}

      <Card>
        <h3 className="mb-4 t-card-heading">Requests ({relevant.length})</h3>
        {relevant.length === 0 ? (
          <p className="t-caption">No hiring requests yet.</p>
        ) : (
          <div className="space-y-2.5">
            {relevant.map((h) => (
              <div key={h.id} className="rounded-lg border border-gray-200 bg-gray-50/60 p-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-semibold text-gray-900">
                    {h.numberOfPositions} × {h.designation} · {districtNames(h.districtIds)}
                  </span>
                  <Badge tone={h.status === "Approved" ? "green" : h.status === "Closed" ? "slate" : "amber"}>
                    {h.status}
                  </Badge>
                </div>
                <div className="t-caption mt-1">
                  {h.reason} · {h.priority} priority · by {h.hiringTimeline}
                </div>
                <p className="mt-1.5 text-[13px] text-gray-600">{h.businessJustification}</p>
                <div className="t-caption mt-1.5">Expected impact: {fmtINR(h.expectedRevenueImpact)}</div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function ReviewStage({
  aop,
  kpis,
  flags,
  isEditor,
  isApprover,
  locked,
  onSubmit,
  onManagerAction,
  hasBlockingErrors,
  jumpToStage,
}: {
  aop: Aop;
  kpis: ReturnType<typeof computeAopKpis>;
  flags: ReturnType<typeof flagUnrealisticTargets>;
  isEditor: boolean;
  isApprover: boolean;
  locked: boolean;
  onSubmit: () => void;
  onManagerAction: (a: "approve" | "reject" | "request_changes", comment: string) => void;
  hasBlockingErrors: boolean;
  jumpToStage: (key: WizardStageKey) => void;
}) {
  const [comment, setComment] = useState("");
  const canReview = isApprover && (aop.status === "submitted" || aop.status === "in_review");

  return (
    <div className="space-y-4">
      <Card>
        <h3 className="mb-4 t-card-heading">Auto-generated KPIs</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Revenue growth" value={fmtPct(kpis.revenueGrowthPct)} tone={kpis.revenueGrowthPct >= 0 ? "green" : "red"} />
          <Stat label="AOV growth" value={fmtPct(kpis.aovGrowthPct)} />
          <Stat label="School growth" value={fmtPct(kpis.schoolGrowthPct)} />
          <Stat label="Retention" value={fmtPct(kpis.retentionPct)} />
          <Stat label="Conversion" value={fmtPct(kpis.conversionPct)} />
          <Stat label="Cost %" value={fmtPct(kpis.investmentPct)} tone={kpis.investmentPct > 25 ? "amber" : "green"} />
          <Stat label="ROI" value={fmtPct(kpis.roiPct)} />
          <Stat label="Revenue / school" value={fmtINR(kpis.revenuePerSchool)} />
        </div>
      </Card>

      {flags.length > 0 && (
        <Card>
          <h3 className="mb-4 t-card-heading">Validation & flags</h3>
          <div className="space-y-2">
            {flags.map((f, i) => (
              <div
                key={i}
                className={`rounded-lg border px-3 py-2 text-[13px] ${
                  f.level === "error"
                    ? "border-rose-200 bg-rose-50 text-rose-700"
                    : f.level === "warn"
                      ? "border-amber-200 bg-amber-50 text-amber-700"
                      : "border-gray-200 bg-gray-50 text-gray-600"
                }`}
              >
                <span className="text-[11px] font-semibold uppercase tracking-wide">{f.level}</span> · {f.message}
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <SummaryCard title="Revenue plan" onJump={() => jumpToStage("revenue")} rows={[
          ["Total target", fmtINR(aop.revenue.totalRevenueTarget)],
          ["Target AOV", fmtINR(aop.revenue.targetAov)],
          ["Target rev/school", fmtINR(aop.revenue.targetRevenuePerSchool)],
        ]} />
        <SummaryCard title="Universe plan" onJump={() => jumpToStage("universe")} rows={[
          ["Active schools", String(aop.universe.activeSchools)],
          ["New acquisition", String(aop.universe.newSchoolAcquisitionPlan)],
          ["Retention %", `${aop.universe.retentionPlan}%`],
        ]} />
        <SummaryCard title="Sampling plan" onJump={() => jumpToStage("sampling")} rows={[
          ["User sampling", String(aop.sampling.userSchoolsSampling)],
          ["Non-user sampling", String(aop.sampling.nonUserSchoolsSampling)],
          ["Rev estimate", fmtINR(aop.sampling.samplingToRevenueEstimate)],
        ]} />
        <SummaryCard title="Training plan" onJump={() => jumpToStage("training")} rows={[
          ["User trainings", String(aop.training.userSchoolTrainings)],
          ["Workshops", String(aop.training.teacherWorkshops + aop.training.principalWorkshops)],
          ["Rev impact", fmtINR(aop.training.expectedRevenueImpact)],
        ]} />
        <SummaryCard title="Cost plan" onJump={() => jumpToStage("investment")} rows={[
          ["Total cost", fmtINR(kpis.totalInvestment)],
          ["Cost %", fmtPct(kpis.investmentPct)],
          ["ROI", fmtPct(kpis.roiPct)],
        ]} />
        <SummaryCard title="Collection plan" onJump={() => jumpToStage("collection")} rows={(() => {
          const c = computeCollection(aop.revenue.totalRevenueTarget, aop.collection.collectionPercent);
          const rows: [string, string][] = [["Collection %", `${c.collectionPercent}%`]];
          c.milestones.forEach((m) => rows.push([m.label, fmtINR(m.amount)]));
          return rows;
        })()} />
        <SummaryCard title="Approval history" rows={
          aop.approvals.length
            ? aop.approvals.map((a) => [a.action, new Date(a.createdAt).toLocaleDateString()] as [string, string])
            : [["No events", "-"]]
        } />
      </div>

      {/* Actions */}
      {isEditor && !locked && (
        <Card>
          <h3 className="mb-3 t-card-heading">Submit for approval</h3>
          {hasBlockingErrors && (
            <p className="mb-3 text-[13px] text-rose-600">Resolve the error-level flags above before submitting.</p>
          )}
          <Button variant="success" onClick={onSubmit} disabled={hasBlockingErrors}>
            Send for approval
          </Button>
        </Card>
      )}

      {canReview && (
        <Card>
          <h3 className="mb-3 t-card-heading">Manager review</h3>
          <Field label="Comment">
            <TextArea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Optional comment for approve / required for reject or changes" />
          </Field>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="success" size="sm" onClick={() => onManagerAction("approve", comment)}>Approve</Button>
            <Button variant="outline" size="sm" onClick={() => onManagerAction("request_changes", comment)}>Request changes</Button>
            <Button variant="danger" size="sm" onClick={() => onManagerAction("reject", comment)}>Reject</Button>
          </div>
        </Card>
      )}
    </div>
  );
}

function SummaryCard({
  title,
  rows,
  onJump,
}: {
  title: string;
  rows: [string, string][];
  onJump?: () => void;
}) {
  return (
    <Card className={onJump ? "transition hover:border-indigo-300 hover:shadow-md" : ""}>
      <div className="mb-3 flex items-center justify-between">
        <h4 className="t-overline">{title}</h4>
        {onJump && (
          <button
            onClick={onJump}
            className="text-[11.5px] font-semibold text-indigo-600 hover:underline"
          >
            Open →
          </button>
        )}
      </div>
      <dl className="space-y-2">
        {rows.map(([k, v], i) => (
          <div key={i} className="flex items-center justify-between text-[13px]">
            <dt className="text-gray-500">{k}</dt>
            <dd className="font-medium text-gray-900">{v}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
