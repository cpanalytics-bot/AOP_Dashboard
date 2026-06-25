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
import { districtNames } from "@/lib/master-data";
import {
  CollectionStage,
  RevenueStage,
  UniverseStage,
  type Patch,
} from "./stages";
import type { Aop, AopStatus } from "@/lib/types";
import {
  computeAopKpis,
  computeCollection,
  computeUniverseKpis,
  flagUnrealisticTargets,
  fmtINR,
  fmtNum,
  fmtPct,
} from "@/lib/calc";
import { stageSchemas, type StageKey } from "@/lib/validation";

const STAGES = [
  { key: "revenue", label: "Revenue" },
  { key: "universe", label: "Universe" },
  { key: "collection", label: "Collections" },
  { key: "review", label: "Review" },
] as const;

type WizardStageKey = (typeof STAGES)[number]["key"];

// ZMs may keep editing their plan until it is approved. Submitting (or an admin
// opening it for review) no longer locks the form — only final approval does.
const LOCKED: AopStatus[] = ["approved"];

type StageStatus = "empty" | "in_progress" | "valid" | "invalid";

function computeStageStatus(aop: Aop, key: WizardStageKey): StageStatus {
  const blank = (v: number) => !Number.isFinite(v);
  const untouchedByStage: Record<string, () => boolean> = {
    revenue: () => blank(aop.revenue.totalRevenueTarget),
    universe: () => aop.universe.categories.every((c) => blank(c.targetCount)),
    // Collection is auto-derived from the revenue target — "ready" once that's set.
    collection: () => blank(aop.revenue.totalRevenueTarget),
  };

  // Map wizard keys to validation schema keys. Universe validates its own
  // sub-schemas; sampling and training are embedded in the universe stage UI
  // but validated separately.
  const validatableKeys: Record<string, StageKey[]> = {
    revenue: ["revenue"],
    universe: ["universe", "sampling", "training", "investment"],
    collection: ["collection"],
  };

  const schemaKeys = validatableKeys[key];
  if (schemaKeys) {
    if (untouchedByStage[key]?.()) return "empty";
    const allValid = schemaKeys.every((sk) => {
      const data = (aop as unknown as Record<string, unknown>)[sk];
      return stageSchemas[sk].safeParse(data).success;
    });
    return allValid ? "valid" : "in_progress";
  }
  return "in_progress"; // review
}

