"use client";

// ---------------------------------------------------------------------------
// Live data-access layer for the AOP platform (Performance Dashboard project).
// Reference reads (login / team / snapshots) go through SECURITY DEFINER RPCs;
// the aop_* capture tables are read/written directly. Falls back to MOCK mode
// in the store when `supabaseConfigured` is false.
// ---------------------------------------------------------------------------

import { createClient } from "./client";
import { defaultAop } from "../mock-data";
import type { Aop, ApprovalAction, AopStatus, HiringRequest, K8HiringRow, Role, SchoolCategoryPlan, User } from "../types";

const FY = "FY26-27";
const sb = () => createClient();
export const UNIVERSE_CATEGORIES = ["A", "B", "C", "D", "Uncategorized", "Chain"] as const;

// DB null <-> blank (NaN) so a never-filled mandatory field stays blank on reload.
const nz = (v: unknown): number => (v === null || v === undefined ? NaN : Number(v));
function nullifyNaN<T extends Record<string, unknown>>(o: T): T {
  const out: Record<string, unknown> = { ...o };
  for (const k in out) {
    const v = out[k];
    if (typeof v === "number" && !Number.isFinite(v)) out[k] = null;
  }
  return out as T;
}

interface SavedCat { current_count: number; target_count: number; sampling_count: number; conversion_count: number; projected_conversion_pct: number }

function buildCategories(
  snap: MemberSnapshot | undefined, saved: Map<string, SavedCat>, currentAov: number,
): SchoolCategoryPlan[] {
  const totalMap = new Map<string, number>();
  const activeMap = new Map<string, number>();
  const userMap = new Map<string, number>();
  (snap?.categories ?? []).forEach((c) => {
    totalMap.set(c.category, c.current_count);
    activeMap.set(c.category, c.active_count ?? 0);
    userMap.set(c.category, c.user_count ?? 0);
  });
  return UNIVERSE_CATEGORIES.map((cat) => {
    const sv = saved.get(cat);
    const current = sv?.current_count ?? (cat === "Chain" ? snap?.chain ?? 0 : totalMap.get(cat) ?? 0);
    // Active/User are always "today" snapshot values (not user-editable).
    const active = cat === "Chain" ? snap?.chain ?? 0 : activeMap.get(cat) ?? 0;
    const user = cat === "Chain" ? 0 : userMap.get(cat) ?? 0;
    const target = sv ? sv.target_count : NaN;          // blank until entered
    const conv = sv ? sv.projected_conversion_pct : NaN;
    return {
      category: cat,
      currentCount: current,
      activeCount: active,
      userCount: user,
      targetCount: target,
      samplingCount: sv ? sv.sampling_count : NaN,
      conversionCount: sv ? sv.conversion_count : NaN,
      projectedConversion: conv,
      projectedRevenue: Math.round(target * (conv / 100) * currentAov),
    };
  });
}

interface EmpRow {
  email: string;
  name: string | null;
  role: string;
  employee_id: string | null;
  reporting_manager_email: string | null;
  zonal_manager_email: string | null;
  city_district: string | null;
  is_program_team?: boolean;
}

function toUser(r: EmpRow): User {
  const selfManaged = !r.reporting_manager_email || r.reporting_manager_email === r.email;
  return {
    id: r.email,
    employeeCode: r.employee_id ?? r.email,
    name: r.name ?? r.email,
    email: r.email,
    role: r.role as Role,
    designation: r.role === "ZDM" ? "Zonal Manager" : r.role === "ADMIN" ? "Admin Team" : r.role,
    baseLocation: r.city_district ?? "",
    zoneId: r.zonal_manager_email ?? "",
    districtIds: r.city_district ? [r.city_district] : [],
    reportingManagerId: selfManaged ? null : r.reporting_manager_email,
    currentRevenue: 0,
    currentTarget: 0,
    isActive: true,
  };
}

// ---- Reference reads (RPC) ------------------------------------------------

export async function liveLogin(email: string): Promise<User | null> {
  const { data, error } = await sb().rpc("aop_login", { p_email: email });
  if (error || !data || !data.length) return null;
  return toUser(data[0] as EmpRow);
}

export type OtpResult = { ok: boolean; reason?: "unauthorized" | "error"; message?: string; user?: User };

// App-managed OTP (edge functions) — no Supabase Auth / Send-Email hook.
// The functions verify_jwt=false, so we call them with the anon key directly
// and branch on the HTTP status (403 = unauthorized, 200 = ok).
const FN_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1`;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

async function callFn(
  name: string, body: Record<string, unknown>,
): Promise<{ status: number; body: { success?: boolean; error?: string; message?: string } | null }> {
  try {
    const res = await fetch(`${FN_BASE}/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
      body: JSON.stringify(body),
    });
    let json: { success?: boolean; error?: string; message?: string } | null = null;
    try { json = await res.json(); } catch { /* empty body */ }
    return { status: res.status, body: json };
  } catch (err) {
    return { status: 0, body: { error: (err as Error).message } };
  }
}

/**
 * Step 1 of OTP sign-in. The edge function authorizes the email server-side
 * (via aop_login) and emails a 6-digit code from cp_analytics@pw.live; only
 * recognised emails ever receive a code.
 */
