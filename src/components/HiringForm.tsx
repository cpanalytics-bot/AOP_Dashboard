"use client";

import { useMemo, useState } from "react";
import { Button, Card, Field, NumberInput, Select, TextArea, TextInput } from "./ui";
import { useStore } from "@/lib/store";
import {
  blockNamesForDistricts,
  blocksForDistricts,
  districtNames,
  districts,
} from "@/lib/master-data";
import { hiringSchema } from "@/lib/validation";
import type { HiringPriority, HiringReason } from "@/lib/types";

const REASONS: HiringReason[] = [
  "New Territory Expansion",
  "Territory Split",
  "High Potential Market",
  "Backfill",
  "Attrition Replacement",
  "Business Growth",
  "Strategic Account Requirement",
];
const PRIORITIES: HiringPriority[] = ["Critical", "High", "Medium", "Low"];
const MONTHS = [
  "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09",
  "2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03",
];

export function HiringForm({
  onDone,
  embedded = false,
  forUserId = null,
  defaultDistrictIds = [],
  defaultBaseLocation = "",
}: {
  onDone?: () => void;
  embedded?: boolean;
  forUserId?: string | null;
  defaultDistrictIds?: string[];
  defaultBaseLocation?: string;
}) {
  const { addHiring, users } = useStore();
  const [form, setForm] = useState({
    baseLocation: defaultBaseLocation,
    districtIds: defaultDistrictIds.length ? [...defaultDistrictIds] : [],
    forUserId: forUserId as string | null,
    designation: "BDA",
    numberOfPositions: 1,
    priority: "High" as HiringPriority,
    reason: "Business Growth" as HiringReason,
    businessJustification: "",
    expectedRevenueImpact: 0,
    hiringTimeline: MONTHS[3],
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const blocks = useMemo(() => blocksForDistricts(form.districtIds), [form.districtIds]);

  const toggleDistrict = (id: string) => {
    setForm((f) => ({
      ...f,
      districtIds: f.districtIds.includes(id)
        ? f.districtIds.filter((x) => x !== id)
        : [...f.districtIds, id],
    }));
  };

  const submit = () => {
    const parsed = hiringSchema.safeParse(form);
    if (!parsed.success) {
      const e: Record<string, string> = {};
      parsed.error.issues.forEach((i) => (e[i.path.join(".")] = i.message));
      setErrors(e);
      return;
    }
    setErrors({});
    addHiring({ ...parsed.data, forUserId: parsed.data.forUserId ?? null });
    onDone?.();
    setForm((f) => ({
      ...f,
      numberOfPositions: 1,
      businessJustification: "",
      expectedRevenueImpact: 0,
    }));
  };

  const body = (
    <>
      {!embedded && <h3 className="mb-4 t-card-heading">New hiring request</h3>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="For employee" error={errors.forUserId}>
          <Select
            value={form.forUserId ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, forUserId: e.target.value || null }))}
          >
            <option value="">Select employee</option>
            {users.filter((u) => u.role !== "ADMIN" && u.role !== "ZDM").map((u) => (
              <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
            ))}
          </Select>
        </Field>
        <Field label="Base location" error={errors.baseLocation}>
          <TextInput value={form.baseLocation} onChange={(e) => setForm((f) => ({ ...f, baseLocation: e.target.value }))} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Districts" error={errors.districtIds} note="Select one or more districts. Blocks load automatically.">
            <div className="flex flex-wrap gap-2">
              {districts.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => toggleDistrict(d.id)}
                  className={`rounded-full border px-3 py-1 text-[12px] font-medium ${
                    form.districtIds.includes(d.id)
                      ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                      : "border-gray-200 text-gray-600"
                  }`}
                >
                  {d.name}
                </button>
              ))}
            </div>
          </Field>
        </div>
        <div className="sm:col-span-2 rounded-lg border border-gray-100 bg-gray-50/60 p-3">
          <p className="t-overline">Block coverage (auto)</p>
          <p className="mt-1 text-[13px] text-gray-700">
            {blocks.length} blocks: {blockNamesForDistricts(form.districtIds) || "—"}
          </p>
        </div>
        <Field label="Designation" error={errors.designation}>
          <Select value={form.designation} onChange={(e) => setForm((f) => ({ ...f, designation: e.target.value }))}>
            <option value="BDA">BDA</option>
            <option value="BDM">BDM</option>
          </Select>
        </Field>
        <Field label="Number of positions" error={errors.numberOfPositions}>
          <NumberInput value={form.numberOfPositions} onChange={(v) => setForm((f) => ({ ...f, numberOfPositions: v }))} />
        </Field>
        <Field label="Priority">
          <Select value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as HiringPriority }))}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </Select>
        </Field>
        <Field label="Reason">
          <Select value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value as HiringReason }))}>
            {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </Select>
        </Field>
        <Field label="Expected revenue impact" hint="INR" error={errors.expectedRevenueImpact}>
          <NumberInput value={form.expectedRevenueImpact} onChange={(v) => setForm((f) => ({ ...f, expectedRevenueImpact: v }))} />
        </Field>
        <Field label="Hiring timeline">
          <Select value={form.hiringTimeline} onChange={(e) => setForm((f) => ({ ...f, hiringTimeline: e.target.value }))}>
            {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
          </Select>
        </Field>
        <div className="sm:col-span-2">
          <Field label="Business justification" error={errors.businessJustification} hint="min 20 chars">
            <TextArea value={form.businessJustification} onChange={(e) => setForm((f) => ({ ...f, businessJustification: e.target.value }))} />
          </Field>
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        {onDone && <Button variant="ghost" size="sm" onClick={onDone}>Cancel</Button>}
        <Button size="sm" onClick={submit}>Submit request</Button>
      </div>
    </>
  );

  return embedded ? body : <Card>{body}</Card>;
}
