"use client";

import { useEffect, useState } from "react";
import { Button, Card, Field, NumberInput, SearchableMultiSelect, Select, TextArea, TextInput } from "./ui";
import { useStore } from "@/lib/store";
import { supabaseConfigured } from "@/lib/supabase/client";
import {
  liveStates,
  liveDistrictsForStates,
  liveBlocksForDistricts,
  liveTerritoryDefaults,
} from "@/lib/supabase/aop-data";
import { districts as masterDistricts } from "@/lib/master-data";
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

// ---- territory data sources (live = all_india_schools RPCs; mock = master) ----
const fetchStates = (): Promise<string[]> =>
  supabaseConfigured
    ? liveStates()
    : Promise.resolve(Array.from(new Set(masterDistricts.map((d) => d.state))).sort());
const fetchDistricts = (states: string[]): Promise<string[]> => {
  if (!states.length) return Promise.resolve([]);
  return supabaseConfigured
    ? liveDistrictsForStates(states)
    : Promise.resolve(masterDistricts.filter((d) => states.includes(d.state)).map((d) => d.name).sort());
};
const fetchBlocks = (dists: string[]): Promise<string[]> =>
  !dists.length || !supabaseConfigured ? Promise.resolve([]) : liveBlocksForDistricts(dists);

export function HiringForm({
  onDone,
  embedded = false,
  forUserId = null,
  defaultBaseLocation = "",
}: {
  onDone?: () => void;
  embedded?: boolean;
  forUserId?: string | null;
  defaultDistrictIds?: string[];
  defaultBaseLocation?: string;
}) {
  const { addHiring, users, currentUser } = useStore();
  const [form, setForm] = useState({
    baseLocation: defaultBaseLocation,
    forUserId: forUserId as string | null,
    designation: "BDA",
    numberOfPositions: 1,
    priority: "High" as HiringPriority,
    reason: "Business Growth" as HiringReason,
    businessJustification: "",
    expectedRevenueImpact: 0,
    hiringTimeline: MONTHS[3],
  });
  const [selStates, setSelStates] = useState<string[]>([]);
  const [selDistricts, setSelDistricts] = useState<string[]>([]);
  const [blocks, setBlocks] = useState<string[]>([]);
  const [stateOptions, setStateOptions] = useState<string[]>([]);
  const [districtOptions, setDistrictOptions] = useState<string[]>([]);
  const [loadingStates, setLoadingStates] = useState(false);
  const [loadingDistricts, setLoadingDistricts] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // State options (once).
  useEffect(() => {
    let alive = true;
    setLoadingStates(true);
    fetchStates().then((s) => alive && setStateOptions(s)).finally(() => alive && setLoadingStates(false));
    return () => { alive = false; };
  }, []);

  // Seed the ZM's home state/district from emp_record.
  useEffect(() => {
    const email = currentUser?.email;
    if (!email || !supabaseConfigured) return;
    let alive = true;
    liveTerritoryDefaults(email).then((d) => {
      if (!alive) return;
      if (d.state) setSelStates((cur) => (cur.length ? cur : [d.state!]));
      if (d.district) setSelDistricts((cur) => (cur.length ? cur : [d.district!]));
    });
    return () => { alive = false; };
  }, [currentUser?.email]);

  // District options follow the selected states.
  useEffect(() => {
    let alive = true;
    setLoadingDistricts(true);
    fetchDistricts(selStates).then((d) => alive && setDistrictOptions(d)).finally(() => alive && setLoadingDistricts(false));
    // Drop any selected districts that no longer belong to the chosen states.
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selStates.join("|")]);

  // Blocks are auto-assigned from the selected districts.
  useEffect(() => {
    let alive = true;
    fetchBlocks(selDistricts).then((b) => alive && setBlocks(b));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selDistricts.join("|")]);

  const submit = () => {
    const payload = {
      ...form,
      states: selStates,
      districts: selDistricts,
      blocks,
    };
    const parsed = hiringSchema.safeParse(payload);
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

        {/* Territory cascade: States → Assigned districts → Assigned blocks (auto) */}
        <div className="sm:col-span-2">
          <Field label="States" error={errors.states}>
            <SearchableMultiSelect
              options={stateOptions}
              selected={selStates}
              onChange={setSelStates}
              loading={loadingStates}
              placeholder="Select states…"
              searchPlaceholder="Search states…"
            />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Assigned districts" error={errors.districts}>
            <SearchableMultiSelect
              options={districtOptions}
              selected={selDistricts}
              onChange={setSelDistricts}
              loading={loadingDistricts}
              placeholder={selStates.length ? "Select districts…" : "Pick a state first"}
              searchPlaceholder="Search districts…"
              emptyText={selStates.length ? "No districts for these states" : "Select a state above"}
            />
          </Field>
        </div>
        <div className="sm:col-span-2 rounded-lg border border-gray-100 bg-gray-50/60 p-3">
          <p className="t-overline">
            Assigned blocks <span className="font-normal normal-case tracking-normal text-gray-400">(auto-assigned from districts)</span>
          </p>
          <p className="mt-1 text-[13px] text-gray-700">
            <span className="font-medium text-gray-900">{blocks.length} block{blocks.length === 1 ? "" : "s"}</span>
            {blocks.length > 0 ? (
              <span className="text-gray-500"> · {blocks.slice(0, 12).join(", ")}{blocks.length > 12 ? ` +${blocks.length - 12} more` : ""}</span>
            ) : (
              <span className="text-gray-400"> · {supabaseConfigured ? "Select districts to load blocks" : "Blocks load in connected mode"}</span>
            )}
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