export async function sendLoginOtp(email: string): Promise<OtpResult> {
  const e = email.trim();
  if (!e) return { ok: false, reason: "error", message: "Enter your email." };
  const { status, body } = await callFn("aop-send-otp", { email: e });
  if (status === 403) return { ok: false, reason: "unauthorized" };
  if (status !== 200) {
    return { ok: false, reason: "error", message: body?.error || body?.message || "Could not send the code. Try again." };
  }
  return { ok: true };
}

/** Step 2 of OTP sign-in. Verify the code server-side, then resolve the user. */
export async function verifyLoginOtp(email: string, token: string): Promise<OtpResult> {
  const e = email.trim();
  const { status, body } = await callFn("aop-verify-otp", { email: e, otp: token.trim() });
  if (status !== 200 || !body?.success) {
    return { ok: false, reason: "error", message: body?.message || body?.error || "That code is invalid or expired." };
  }
  const user = await liveLogin(e);
  if (!user) return { ok: false, reason: "unauthorized" };
  return { ok: true, user };
}

/** App-managed OTP has no Supabase Auth session to clear. */
export async function signOutAuth(): Promise<void> {
  /* no-op */
}

export async function liveTeam(zmEmail: string): Promise<User[]> {
  const { data, error } = await sb().rpc("aop_team", { p_zm_email: zmEmail });
  if (error || !data) return [];
  return (data as EmpRow[]).map(toUser);
}

// ---- To-Be-Hired (TBH) placeholder members -------------------------------

interface TbhRow {
  id: string; zm_email: string; name: string; role: string;
  base_location: string | null; mapped_email: string | null;
}
function tbhToUser(r: TbhRow): User {
  return {
    id: r.id,
    employeeCode: "TBH",
    name: r.name || "To Be Hired",
    email: r.id, // AOP + territory key under the TBH id until a real email is mapped
    role: (r.role as Role) || "BDA",
    designation: r.role === "BDM" ? "Business Dev Manager · TBH" : "Business Dev Associate · TBH",
    baseLocation: r.base_location ?? "",
    zoneId: r.zm_email,
    districtIds: [],
    reportingManagerId: r.zm_email,
    currentRevenue: 0,
    currentTarget: 0,
    isActive: true,
    isTbh: true,
    mappedEmail: r.mapped_email ?? null,
  };
}
export async function liveListTbh(zmEmail: string): Promise<User[]> {
  const { data } = await sb().from("aop_tbh_member").select("*")
    .eq("zm_email", zmEmail).eq("fy", FY).order("created_at", { ascending: true });
  return ((data ?? []) as TbhRow[]).map(tbhToUser);
}
export async function liveAddTbh(
  zmEmail: string, name: string, role: string, baseLocation: string,
): Promise<User | null> {
  const { data, error } = await sb().from("aop_tbh_member")
    .insert({ zm_email: zmEmail, name: name || "To Be Hired", role, base_location: baseLocation })
    .select("*").single();
  if (error || !data) return null;
  return tbhToUser(data as TbhRow);
}
export async function liveUpdateTbh(
  id: string, patch: { name?: string; role?: string; base_location?: string; mapped_email?: string | null },
): Promise<void> {
  await sb().from("aop_tbh_member").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
}

export async function liveListZms(): Promise<{ email: string; name: string; city_district: string | null }[]> {
  const { data, error } = await sb().rpc("aop_list_zms");
  if (error || !data) return [];
  return data as { email: string; name: string; city_district: string | null }[];
}

export async function liveDistrictsForState(state: string): Promise<string[]> {
  const { data } = await sb().rpc("aop_districts_for_state", { p_state: state });
  return ((data ?? []) as { district: string }[]).map((d) => d.district);
}

// Districts of the employee's OWN state (derived server-side from emp_record).
// This is what drives the assigned-district dropdown in live mode.
export async function liveDistrictsForEmployee(email: string): Promise<string[]> {
  const { data, error } = await sb().rpc("aop_districts_for_employee", { p_email: email });
  if (error || !data) return [];
  return (data as { district: string }[]).map((d) => d.district);
}

export interface MemberSnapshot {
  revenue?: {
    last_year_revenue: number; early_years_ly: number; math_science_ly: number;
    other_categories_ly: number; current_aov: number;
  };
  // Spec-correct per-school AOV (FY26-27 valid orders, bulk excluded). Top-level
  // so it survives even when there is no aop_src_revenue_ly row for the member.
  aov?: number;
  universe?: { total_schools: number; active_schools: number; user_schools: number; non_user_schools: number };
  chain?: number;
  ytd?: number;
  categories?: { category: string; current_count: number; active_count?: number; user_count?: number }[];
}

export async function liveSnapshot(email: string): Promise<MemberSnapshot> {
  const { data } = await sb().rpc("aop_member_snapshot", { p_email: email });
  return (data ?? {}) as MemberSnapshot;
}

