"use client";

// ---------------------------------------------------------------------------
// Live data-access layer for the AOP platform (Performance Dashboard project).
// Reference reads (login / team / snapshots) go through SECURITY DEFINER RPCs;
// the aop_* capture tables are read/written directly. Falls back to MOCK mode
// in the store when `supabaseConfigured` is false.
// ---------------------------------------------------------------------------

import { createClient } from "./client";
import { defaultAop } from "../mock-data";
import type { Aop, ApprovalAction, AopStatus, HiringRequest, Role, SchoolCategoryPlan, User } from "../types";

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

interface SavedCat { current_count: number; target_count: number; projected_conversion_pct: number }

function buildCategories(
  snap: MemberSnapshot | undefined, saved: Map<string, SavedCat>, currentAov: number,
): SchoolCategoryPlan[] {
  const snapMap = new Map<string, number>();
  (snap?.categories ?? []).forEach((c) => snapMap.set(c.category, c.current_count));
  return UNIVERSE_CATEGORIES.map((cat) => {
    const sv = saved.get(cat);
    const current = sv?.current_count ?? (cat === "Chain" ? snap?.chain ?? 0 : snapMap.get(cat) ?? 0);
    const target = sv ? sv.target_count : NaN;          // blank until entered
    const conv = sv ? sv.projected_conversion_pct : NaN;
    return {
      category: cat,
      currentCount: current,
      targetCount: target,
      projectedConversion: conv,
      projectedRevenue: Math.round(target * (conv / 100) * currentAov), // auto = target × conv% × AOV
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
    designation: r.role === "ZDM" ? "Zonal Manager" : r.role === "ADMIN" ? "Program Team" : r.role,
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

export async function liveTeam(zmEmail: string): Promise<User[]> {
  const { data, error } = await sb().rpc("aop_team", { p_zm_email: zmEmail });
  if (error || !data) return [];
  return (data as EmpRow[]).map(toUser);
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

export interface MemberSnapshot {
  revenue?: {
    last_year_revenue: number; early_years_ly: number; math_science_ly: number;
    other_categories_ly: number; current_aov: number;
  };
  universe?: { total_schools: number; active_schools: number; user_schools: number; non_user_schools: number };
  chain?: number;
  ytd?: number;
  categories?: { category: string; current_count: number }[];
}

export async function liveSnapshot(email: string): Promise<MemberSnapshot> {
  const { data } = await sb().rpc("aop_member_snapshot", { p_email: email });
  return (data ?? {}) as MemberSnapshot;
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
  aop.universe.retentionPlanValue = nz(u.retention_plan_value);
  aop.universe.bulkDealOpportunities = nz(u.bulk_deal_opportunities);
}

function applySampling(aop: Aop, s: Record<string, number>) {
  aop.sampling.userSchoolsSampling = nz(s.user_schools_sampling);
  aop.sampling.nonUserSchoolsSampling = nz(s.non_user_schools_sampling);
  aop.sampling.testPrepSampling = nz(s.test_prep_sampling);
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
  retention_plan_value: a.universe.retentionPlanValue || 0,
  bulk_deal_opportunities: a.universe.bulkDealOpportunities,
});
const samplingRow = (a: Aop) => ({
  user_schools_sampling: a.sampling.userSchoolsSampling, non_user_schools_sampling: a.sampling.nonUserSchoolsSampling,
  test_prep_sampling: a.sampling.testPrepSampling, early_years_sampling: a.sampling.earlyYearsSampling,
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
    aop.revenue.currentAov = set(aop.revenue.currentAov, snap.revenue.current_aov);
  }
  if (snap.universe) {
    aop.universe.totalSchools = set(aop.universe.totalSchools, snap.universe.total_schools);
    aop.universe.activeSchools = set(aop.universe.activeSchools, snap.universe.active_schools);
    aop.universe.userSchools = set(aop.universe.userSchools, snap.universe.user_schools);
    aop.universe.nonUserSchools = set(aop.universe.nonUserSchools, snap.universe.non_user_schools);
  }
}

// ---- Load all member AOPs for a submission --------------------------------

export async function liveLoadBundle(
  aopId: string, status: AopStatus, team: User[],
): Promise<Record<string, Aop>> {
  const c = sb();
  const [rev, uni, samp, tr, cost, col, appr] = await Promise.all([
    c.from("aop_revenue").select("*").eq("aop_id", aopId),
    c.from("aop_universe").select("*").eq("aop_id", aopId),
    c.from("aop_sampling_conversion").select("*").eq("aop_id", aopId),
    c.from("aop_training").select("*").eq("aop_id", aopId),
    c.from("aop_cost").select("*").eq("aop_id", aopId),
    c.from("aop_collection").select("*").eq("aop_id", aopId),
    c.from("aop_approval_log").select("*").eq("aop_id", aopId).order("created_at", { ascending: true }),
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
  const colM = byEmail(col.data as { employee_email: string }[]);

  // Members with no saved revenue/universe row yet need their 🔵 auto numbers
  // pulled live from the source views (snapshot is frozen only once they save).
  const needSnapshot = team.filter((u) => !revM.has(u.email) || !uniM.has(u.email));
  const snaps = new Map<string, MemberSnapshot>();
  await Promise.all(
    needSnapshot.map(async (u) => { snaps.set(u.email, await liveSnapshot(u.email)); }),
  );

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
        projected_conversion_pct: nz(r.projected_conversion_pct),
      });
      catByEmail.set(email, m);
    });
  }

  const out: Record<string, Aop> = {};
  for (const u of team) {
    const a = defaultAop(u.id);
    a.status = status;
    const r = revM.get(u.email); if (r) applyRevenue(a, r as unknown as Record<string, number>);
    const un = uniM.get(u.email); if (un) applyUniverse(a, un as unknown as Record<string, number>);
    const s = sampM.get(u.email); if (s) applySampling(a, s as unknown as Record<string, number>);
    const t = trM.get(u.email); if (t) applyTraining(a, t as unknown as Record<string, number>);
    const cs = costM.get(u.email); if (cs) applyCost(a, cs as unknown as Record<string, number>);
    const cl = colM.get(u.email) as { collection_percent?: number } | undefined;
    a.collection.collectionPercent = cl?.collection_percent ?? 80;
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
  return out;
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
      nullifyNaN({ ...keys, collection_percent: aop.collection.collectionPercent || 80,
        total_revenue_target: aop.revenue.totalRevenueTarget }), { onConflict }),
    c.from("aop_member").upsert({ ...keys, is_filled: true }, { onConflict }),
  ];

  if (universeId) {
    const valid = UNIVERSE_CATEGORIES as readonly string[];
    const catRows = aop.universe.categories
      .filter((cat) => valid.includes(cat.category))
      .map((cat) => nullifyNaN({
        universe_id: universeId, employee_email: aop.userId, zm_email: zmEmail,
        category: cat.category, current_count: cat.currentCount, target_count: cat.targetCount,
        projected_conversion_pct: cat.projectedConversion, exp_revenue: cat.projectedRevenue,
      }));
    if (catRows.length) {
      tasks.push(c.from("aop_universe_category").upsert(catRows, { onConflict: "universe_id,category" }));
    }
  }
  await Promise.all(tasks);
}