export function Wizard({ employeeId: rawEmployeeId }: { employeeId: string }) {
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
    hydrating,
  } = useStore();

  const decodedId = (() => {
    try { return decodeURIComponent(rawEmployeeId); } catch { return rawEmployeeId; }
  })();
  const target =
    users.find((u) => u.id === decodedId) ??
    users.find((u) => u.id.toLowerCase() === decodedId.toLowerCase());
  const employeeId = target?.id ?? decodedId;
  const stored = getAop(employeeId);
  const [draft, setDraft] = useState<Aop>(stored);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [savedAt, setSavedAt] = useState<string | null>(null);
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
    // Universe stage validates universe + sampling + training sub-schemas
    const keysToValidate: StageKey[] =
      key === "universe"
        ? ["universe", "sampling", "training", "investment"]
        : key in stageSchemas
          ? [key as StageKey]
          : [];

    if (keysToValidate.length === 0) return true;

    const allErrors: Record<string, string> = {};
    let allValid = true;
    for (const k of keysToValidate) {
      const result = stageSchemas[k].safeParse(
        (draft as unknown as Record<string, unknown>)[k],
      );
      if (!result.success) {
        allValid = false;
        result.error.issues.forEach((i) => {
          const ek = i.path[i.path.length - 1]?.toString() ?? i.path.join(".");
          if (!allErrors[ek]) allErrors[ek] = i.message;
        });
      }
    }
    setErrors(allValid ? {} : allErrors);
    return allValid;
  };

  const goNext = () => {
    const key = STAGES[step].key;
    if (!readOnly && !validateStageKey(key)) {
      // Jump to the first missing mandatory field and focus it.
      setTimeout(() => {
        const el = document.querySelector<HTMLElement>('[data-field-error="true"]');
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.querySelector<HTMLElement>("input,select,textarea")?.focus({ preventScroll: true });
        }
      }, 60);
      return;
    }
    if (!readOnly) persist();
    setStep((s) => Math.min(s + 1, STAGES.length - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const goBack = () => {
    setStep((s) => Math.max(s - 1, 0));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const mandatoryComplete = useMemo(
    () =>
      (["revenue", "universe", "sampling", "training", "investment", "collection"] as const).every(
        (k) => stageSchemas[k].safeParse((draft as unknown as Record<string, unknown>)[k]).success,
      ),
    [draft],
  );
  const hasBlockingErrors = flags.some((f) => f.level === "error") || !mandatoryComplete;

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
    if (hydrating || users.length === 0) {
      return <Card><p className="t-body">Loading…</p></Card>;
    }
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

      {rollup && (
        <div className="mb-5 rounded-lg border border-indigo-200 bg-indigo-50 px-3.5 py-2.5 text-[13px] text-indigo-800">
          This is your zone AOP — automatically calculated by adding up all your team members plans. You cannot edit it directly.
        </div>
      )}

      {readOnly && !rollup && (
        <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[13px] text-amber-800">
          {locked
            ? "This AOP is locked because it has been approved. Use Request changes to reopen."
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
      <div key={stageKey} className="stage-enter min-h-[40vh]">
        {stageKey === "revenue" && (
          <div className="space-y-4">
            <EmployeeProfile userId={employeeId} />
            <RevenueStage aop={draft} patch={patch} errors={errors} readOnly={readOnly} />
          </div>
        )}
        {stageKey === "universe" && <UniverseStage aop={draft} patch={patch} errors={errors} readOnly={readOnly} />}
        {stageKey === "collection" && <CollectionStage aop={draft} patch={patch} readOnly={readOnly} />}
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
          <Stat label="Revenue / school" value={fmtINR(kpis.revenuePerSchool)} />
        </div>
      </Card>

      {/* Targets vs Actuals — fields are wired; achievement fills in once the
          operational (actuals) tables are connected. */}
      <Card>
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <h3 className="t-card-heading">Targets vs Actuals</h3>
          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600 ring-1 ring-inset ring-amber-200">Actuals sync pending</span>
        </div>
        <p className="t-caption mb-3">Achievement and % populate automatically once the operational (actuals) tables are connected.</p>
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full min-w-[480px] text-left text-[13px]">
            <thead className="bg-gray-50/80 text-gray-500">
              <tr>
                <th className="px-3 py-2 t-overline">Metric</th>
                <th className="px-3 py-2 t-overline">Target</th>
                <th className="px-3 py-2 t-overline">Achieved</th>
                <th className="px-3 py-2 t-overline">%</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const uni = computeUniverseKpis(aop.universe);
                const act = aop.actuals ?? {};
                const rows: { m: string; tNum: number; money: boolean; a?: number }[] = [
                  { m: "Revenue", tNum: aop.revenue.totalRevenueTarget, money: true, a: act.revenueAchieved },
                  { m: "AOV", tNum: aop.revenue.targetAov, money: true, a: act.aovAchieved },
                  { m: "Active schools (universe)", tNum: uni.targetTotalFromCategories, money: false, a: act.activeSchoolsAchieved },
                  { m: "Retention schools", tNum: aop.universe.retentionSchoolCount ?? 0, money: false, a: act.retentionSchoolsAchieved },
                  { m: "Sampling schools", tNum: uni.totalSamplingFromCategories, money: false, a: act.sampledSchoolsAchieved },
                  { m: "Conversion schools", tNum: uni.totalConversionFromCategories, money: false, a: act.convertedSchoolsAchieved },
                  { m: "Collection", tNum: aop.revenue.totalRevenueTarget, money: true, a: act.collectionReceived },
                ];
                return rows.map((row) => {
                  const fmt = (n: number) => (row.money ? fmtINR(n) : fmtNum(n));
                  const hasA = typeof row.a === "number" && Number.isFinite(row.a);
                  const pctVal = hasA && row.tNum > 0 ? fmtPct((row.a! / row.tNum) * 100) : "—";
                  return (
                    <tr key={row.m} className="border-t border-gray-100">
                      <td className="px-3 py-2 font-medium text-gray-900">{row.m}</td>
                      <td className="px-3 py-2 tabular-nums text-gray-700">{Number.isFinite(row.tNum) ? fmt(row.tNum) : "—"}</td>
                      <td className="px-3 py-2 tabular-nums text-gray-400">{hasA ? fmt(row.a!) : "—"}</td>
                      <td className="px-3 py-2 tabular-nums text-gray-400">{pctVal}</td>
                    </tr>
                  );
                });
              })()}
            </tbody>
          </table>
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
          ["Early Years", fmtINR(aop.revenue.earlyYearsTarget)],
          ["Math & Science", fmtINR(aop.revenue.mathScienceTarget)],
          ["Other Books", fmtINR(aop.revenue.otherCategoriesTarget)],
          ["STEM (optional)", Number.isFinite(aop.revenue.stemTarget) ? fmtINR(aop.revenue.stemTarget) : "—"],
          ["Panel (optional)", Number.isFinite(aop.revenue.panelTarget) ? fmtINR(aop.revenue.panelTarget) : "—"],
        ]} />
        <SummaryCard title="Universe plan" onJump={() => jumpToStage("universe")} rows={(() => {
          const uniKpis = computeUniverseKpis(aop.universe);
          return [
            ["Active schools", fmtNum(aop.universe.activeSchools)],
            ["Retention count", fmtNum(aop.universe.retentionSchoolCount ?? 0) + " schools"],
            ["Retention value", fmtINR(aop.universe.retentionPlanValue ?? 0)],
            ["Sampling schools", fmtNum(uniKpis.totalSamplingFromCategories)],
            ["Conversion schools", fmtNum(uniKpis.totalConversionFromCategories)],
            ["Bulk deals", fmtNum(aop.universe.bulkDealOpportunities)],
          ] as [string, string][];
        })()} />
        <SummaryCard title="Sampling plan" onJump={() => jumpToStage("universe")} rows={[
          ["User schools", fmtNum(aop.sampling.userSchoolsSampling)],
          ["Non-user schools", fmtNum(aop.sampling.nonUserSchoolsSampling)],
          ["Test prep", fmtNum(aop.sampling.testPrepSampling)],
          ["Early years", fmtNum(aop.sampling.earlyYearsSampling)],
          ["Math & Science", fmtNum(aop.sampling.msSampling)],
          ["STEM", fmtNum(aop.sampling.stemSampling)],
        ]} />
        <SummaryCard title="Training plan" onJump={() => jumpToStage("universe")} rows={[
          ["User school trainings", fmtNum(aop.training.userSchoolTrainings)],
          ["Non-user school trainings", fmtNum(aop.training.nonUserSchoolTrainings)],
          ["Digital trainings", fmtNum(aop.training.digitalTrainings)],
          ["Physical trainings", fmtNum(aop.training.physicalTrainings)],
          ["Teacher workshops", fmtNum(aop.training.teacherWorkshops)],
          ["Principal workshops", fmtNum(aop.training.principalWorkshops)],
          ["STEM workshops", fmtNum(aop.training.stemWorkshops)],
          ["Product demos", fmtNum(aop.training.productDemonstrations)],
          ["Total", fmtNum(
            aop.training.userSchoolTrainings + aop.training.nonUserSchoolTrainings + aop.training.digitalTrainings +
            aop.training.physicalTrainings + aop.training.teacherWorkshops + aop.training.principalWorkshops +
            aop.training.stemWorkshops + aop.training.productDemonstrations)],
        ]} />
        <SummaryCard title="Collection plan" onJump={() => jumpToStage("collection")} rows={(() => {
          const c = computeCollection(aop.revenue.totalRevenueTarget);
          return [
            ["Collection basis", "Full revenue target"],
            ["Total to collect", fmtINR(c.totalCollectionTarget)],
            ["Milestones", `${c.milestones.length} phases`],
          ] as [string, string][];
        })()} />
      </div>

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