// Batched: every team member's snapshot in ONE call (avoids N parallel heavy
// RPCs that overload the DB and return 500 → blank data).
export async function liveTeamSnapshot(zmEmail: string): Promise<Map<string, MemberSnapshot>> {
  const m = new Map<string, MemberSnapshot>();
  const { data, error } = await sb().rpc("aop_team_snapshot", { p_zm_email: zmEmail });
  if (error || !data) return m;
  (data as { employee_email: string; snapshot: MemberSnapshot }[]).forEach((r) =>
    m.set(r.employee_email, (r.snapshot ?? {}) as MemberSnapshot),
  );
  return m;
}

// ---- Master (one submission per ZM per FY) --------------------------------

export async function ensureMaster(zmEmail: string): Promise<{ aopId: string; status: AopStatus }> {
  const c = sb();
  const { data: existing } = await c
    .from("aop_master").select("id,status").eq("zm_email", zmEmail).eq("fy", FY).maybeSingle();
  if (existing) return { aopId: existing.id as string, status: existing.status as AopStatus };
  const { data: created, error } = await c
    .from("aop_master").insert({ zm_email: zmEmail, fy: FY }).select("id,status").single();
  if (error || !created) throw error ?? new Error("Failed to create aop_master");
  return { aopId: created.id as string, status: created.status as AopStatus };
}

// ---- Row <-> Aop section mappers ------------------------------------------

function applyRevenue(aop: Aop, r: Record<string, number>) {
  aop.revenue.lastYearRevenue = nz(r.last_year_revenue);
  aop.revenue.earlyYearsRevenueLY = nz(r.early_years_ly);
  aop.revenue.mathScienceRevenueLY = nz(r.math_science_ly);
  aop.revenue.otherCategoriesRevenueLY = nz(r.other_categories_ly);
  aop.revenue.currentAov = nz(r.current_aov);
  aop.revenue.totalRevenueTarget = nz(r.total_revenue_target);
  aop.revenue.earlyYearsTarget = nz(r.early_years_target);
  aop.revenue.mathScienceTarget = nz(r.math_science_target);
  aop.revenue.otherCategoriesTarget = nz(r.other_categories_target);
  aop.revenue.stemTarget = nz(r.stem_target);
  aop.revenue.panelTarget = nz(r.panel_target);
  aop.revenue.targetAov = nz(r.target_aov);
}

function applyUniverse(aop: Aop, u: Record<string, number>) {
  aop.universe.totalSchools = nz(u.total_schools);
  aop.universe.activeSchools = nz(u.active_schools);
  aop.universe.userSchools = nz(u.user_schools);
  aop.universe.nonUserSchools = nz(u.non_user_schools);
  aop.universe.retentionPlan = nz(u.retention_plan_pct);
  aop.universe.retentionSchoolCount = nz(u.retention_school_count);
  aop.universe.retentionPlanValue = nz(u.retention_plan_value);
  aop.universe.bulkDealOpportunities = nz(u.bulk_deal_opportunities);
}

function applySampling(aop: Aop, s: Record<string, number>) {
  aop.sampling.userSchoolsSampling = nz(s.user_schools_sampling);
  aop.sampling.nonUserSchoolsSampling = nz(s.non_user_schools_sampling);
  aop.sampling.testPrepSampling = nz(s.test_prep_sampling);
  aop.sampling.testPrepTeacherCount = nz(s.test_prep_teacher_count);
  aop.sampling.earlyYearsSampling = nz(s.early_years_sampling);
  aop.sampling.msSampling = nz(s.ms_sampling);
  aop.sampling.stemSampling = nz(s.stem_sampling);
  aop.sampling.panelSampling = nz(s.panel_sampling);
  aop.sampling.nonUserSchoolConversion = nz(s.non_user_school_conversion_pct);
  aop.sampling.nonUserConversionValue = nz(s.non_user_conversion_value);
  aop.sampling.samplingToOrdersEstimate = nz(s.sampling_to_orders_estimate);
  aop.sampling.samplingToNewSchoolsEstimate = nz(s.sampling_to_new_schools_estimate);
}

function applyTraining(aop: Aop, t: Record<string, number>) {
  aop.training.userSchoolTrainings = nz(t.user_school_trainings);
  aop.training.nonUserSchoolTrainings = nz(t.non_user_school_trainings);
  aop.training.digitalTrainings = nz(t.digital_trainings);
  aop.training.physicalTrainings = nz(t.physical_trainings);
  aop.training.teacherWorkshops = nz(t.teacher_workshops);
  aop.training.principalWorkshops = nz(t.principal_workshops);
  aop.training.stemWorkshops = nz(t.stem_workshops);
  aop.training.productDemonstrations = nz(t.product_demonstrations);
}

function applyCost(aop: Aop, c: Record<string, number>) {
  aop.investment.samplingCost = nz(c.sampling_cost);
  aop.investment.eventCost = nz(c.event_cost);
  aop.investment.giftCost = nz(c.gift_cost);
  aop.investment.travelCost = nz(c.travel_cost);
  aop.investment.reimbursementCost = nz(c.reimbursement_cost);
  aop.investment.todCost = nz(c.tod_cost);
  aop.investment.discountCost = nz(c.discount_cost);
  aop.investment.promotionalCost = nz(c.promotional_cost);
  aop.investment.distributorSupportCost = nz(c.distributor_support_cost);
  aop.investment.otherCost = nz(c.other_cost);
}

