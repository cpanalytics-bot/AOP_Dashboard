"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { Badge, Button, Card, Field, Stat, TextArea } from "@/components/ui";
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

const LOCKED: AopStatus[] = ["submitted", "in_review", "approved"];

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

  if (!target) {
    return <Card><p className="t-body">Employee not found.</p></Card>;
  }

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
    router.push("/");
  };

  const managerAction = (action: "approve" | "reject" | "request_changes", comment: string) => {
    recordApproval(employeeId, action, comment || action);
    router.push("/");
  };

  const stageKey = STAGES[step].key;

  return (
    <div>
      <EmployeeProfile userId={employeeId} />

      {rollup && (
        <div className="mb-5 rounded-lg border border-indigo-200 bg-indigo-50 px-3.5 py-2.5 text-[13px] text-indigo-800">
          This is your zone AOP — automatically calculated by adding up all your team members plans. You cannot edit it directly.
        </div>
      )}

      {/* Header */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <button
            onClick={() => router.push(currentUser?.role === "ZDM" ? "/" : "/view")}
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
        <div className="text-right">
          <StatusBadge status={draft.status} />
          {savedAt && <div className="t-caption mt-1.5">Saved {savedAt}</div>}
        </div>
      </div>

      {readOnly && !rollup && (
        <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[13px] text-amber-800">
          {locked
            ? "This AOP is locked because it has been submitted/approved. Use Request changes to reopen."
            : "You have view-only access to this AOP."}
        </div>
      )}

      {/* Stepper */}
      <div className="no-scrollbar mb-5 flex gap-1.5 overflow-x-auto pb-1">
        {STAGES.map((s, i) => (
          <button
            key={s.key}
            onClick={() => setStep(i)}
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors ${
              i === step
                ? "bg-indigo-600 text-white"
                : i < step
                  ? "border border-indigo-200 bg-indigo-50 text-indigo-700"
                  : "border border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
            }`}
          >
            <span
              className={`grid h-4 w-4 place-items-center rounded-full text-[10px] font-semibold ${
                i === step ? "bg-white/25 text-white" : i < step ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-500"
              }`}
            >
              {i + 1}
            </span>
            {s.label}
          </button>
        ))}
      </div>

      {/* Stage body */}
      <div className="min-h-[40vh]">
        {stageKey === "hiring" && (
          <HiringStage employeeId={employeeId} showForm={showHiringForm} setShowForm={setShowHiringForm} />
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
          />
        )}
      </div>

      {/* Footer nav */}
      <div className="sticky bottom-16 z-10 mt-5 flex items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white/95 p-3 shadow-[0_-1px_3px_rgba(16,24,40,0.04)] backdrop-blur sm:bottom-3">
        <Button variant="ghost" size="sm" onClick={goBack} disabled={step === 0}>
          Back
        </Button>
        <div className="flex items-center gap-2">
          {!readOnly && stageKey !== "review" && (
            <Button variant="outline" size="sm" onClick={() => persist()}>
              Save draft
            </Button>
          )}
          {step < STAGES.length - 1 ? (
            <Button size="sm" onClick={goNext}>Next</Button>
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
  );
}

function StatusBadge({ status }: { status: AopStatus }) {
  const map: Record<AopStatus, { tone: "slate" | "amber" | "blue" | "green" | "red"; label: string }> = {
    not_started: { tone: "slate", label: "Not started" },
    draft: { tone: "amber", label: "Draft" },
    submitted: { tone: "blue", label: "Submitted" },
    in_review: { tone: "blue", label: "In review" },
    changes_requested: { tone: "amber", label: "Changes requested" },
    approved: { tone: "green", label: "Approved" },
    rejected: { tone: "red", label: "Rejected" },
  };
  const m = map[status];
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

function HiringStage({
  employeeId,
  showForm,
  setShowForm,
}: {
  employeeId: string;
  showForm: boolean;
  setShowForm: (v: boolean) => void;
}) {
  const { hiring, canRaiseHiring, users, currentUser } = useStore();
  const target = users.find((u) => u.id === employeeId);
  // requests raised by the current user (manager) for the relevant territory/zone
  const relevant = hiring.filter(
    (h) =>
      h.forUserId === employeeId ||
      (h.forUserId === null && target && h.districtIds.some((id) => target.districtIds.includes(id))),
  );

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-start justify-between gap-3">
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
        <SummaryCard title="Revenue plan" rows={[
          ["Total target", fmtINR(aop.revenue.totalRevenueTarget)],
          ["Target AOV", fmtINR(aop.revenue.targetAov)],
          ["Target rev/school", fmtINR(aop.revenue.targetRevenuePerSchool)],
        ]} />
        <SummaryCard title="Universe plan" rows={[
          ["Active schools", String(aop.universe.activeSchools)],
          ["New acquisition", String(aop.universe.newSchoolAcquisitionPlan)],
          ["Retention %", `${aop.universe.retentionPlan}%`],
        ]} />
        <SummaryCard title="Sampling plan" rows={[
          ["User sampling", String(aop.sampling.userSchoolsSampling)],
          ["Non-user sampling", String(aop.sampling.nonUserSchoolsSampling)],
          ["Rev estimate", fmtINR(aop.sampling.samplingToRevenueEstimate)],
        ]} />
        <SummaryCard title="Training plan" rows={[
          ["User trainings", String(aop.training.userSchoolTrainings)],
          ["Workshops", String(aop.training.teacherWorkshops + aop.training.principalWorkshops)],
          ["Rev impact", fmtINR(aop.training.expectedRevenueImpact)],
        ]} />
        <SummaryCard title="Cost plan" rows={[
          ["Total cost", fmtINR(kpis.totalInvestment)],
          ["Cost %", fmtPct(kpis.investmentPct)],
          ["ROI", fmtPct(kpis.roiPct)],
        ]} />
        <SummaryCard title="Collection plan" rows={(() => {
          const c = computeCollection(aop.revenue.totalRevenueTarget, aop.collection.collectionPercent);
          return [
            ["Collection %", `${c.collectionPercent}%`],
            ["By December", fmtINR(c.collectionByDec)],
            ["By March", fmtINR(c.collectionByMarch)],
            ["By June (full)", fmtINR(c.collectionByJune)],
          ];
        })()} />
        <SummaryCard title="Approval history" rows={
          aop.approvals.length
            ? aop.approvals.map((a) => [a.action, new Date(a.createdAt).toLocaleDateString()])
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

function SummaryCard({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <Card>
      <h4 className="t-overline mb-3">{title}</h4>
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