const STATUS_FOR: Record<ApprovalAction, AopStatus> = {
  submit: "submitted", approve: "approved", reject: "rejected", request_changes: "changes_requested",
};

export async function liveRecordApproval(
  aopId: string, action: ApprovalAction, byEmail: string, comment: string,
): Promise<void> {
  const c = sb();
  await c.from("aop_approval_log").insert({ aop_id: aopId, action, by_email: byEmail, comment });
  const patch: Record<string, unknown> = { status: STATUS_FOR[action], updated_at: new Date().toISOString() };
  if (action === "submit") patch.submitted_at = new Date().toISOString();
  else { patch.reviewed_by = byEmail; patch.reviewed_at = new Date().toISOString(); }
  await c.from("aop_master").update(patch).eq("id", aopId);
}

export async function liveUpdateProfile(
  aopId: string, zmEmail: string, email: string, baseLocation: string, districts: string[],
): Promise<void> {
  await sb().from("aop_member").upsert(
    { aop_id: aopId, employee_email: email, zm_email: zmEmail, base_location: baseLocation, districts },
    { onConflict: "aop_id,employee_email" });
}

// ---- Hiring ---------------------------------------------------------------

function rowToHiring(r: Record<string, unknown>): HiringRequest {
  return {
    id: r.unique_id as string,
    requestedByUserId: (r.zm_email as string) ?? "",
    forUserId: (r.for_employee_email as string) ?? null,
    districtIds: (r.districts as string[]) ?? [],
    baseLocation: (r.base_location as string) ?? "",
    designation: (r.designation as string) ?? "BDA",
    numberOfPositions: Number(r.number_of_positions) || 1,
    priority: r.priority as HiringRequest["priority"],
    reason: r.reason as HiringRequest["reason"],
    businessJustification: (r.business_justification as string) ?? "",
    expectedRevenueImpact: Number(r.expected_revenue_impact) || 0,
    hiringTimeline: (r.hiring_timeline as string) ?? "",
    status: r.status as HiringRequest["status"],
    createdAt: (r.created_at as string) ?? "",
  };
}

export async function liveLoadHiring(aopId: string): Promise<HiringRequest[]> {
  const { data } = await sb()
    .from("aop_hiring").select("*").eq("aop_id", aopId).order("created_at", { ascending: false });
  return ((data ?? []) as Record<string, unknown>[]).map(rowToHiring);
}

export async function liveAddHiring(
  aopId: string, zmEmail: string,
  req: Omit<HiringRequest, "id" | "createdAt" | "requestedByUserId" | "status">,
): Promise<HiringRequest | null> {
  const { data, error } = await sb().from("aop_hiring").insert({
    aop_id: aopId, zm_email: zmEmail, for_employee_email: req.forUserId,
    base_location: req.baseLocation, districts: req.districtIds, designation: req.designation,
    number_of_positions: req.numberOfPositions, priority: req.priority, reason: req.reason,
    hiring_timeline: req.hiringTimeline, business_justification: req.businessJustification,
    expected_revenue_impact: req.expectedRevenueImpact,
  }).select("*").single();
  if (error || !data) return null;
  return rowToHiring(data as Record<string, unknown>);
}

export async function liveUpdateHiringStatus(id: string, status: HiringRequest["status"]): Promise<void> {
  await sb().from("aop_hiring").update({ status, updated_at: new Date().toISOString() }).eq("unique_id", id);
}