const revenueRow = (a: Aop) => ({
  last_year_revenue: a.revenue.lastYearRevenue, early_years_ly: a.revenue.earlyYearsRevenueLY,
  math_science_ly: a.revenue.mathScienceRevenueLY, other_categories_ly: a.revenue.otherCategoriesRevenueLY,
  current_aov: a.revenue.currentAov, total_revenue_target: a.revenue.totalRevenueTarget,
  early_years_target: a.revenue.earlyYearsTarget, math_science_target: a.revenue.mathScienceTarget,
  other_categories_target: a.revenue.otherCategoriesTarget, stem_target: a.revenue.stemTarget,
  panel_target: a.revenue.panelTarget, target_aov: a.revenue.targetAov,
});
const universeRow = (a: Aop) => ({
  total_schools: a.universe.totalSchools, active_schools: a.universe.activeSchools,
  user_schools: a.universe.userSchools, non_user_schools: a.universe.nonUserSchools,
  retention_plan_pct: a.universe.retentionPlan,
  retention_school_count: a.universe.retentionSchoolCount,
  retention_plan_value: a.universe.retentionPlanValue || 0,
  bulk_deal_opportunities: a.universe.bulkDealOpportunities,
});
const samplingRow = (a: Aop) => ({
  user_schools_sampling: a.sampling.userSchoolsSampling, non_user_schools_sampling: a.sampling.nonUserSchoolsSampling,
  test_prep_sampling: a.sampling.testPrepSampling, test_prep_teacher_count: a.sampling.testPrepTeacherCount,
  early_years_sampling: a.sampling.earlyYearsSampling,
  ms_sampling: a.sampling.msSampling, stem_sampling: a.sampling.stemSampling, panel_sampling: a.sampling.panelSampling,
  non_user_school_conversion_pct: a.sampling.nonUserSchoolConversion,
  non_user_conversion_value: a.sampling.nonUserConversionValue,
  sampling_to_orders_estimate: a.sampling.samplingToOrdersEstimate,
  sampling_to_new_schools_estimate: a.sampling.samplingToNewSchoolsEstimate,
});
const trainingRow = (a: Aop) => ({
  user_school_trainings: a.training.userSchoolTrainings, non_user_school_trainings: a.training.nonUserSchoolTrainings,
  digital_trainings: a.training.digitalTrainings, physical_trainings: a.training.physicalTrainings,
  teacher_workshops: a.training.teacherWorkshops, principal_workshops: a.training.principalWorkshops,
  stem_workshops: a.training.stemWorkshops, product_demonstrations: a.training.productDemonstrations,
});
const costRow = (a: Aop) => ({
  sampling_cost: a.investment.samplingCost, event_cost: a.investment.eventCost, gift_cost: a.investment.giftCost,
  travel_cost: a.investment.travelCost, reimbursement_cost: a.investment.reimbursementCost,
  tod_cost: a.investment.todCost, discount_cost: a.investment.discountCost,
  promotional_cost: a.investment.promotionalCost, distributor_support_cost: a.investment.distributorSupportCost,
  other_cost: a.investment.otherCost,
});

// Overlay 🔵 auto fields from a source snapshot, but never overwrite a value
// that is already populated (i.e. previously snapshotted at save time).
function applySnapshot(aop: Aop, snap?: MemberSnapshot) {
  if (!snap) return;
  const set = (cur: number, next?: number) => (cur ? cur : next || 0);
  if (snap.revenue) {
    aop.revenue.lastYearRevenue = set(aop.revenue.lastYearRevenue, snap.revenue.last_year_revenue);
    aop.revenue.earlyYearsRevenueLY = set(aop.revenue.earlyYearsRevenueLY, snap.revenue.early_years_ly);
    aop.revenue.mathScienceRevenueLY = set(aop.revenue.mathScienceRevenueLY, snap.revenue.math_science_ly);
    aop.revenue.otherCategoriesRevenueLY = set(aop.revenue.otherCategoriesRevenueLY, snap.revenue.other_categories_ly);
  }
  // Current AOV = spec-correct per-school AOV (top-level), falling back to the
  // revenue block. Lives outside the revenue guard so it fills even with no LY row.
  aop.revenue.currentAov = set(aop.revenue.currentAov, snap.aov ?? snap.revenue?.current_aov);
  if (snap.universe) {
    aop.universe.totalSchools = set(aop.universe.totalSchools, snap.universe.total_schools);
    aop.universe.activeSchools = set(aop.universe.activeSchools, snap.universe.active_schools);
    aop.universe.userSchools = set(aop.universe.userSchools, snap.universe.user_schools);
    aop.universe.nonUserSchools = set(aop.universe.nonUserSchools, snap.universe.non_user_schools);
  }
}

// ---- Load all member AOPs for a submission --------------------------------

export interface MemberMeta {
  status: AopStatus;
  baseLocation?: string;
  districts?: string[];
  states?: string[];
  blocks?: string[];
}

