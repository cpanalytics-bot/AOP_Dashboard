// ---------------------------------------------------------------------------
// Domain types for the AOP Platform.
// Mirrors Supabase schema (see /supabase/migrations/).
// ---------------------------------------------------------------------------

export type Role = "ADMIN" | "ZDM" | "BDM" | "BDA";

export const FY = "FY26-27" as const;
export type FiscalYear = typeof FY;

export type AopStatus =
  | "not_started"
  | "draft"
  | "submitted"
  | "in_review"
  | "changes_requested"
  | "approved"
  | "rejected";

export type HiringStatus =
  | "Requested"
  | "Approved"
  | "In Progress"
  | "Closed";

export type HiringPriority = "Critical" | "High" | "Medium" | "Low";

export type HiringReason =
  | "New Territory Expansion"
  | "Territory Split"
  | "High Potential Market"
  | "Backfill"
  | "Attrition Replacement"
  | "Business Growth"
  | "Strategic Account Requirement";

export type ApprovalAction =
  | "submit"
  | "approve"
  | "reject"
  | "request_changes";

export interface Zone {
  id: string;
  code: string;
  name: string;
  collectionPercent: number;
}

export interface District {
  id: string;
  code: string;
  name: string;
  state: string;
  zoneId: string;
}

export interface Block {
  id: string;
  code: string;
  name: string;
  districtId: string;
}

export interface User {
  id: string;
  employeeCode: string;
  name: string;
  email: string;
  role: Role;
  designation: string;
  baseLocation: string;
  zoneId: string;
  districtIds: string[];
  reportingManagerId: string | null;
  currentRevenue: number;
  currentTarget: number;
  isActive?: boolean;
}

export interface HiringRequest {
  id: string;
  requestedByUserId: string;
  forUserId: string | null;
  districtIds: string[];
  baseLocation: string;
  designation: Role | string;
  numberOfPositions: number;
  priority: HiringPriority;
  reason: HiringReason;
  businessJustification: string;
  expectedRevenueImpact: number;
  hiringTimeline: string;
  status: HiringStatus;
  createdAt: string;
}

export interface RevenueTargets {
  lastYearRevenue: number;
  earlyYearsRevenueLY: number;
  mathScienceRevenueLY: number;
  otherCategoriesRevenueLY: number;
  stemRevenueLY: number;
  panelRevenueLY: number;
  currentAov: number;
  currentRevenuePerSchool: number;
  totalRevenueTarget: number;
  earlyYearsTarget: number;
  mathScienceTarget: number;
  otherCategoriesTarget: number;
  stemTarget: number;
  panelTarget: number;
  targetAov: number;
  targetRevenuePerSchool: number;
}

export interface SchoolCategoryPlan {
  category:
    | "Chain Schools"
    | "Premium Schools"
    | "Category A"
    | "Category B"
    | "Category C";
  currentCount: number;
  targetCount: number;
  projectedRevenue: number;
  projectedConversion: number;
}

export interface UniversePlanning {
  totalSchools: number;
  activeSchools: number;
  userSchools: number;
  nonUserSchools: number;
  categories: SchoolCategoryPlan[];
  activeSchoolAdditionPlan: number;
  newSchoolAcquisitionPlan: number;
  retentionPlan: number;
  keyAccountPlan: string;
  chainSchoolExpansionPlan: string;
  premiumSchoolStrategy: string;
  existingDistributor: string;
  newDistributorRequired: boolean;
  strategicDistributorOpportunity: string;
  bulkDealOpportunities: number;
  largeInstitutionalOpportunities: number;
}

export interface SamplingPlanning {
  userSchoolsSampling: number;
  nonUserSchoolsSampling: number;
  testPrepSampling: number;
  earlyYearsSampling: number;
  msSampling: number;
  stemSampling: number;
  panelSampling: number;
  costPerSample: number;
  userSchoolConversion: number;
  nonUserSchoolConversion: number;
  samplingToRevenueEstimate: number;
  samplingToOrdersEstimate: number;
  samplingToNewSchoolsEstimate: number;
  uniqueSamplingFactor: number;
}

export interface TrainingPlanning {
  userSchoolTrainings: number;
  nonUserSchoolTrainings: number;
  digitalTrainings: number;
  physicalTrainings: number;
  teacherWorkshops: number;
  principalWorkshops: number;
  stemWorkshops: number;
  productDemonstrations: number;
  costPerTraining: number;
  participantsPerTraining: number;
  expectedRevenueImpact: number;
}

export interface InvestmentPlanning {
  samplingCost: number;
  reimbursementCost: number;
  travelCost: number;
  distributorSupportCost: number;
  eventCost: number;
  giftCost: number;
  todCost: number;
  promotionalCost: number;
  schemeCost: number;
  discountCost: number;
  strategicAccountInvestment: number;
  otherCost: number;
}

export interface CollectionPlanning {
  collectionPercent: number;
}

export interface ApprovalEvent {
  id: string;
  aopId: string;
  action: ApprovalAction;
  byUserId: string;
  comment: string;
  createdAt: string;
}

export interface Aop {
  id: string;
  userId: string;
  fy: FiscalYear;
  status: AopStatus;
  version: number;
  isRollup?: boolean;
  revenue: RevenueTargets;
  universe: UniversePlanning;
  sampling: SamplingPlanning;
  training: TrainingPlanning;
  investment: InvestmentPlanning;
  collection: CollectionPlanning;
  approvals: ApprovalEvent[];
  createdAt: string;
  updatedAt: string;
  updatedByUserId: string;
}

export interface TeamDashboardMetrics {
  totalTeamMembers: number;
  totalBdms: number;
  totalBdas: number;
  aopCompleted: number;
  aopPending: number;
  completionPct: number;
  totalRevenuePlanned: number;
  totalSchoolsPlanned: number;
  totalHiringPlanned: number;
}

export interface AuditLogEntry {
  id: string;
  tableName: string;
  recordId: string;
  action: string;
  changedBy: string;
  diff: Record<string, unknown>;
  createdAt: string;
}