export async function liveLoadBundle(
  aopId: string, status: AopStatus, team: User[], zmEmail: string,
): Promise<{ aops: Record<string, Aop>; members: Record<string, MemberMeta> }> {
  const c = sb();
  const [rev, uni, samp, tr, cost, appr, mem, col] = await Promise.all([
    c.from("aop_revenue").select("*").eq("aop_id", aopId),
    c.from("aop_universe").select("*").eq("aop_id", aopId),
    c.from("aop_sampling_conversion").select("*").eq("aop_id", aopId),
    c.from("aop_training").select("*").eq("aop_id", aopId),
    c.from("aop_cost").select("*").eq("aop_id", aopId),
    c.from("aop_approval_log").select("*").eq("aop_id", aopId).order("created_at", { ascending: true }),
    c.from("aop_member").select("*").eq("aop_id", aopId),
    c.from("aop_collection").select("*").eq("aop_id", aopId),
  ]);
  const byEmail = <T extends { employee_email: string }>(rows: T[] | null) => {
    const m = new Map<string, T>();
    (rows ?? []).forEach((r) => m.set(r.employee_email, r));
    return m;
  };
  const revM = byEmail(rev.data as { employee_email: string }[]);
  const uniM = byEmail(uni.data as { employee_email: string }[]);
  const sampM = byEmail(samp.data as { employee_email: string }[]);
  const trM = byEmail(tr.data as { employee_email: string }[]);
  const costM = byEmail(cost.data as { employee_email: string }[]);
  const memM = byEmail(mem.data as { employee_email: string }[]);
  const colM = byEmail(col.data as { employee_email: string }[]);

  // Snapshot every member in ONE batched call (the 🔵 "today" numbers — AOV,
  // schools-in-area, per-category active/user split — are live source data).
  const snaps = await liveTeamSnapshot(zmEmail);

  // Saved category rows (target/conv) link via universe_id.
  const universeIds = [...uniM.values()]
    .map((r) => (r as { unique_id?: string }).unique_id).filter(Boolean) as string[];
  const catByEmail = new Map<string, Map<string, SavedCat>>();
  if (universeIds.length) {
    const { data: catRows } = await c
      .from("aop_universe_category").select("*").in("universe_id", universeIds);
    (catRows ?? []).forEach((r: Record<string, unknown>) => {
      const email = r.employee_email as string;
      const m = catByEmail.get(email) ?? new Map<string, SavedCat>();
      m.set(r.category as string, {
        current_count: Number(r.current_count) || 0,
        target_count: nz(r.target_count),
        sampling_count: nz(r.sampling_count),
        conversion_count: nz(r.conversion_count),
        projected_conversion_pct: nz(r.projected_conversion_pct),
      });
      catByEmail.set(email, m);
    });
  }

  const out: Record<string, Aop> = {};
  const members: Record<string, MemberMeta> = {};
  for (const u of team) {
    const a = defaultAop(u.id);
    // Per-member status (Program Team approves each plan). Falls back to the
    // zone status only if there's no member row at all.
    const mm = memM.get(u.email) as Record<string, unknown> | undefined;
    a.status = ((mm?.status as AopStatus) || (mm ? "draft" : status) || "not_started") as AopStatus;
    members[u.email] = {
      status: a.status,
      baseLocation: (mm?.base_location as string) ?? undefined,
      districts: (mm?.districts as string[]) ?? undefined,
      states: (mm?.states as string[]) ?? undefined,
      blocks: (mm?.blocks as string[]) ?? undefined,
    };
    const r = revM.get(u.email); if (r) applyRevenue(a, r as unknown as Record<string, number>);
    const un = uniM.get(u.email); if (un) applyUniverse(a, un as unknown as Record<string, number>);
    const s = sampM.get(u.email); if (s) applySampling(a, s as unknown as Record<string, number>);
    const t = trM.get(u.email); if (t) applyTraining(a, t as unknown as Record<string, number>);
    const cs = costM.get(u.email); if (cs) applyCost(a, cs as unknown as Record<string, number>);
    const cl = colM.get(u.email) as { milestones?: unknown } | undefined;
    if (cl?.milestones && Array.isArray(cl.milestones)) {
      a.collection.milestoneRows = (cl.milestones as Record<string, unknown>[]).map((m) => ({
        id: String(m.id ?? `cm-${Math.random().toString(36).slice(2, 7)}`),
        month: (m.month as string) ?? "",
        collectionPct: m.collectionPct == null ? NaN : Number(m.collectionPct),
        collectionAmount: Number(m.collectionAmount) || 0,
        cumulativeAmount: Number(m.cumulativeAmount) || 0,
      }));
    }
    applySnapshot(a, snaps.get(u.email)); // fills 🔵 fields only where not already saved
    a.universe.categories = buildCategories(
      snaps.get(u.email), catByEmail.get(u.email) ?? new Map(), a.revenue.currentAov);
    out[u.id] = a;
  }
  // approvals belong to the whole submission; attach to every member's view
  const approvals = (appr.data ?? []).map((e: Record<string, unknown>, i: number) => ({
    id: (e.id as string) ?? `ap-${i}`, aopId, action: e.action as ApprovalAction,
    byUserId: (e.by_email as string) ?? "", comment: (e.comment as string) ?? "",
    createdAt: (e.created_at as string) ?? "",
  }));
  Object.values(out).forEach((a) => (a.approvals = approvals));
  return { aops: out, members };
}

// ---- Writes ---------------------------------------------------------------

export async function liveSaveAop(aopId: string, zmEmail: string, aop: Aop): Promise<void> {
  const c = sb();
  const keys = { aop_id: aopId, employee_email: aop.userId, zm_email: zmEmail };
  const onConflict = "aop_id,employee_email";

  // Universe header first so we have its id for the category sub-rows.
  const { data: uniRow } = await c
    .from("aop_universe").upsert(nullifyNaN({ ...keys, ...universeRow(aop) }), { onConflict })
    .select("unique_id").single();
  const universeId = (uniRow as { unique_id?: string } | null)?.unique_id;

  const tasks: PromiseLike<unknown>[] = [
    c.from("aop_revenue").upsert(nullifyNaN({ ...keys, ...revenueRow(aop) }), { onConflict }),
    c.from("aop_sampling_conversion").upsert(nullifyNaN({ ...keys, ...samplingRow(aop) }), { onConflict }),
    c.from("aop_training").upsert(nullifyNaN({ ...keys, ...trainingRow(aop) }), { onConflict }),
    c.from("aop_cost").upsert(nullifyNaN({ ...keys, ...costRow(aop) }), { onConflict }),
    c.from("aop_collection").upsert(
      nullifyNaN({ ...keys, collection_percent: 100, // collect the full revenue target
        total_revenue_target: aop.revenue.totalRevenueTarget,
        milestones: aop.collection.milestoneRows.map((r) => ({
          ...r, collectionPct: Number.isFinite(r.collectionPct) ? r.collectionPct : null,
        })) }), { onConflict }),
    c.from("aop_member").upsert({ ...keys, is_filled: true }, { onConflict }),
  ];

  if (universeId) {
    const valid = UNIVERSE_CATEGORIES as readonly string[];
    const catRows = aop.universe.categories
      .filter((cat) => valid.includes(cat.category))
      .map((cat) => nullifyNaN({
        universe_id: universeId, employee_email: aop.userId, zm_email: zmEmail,
        category: cat.category, current_count: cat.currentCount, target_count: cat.targetCount,
        sampling_count: cat.samplingCount, conversion_count: cat.conversionCount,
        projected_conversion_pct: cat.projectedConversion, exp_revenue: cat.projectedRevenue,
      }));
    if (catRows.length) {
      tasks.push(c.from("aop_universe_category").upsert(catRows, { onConflict: "universe_id,category" }));
    }
  }
  await Promise.all(tasks);
  // A filled-but-unsubmitted plan is a "draft". Promote only from not_started so
  // we never downgrade a submitted/approved member.
  await c.from("aop_member").update({ status: "draft" })
    .eq("aop_id", aopId).eq("employee_email", aop.userId).eq("status", "not_started");
}

const STATUS_FOR: Record<ApprovalAction, AopStatus> = {
  submit: "submitted", approve: "approved", reject: "rejected", request_changes: "changes_requested",
};

// Per-member approval: status lives on aop_member; the log is keyed by member.
export async function liveRecordApproval(
  aopId: string, memberEmail: string, action: ApprovalAction, byEmail: string, comment: string,
): Promise<void> {
  const c = sb();
  await c.from("aop_approval_log").insert({ aop_id: aopId, employee_email: memberEmail, action, by_email: byEmail, comment });
  const patch: Record<string, unknown> = { status: STATUS_FOR[action], updated_at: new Date().toISOString() };
  if (action === "submit") patch.submitted_at = new Date().toISOString();
  else { patch.reviewed_by = byEmail; patch.reviewed_at = new Date().toISOString(); }
  await c.from("aop_member").update(patch).eq("aop_id", aopId).eq("employee_email", memberEmail);
}

export async function liveUpdateProfile(
  aopId: string, zmEmail: string, email: string,
  baseLocation: string, districts: string[], states: string[] = [], blocks: string[] = [],
): Promise<void> {
  await sb().from("aop_member").upsert(
    { aop_id: aopId, employee_email: email, zm_email: zmEmail, base_location: baseLocation, districts, states, blocks },
    { onConflict: "aop_id,employee_email" });
}

// ---- Territory pickers (powered by all_india_schools) ---------------------

export async function liveStates(): Promise<string[]> {
  const { data } = await sb().rpc("aop_states");
  return ((data ?? []) as { state: string }[]).map((d) => d.state);
}
// States with the count of English-medium schools per state, to label the
// Assigned States picker as "Rajasthan (12345 schools)". Backed by a precomputed
// lookup table so it stays fast under the anon statement timeout.
export async function liveStatesWithEnglishCount(): Promise<{ state: string; englishCount: number }[]> {
  const { data } = await sb().rpc("aop_states_with_english_count");
  return ((data ?? []) as { state: string; english_count: number }[]).map((d) => ({
    state: d.state,
    englishCount: Number(d.english_count) || 0,
  }));
}
export async function liveDistrictsForStates(states: string[]): Promise<string[]> {
  if (!states.length) return [];
  const { data } = await sb().rpc("aop_districts_for_states", { p_states: states });
  return ((data ?? []) as { district: string }[]).map((d) => d.district);
}
// Districts for the selected state(s) with the count of English-medium schools
// (19-English in any of medium_1..4) per district. Used to label the Assigned
// Districts picker as "Indore (1726)".
export async function liveDistrictsWithEnglishCount(
  states: string[],
): Promise<{ district: string; englishCount: number }[]> {
  if (!states.length) return [];
  const { data } = await sb().rpc("aop_districts_with_english_count", { p_states: states });
  return ((data ?? []) as { district: string; english_count: number }[]).map((d) => ({
    district: d.district,
    englishCount: Number(d.english_count) || 0,
  }));
}
export async function liveBlocksForDistricts(districts: string[]): Promise<string[]> {
  if (!districts.length) return [];
  const { data } = await sb().rpc("aop_blocks_for_districts", { p_districts: districts });
  return ((data ?? []) as { block: string }[]).map((d) => d.block);
}
// Blocks for the selected district(s) with the count of English-medium schools
// per block. Used to label the Assigned Blocks picker as "Bareilly Town (538 schools)".
export async function liveBlocksWithEnglishCount(
  districts: string[],
): Promise<{ block: string; englishCount: number }[]> {
  if (!districts.length) return [];
  const { data } = await sb().rpc("aop_blocks_with_english_count", { p_districts: districts });
  return ((data ?? []) as { block: string; english_count: number }[]).map((d) => ({
    block: d.block,
    englishCount: Number(d.english_count) || 0,
  }));
}
export async function liveTerritoryDefaults(email: string): Promise<{ state: string | null; district: string | null }> {
  const { data } = await sb().rpc("aop_territory_defaults", { p_email: email });
  const row = ((data ?? []) as { state: string | null; district: string | null }[])[0];
  return { state: row?.state ?? null, district: row?.district ?? null };
}

// ---- Last-year collection reference (Collection stage) --------------------
// Per-employee distributor commitments vs actual cash, from aop_last_year_collection().
// Commitment % = cumulative-as-stored commitment % x order value, weighted over
//   total order value. Collection % / Actual = validated payments that month.
// donbosco's zone reads the backend tables; everyone else the original sources.

export interface LycMonthRow {
  month: string; mkey: string;
  commitment_pct: number;            // cumulative-as-stored, weighted over total order value (%)
  collection_pct: number | null;     // null = upcoming month (no collection yet)
  actual: number | null;             // ₹ collected that month; null = upcoming month
}
export interface LastYearCollection {
  totals: { employee_order_value: number; actual_total: number; collection_pct: number };
  months: LycMonthRow[];
}

export async function liveLastYearCollection(email: string): Promise<LastYearCollection | null> {
  const { data, error } = await sb().rpc("aop_last_year_collection", { p_email: email });
  if (error || !data) return null;
  return data as LastYearCollection;
}

// ---- Admin (Program Team) cross-zone overview -----------------------------

export interface AdminOverviewRow {
  zm_email: string; zm_name: string; member_email: string; member_name: string;
  member_role: string; city_district: string | null; member_status: AopStatus;
  is_filled: boolean; revenue_target: number | null; target_aov: number | null; target_schools: number | null;
  last_year_revenue: number | null; active_schools: number | null;
}
export async function liveAdminOverview(): Promise<AdminOverviewRow[]> {
  const { data, error } = await sb().rpc("aop_admin_overview");
  if (error || !data) return [];
  return data as AdminOverviewRow[];
}
export interface AdminTargetRow {
  zm_email: string; zm_name: string; member_email: string; member_name: string;
  member_role: string; city_district: string | null; member_status: AopStatus; is_filled: boolean;
  last_year_revenue: number | null; total_revenue_target: number | null; early_years_target: number | null;
  math_science_target: number | null; other_books_target: number | null; stem_target: number | null;
  panel_target: number | null; current_aov: number | null; target_aov: number | null;
  total_schools: number | null; active_schools: number | null; user_schools: number | null;
  non_user_schools: number | null; target_schools: number | null; sampling_schools: number | null;
  conversion_schools: number | null; retention_count: number | null; retention_value: number | null;
  collection_target: number | null; milestones: unknown;
}
export async function liveAdminTargets(): Promise<AdminTargetRow[]> {
  const { data, error } = await sb().rpc("aop_admin_targets");
  if (error || !data) return [];
  return data as AdminTargetRow[];
}

export interface AdminHiringRow { zm_email: string; status: string; requests: number; positions: number }
export async function liveAdminHiring(): Promise<AdminHiringRow[]> {
  const { data, error } = await sb().rpc("aop_admin_hiring");
  if (error || !data) return [];
  return data as AdminHiringRow[];
}
export async function liveMemberSetStatus(
  memberEmail: string, zmEmail: string, action: ApprovalAction, byEmail: string, comment: string,
): Promise<void> {
  await sb().rpc("aop_member_set_status", {
    p_member_email: memberEmail, p_zm_email: zmEmail, p_action: action, p_by_email: byEmail, p_comment: comment,
  });
}

// ---- Hiring (single source: k8_hiring) ------------------------------------
// k8_hiring holds BOTH the HR recruitment pipeline (source='HR_SYNC', fed by the
// external sync) and the ZM's AOP planning requests (source='AOP', written here).

function toK8(r: Record<string, unknown>): K8HiringRow {
  const s = (v: unknown): string | null => (v == null ? null : String(v));
  const n = (v: unknown): number | null => (v == null || v === "" ? null : Number(v));
  return {
    id: String(r.id),
    source: (r.source as K8HiringRow["source"]) ?? "HR_SYNC",
    aopRef: s(r.aop_ref),
    sNo: n(r.s_no),
    state: s(r.state),
    district: s(r.base_location_district),
    block: s(r.block),
    designation: s(r.designation),
    role: s(r.role),
    status: s(r.status),
    hrStatus: s(r.hr_status),
    zmStatus: s(r.zm_status),
    expectedDoj: s(r.expected_doj),
    joiningDate: s(r.joining_date),
    reasonForDroppingOut: s(r.reason_for_dropping_out),
    reqId: s(r.req_id),
    reportingZm: s(r.reporting_zm),
    reportingManager: s(r.reporting_manager),
    zmEmail: s(r.zm_email),
    forEmployeeEmail: s(r.for_employee_email),
    numberOfPositions: n(r.number_of_positions),
    priority: s(r.priority),
    hiringReason: s(r.hiring_reason),
    businessJustification: s(r.business_justification),
    expectedRevenueImpact: n(r.expected_revenue_impact),
    hiringTimeline: s(r.hiring_timeline),
    createdAt: s(r.created_at),
  };
}

// Map an AOP-origin k8 row onto the legacy HiringRequest shape so dashboard /
// rollup hiring counts (forUserId, numberOfPositions) keep working unchanged.
export function k8ToHiringRequest(r: K8HiringRow): HiringRequest {
  return {
    id: r.id,
    requestedByUserId: r.zmEmail ?? "",
    forUserId: r.forEmployeeEmail,
    districtIds: r.district ? [r.district] : [],
    baseLocation: r.district ?? "",
    designation: r.designation ?? "BDA",
    numberOfPositions: r.numberOfPositions ?? 1,
    priority: (r.priority as HiringRequest["priority"]) ?? "High",
    reason: (r.hiringReason as HiringRequest["reason"]) ?? "Business Growth",
    businessJustification: r.businessJustification ?? "",
    expectedRevenueImpact: r.expectedRevenueImpact ?? 0,
    hiringTimeline: r.hiringTimeline ?? "",
    status: (r.status as HiringRequest["status"]) ?? "Requested",
    createdAt: r.createdAt ?? "",
  };
}

// All hiring rows visible to a ZM: HR-sync rows (matched by reporting_zm name via
// emp_record) + their own AOP requests (zm_email). Scoped server-side in the RPC.
export async function liveK8Hiring(zmEmail: string): Promise<K8HiringRow[]> {
  const { data, error } = await sb().rpc("aop_k8_hiring", { p_zm_email: zmEmail });
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map(toK8);
}

// Admin (Program Team) rollup: every k8_hiring row across all ZMs.
export async function liveAdminK8Hiring(): Promise<K8HiringRow[]> {
  const { data, error } = await sb().rpc("aop_admin_k8_hiring");
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map(toK8);
}

export interface K8AddInput {
  zmEmail: string;
  zmName: string;
  aopId: string | null;
  forEmployeeEmail: string | null;
  designation: string;
  role: string;
  state: string;
  district: string;
  districts: string[];
  block: string;
  numberOfPositions: number;
  priority: string;
  hiringReason: string;
  businessJustification: string;
  expectedRevenueImpact: number;
  hiringTimeline: string;
}

// Insert an AOP-origin requirement. The DB trigger stamps aop_ref automatically.
export async function liveAddK8Hiring(input: K8AddInput): Promise<K8HiringRow | null> {
  const { data, error } = await sb().from("k8_hiring").insert({
    source: "AOP",
    status: "Requested",
    zm_status: "Pending",
    reporting_zm: input.zmName,
    zm_email: input.zmEmail,
    aop_id: input.aopId,
    for_employee_email: input.forEmployeeEmail,
    designation: input.designation,
    role: input.role,
    state: input.state || null,
    base_location_district: input.district || null,
    districts: input.districts,
    block: input.block || null,
    number_of_positions: input.numberOfPositions,
    priority: input.priority,
    hiring_reason: input.hiringReason,
    business_justification: input.businessJustification,
    expected_revenue_impact: input.expectedRevenueImpact,
    hiring_timeline: input.hiringTimeline,
  }).select("*").single();
  if (error || !data) return null;
  return toK8(data as Record<string, unknown>);
}

// ZM status update on a k8 row (drives both the overall + zm_status columns).
export async function liveUpdateK8Status(id: string, status: string): Promise<void> {
  await sb().from("k8_hiring").update({ status, zm_status: status }).eq("id", id);
}
