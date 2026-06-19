"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  Aop,
  AopStatus,
  ApprovalAction,
  AuditLogEntry,
  HiringRequest,
  User,
} from "./types";
import {
  defaultAop,
  seedHiringRequests,
  seededAops,
  users as seedUsers,
} from "./mock-data";
import { aggregateTeamAop } from "./calc";
import { supabaseConfigured } from "./supabase/client";
import * as live from "./supabase/aop-data";

const LS_KEY = "aop-platform-state-v2";
const LIVE = supabaseConfigured;
// In live mode we persist only the signed-in email and re-hydrate from Supabase.
const LIVE_EMAIL_KEY = "aop-live-email";

interface PersistedState {
  currentUserId: string | null;
  aops: Record<string, Aop>;
  hiring: HiringRequest[];
  users: User[];
  auditLogs: AuditLogEntry[];
}

interface StoreContextValue {
  currentUser: User | null;
  users: User[];
  liveMode: boolean;
  login: (email: string) => Promise<boolean>;
  loginById: (userId: string) => void;
  /** OTP step 1: authorize + email a 6-digit code. */
  requestOtp: (email: string) => Promise<live.OtpResult>;
  /** OTP step 2: verify the code, then hydrate + sign in. */
  verifyOtpAndLogin: (email: string, token: string) => Promise<live.OtpResult>;
  logout: () => void;
  hydrating: boolean;
  listZms: () => Promise<{ email: string; name: string }[]>;
  loadZmContext: (zmEmail: string) => Promise<void>;

  subordinates: (userId: string) => User[];
  visibleEmployees: () => User[];
  canEditAop: (targetUserId: string) => boolean;
  canViewAop: (targetUserId: string) => boolean;
  canEditProfile: (targetUserId: string) => boolean;
  canApproveAop: (targetUserId: string) => boolean;
  canRaiseHiring: () => boolean;
  canManageHiringStatus: () => boolean;
  isRollupAop: (targetUserId: string) => boolean;

  getAop: (userId: string) => Aop;
  saveAop: (aop: Aop) => void;
  setAopStatus: (userId: string, status: AopStatus) => void;
  recordApproval: (userId: string, action: ApprovalAction, comment: string) => void;

  updateUserProfile: (
    userId: string,
    patch: Partial<Pick<User, "baseLocation" | "districtIds" | "states" | "blocks">>,
  ) => void;

  /** ZM adds a "To Be Hired" placeholder member; returns its id. */
  addTbhMember: (name: string, role: string, baseLocation: string) => Promise<string | null>;
  updateTbhMember: (
    id: string,
    patch: { name?: string; role?: string; baseLocation?: string; mappedEmail?: string | null },
  ) => void;

  hiring: HiringRequest[];
  addHiring: (
    req: Omit<HiringRequest, "id" | "createdAt" | "requestedByUserId" | "status">,
  ) => void;
  updateHiringStatus: (id: string, status: HiringRequest["status"]) => void;

  auditLogs: AuditLogEntry[];
}

const StoreContext = createContext<StoreContextValue | null>(null);

// Merge a member's saved territory (from aop_member) onto the roster User so it
// survives reloads. Falls back to the live default (city_district) when unsaved.
function applyTerritory(u: User, m?: live.MemberMeta): User {
  if (!m) return u;
  return {
    ...u,
    baseLocation: m.baseLocation || u.baseLocation,
    districtIds: m.districts && m.districts.length ? m.districts : u.districtIds,
    states: m.states ?? u.states,
    blocks: m.blocks ?? u.blocks,
  };
}

function loadState(): PersistedState {
  // Live mode starts empty; data is hydrated from Supabase on login.
  if (LIVE) {
    return { currentUserId: null, aops: {}, hiring: [], users: [], auditLogs: [] };
  }
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as PersistedState;
        return {
          ...parsed,
          users: parsed.users?.length ? parsed.users : [...seedUsers],
          auditLogs: parsed.auditLogs ?? [],
        };
      }
    } catch {
      /* ignore */
    }
  }
  return {
    currentUserId: null,
    aops: seededAops(),
    hiring: [...seedHiringRequests],
    users: [...seedUsers],
    auditLogs: [],
  };
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PersistedState>({
    currentUserId: null,
    aops: {},
    hiring: [],
    users: [],
    auditLogs: [],
  });
  const [hydrated, setHydrated] = useState(false);
  // In live mode we start in a hydrating state so a hard load of a deep link
  // (e.g. /aop/<id>) shows a loader instead of racing to /login before the
  // stored session is restored.
  const [hydrating, setHydrating] = useState(LIVE);
  // Live submission context (one aop_master per ZM per FY).
  const aopMeta = useRef<{ aopId: string | null; zmEmail: string | null }>({ aopId: null, zmEmail: null });

  // Pull the full team + AOP bundle for a signed-in ZM (or Program Team) from Supabase.
  const hydrateLive = useCallback(async (user: User) => {
    setHydrating(true);
    try {
      // Program Team (ADMIN) has no single zone; they open individual ZM plans on demand.
      const zmEmail = user.email;
      const { aopId, status } = await live.ensureMaster(zmEmail);
      aopMeta.current = { aopId, zmEmail };
      const team = user.role === "ZDM" ? await live.liveTeam(user.email) : [];
      const tbh = user.role === "ZDM" ? await live.liveListTbh(user.email) : [];
      const roster = [user, ...team.filter((m) => m.email !== user.email), ...tbh];
      const { aops, members } = await live.liveLoadBundle(aopId, status, roster, zmEmail);
      const merged = roster.map((u) => applyTerritory(u, members[u.email]));
      const hiring = await live.liveLoadHiring(aopId);
      setState((s) => ({ ...s, users: merged, aops, hiring, currentUserId: user.id }));
    } finally {
      setHydrating(false);
    }
  }, []);

  useEffect(() => {
    if (LIVE) {
      // Re-hydrate the last signed-in user on refresh.
      const email = typeof window !== "undefined" ? window.localStorage.getItem(LIVE_EMAIL_KEY) : null;
      setHydrated(true);
      if (email) {
        setHydrating(true); // keep loaders up across the whole re-hydrate window
        live.liveLogin(email).then((u) => {
          if (u) void hydrateLive(u);
          else setHydrating(false);
        });
      } else {
        setHydrating(false); // no stored session — let guards run normally
      }
      return;
    }
    setState(loadState());
    setHydrated(true);
  }, [hydrateLive]);

  useEffect(() => {
    if (!hydrated || LIVE) return; // live mode does not persist full state to localStorage
    try {
      window.localStorage.setItem(LS_KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [state, hydrated]);

  const users = state.users;

  const currentUser = useMemo(
    () => users.find((u) => u.id === state.currentUserId) ?? null,
    [users, state.currentUserId],
  );

  const addAudit = useCallback(
    (entry: Omit<AuditLogEntry, "id" | "createdAt">) => {
      setState((s) => ({
        ...s,
        auditLogs: [
          {
            ...entry,
            id: `audit-${Date.now()}`,
            createdAt: new Date().toISOString(),
          },
          ...s.auditLogs,
        ].slice(0, 500),
      }));
    },
    [],
  );

  const loginById = useCallback((userId: string) => {
    setState((s) => ({ ...s, currentUserId: userId }));
  }, []);

  const login = useCallback(
    async (email: string): Promise<boolean> => {
      if (LIVE) {
        const u = await live.liveLogin(email);
        if (!u) return false;
        if (typeof window !== "undefined") window.localStorage.setItem(LIVE_EMAIL_KEY, u.email);
        await hydrateLive(u);
        return true;
      }
      const u = users.find((x) => x.email.toLowerCase() === email.trim().toLowerCase());
      if (!u || u.isActive === false) return false;
      loginById(u.id);
      return true;
    },
    [users, loginById, hydrateLive],
  );

  const requestOtp = useCallback(
    async (email: string): Promise<live.OtpResult> => live.sendLoginOtp(email),
    [],
  );

  const verifyOtpAndLogin = useCallback(
    async (email: string, token: string): Promise<live.OtpResult> => {
      const res = await live.verifyLoginOtp(email, token);
      if (res.ok && res.user) {
        if (typeof window !== "undefined") window.localStorage.setItem(LIVE_EMAIL_KEY, res.user.email);
        await hydrateLive(res.user);
      }
      return res;
    },
    [hydrateLive],
  );

  const logout = useCallback(() => {
    if (LIVE && typeof window !== "undefined") window.localStorage.removeItem(LIVE_EMAIL_KEY);
    if (LIVE) void live.signOutAuth();
    aopMeta.current = { aopId: null, zmEmail: null };
    setState((s) => ({ ...s, currentUserId: null }));
  }, []);

  const subordinates = useCallback(
    (userId: string): User[] => {
      const result: User[] = [];
      const seen = new Set<string>();
      // 1) Reporting-tree descendants (correct in mock + when chains are intact).
      const stack = [userId];
      while (stack.length) {
        const current = stack.pop()!;
        for (const u of users) {
          if (u.reportingManagerId === current && !seen.has(u.id)) {
            seen.add(u.id);
            result.push(u);
            stack.push(u.id);
          }
        }
      }
      // 2) LIVE: also include every roster member of THIS zone (zoneId =
      // zonal_manager_email = the ZM's id), so members whose reporting_manager_email
      // points outside the roster (or to themselves) are never hidden.
      if (LIVE) {
        for (const u of users) {
          if (u.id !== userId && u.zoneId === userId && !seen.has(u.id)) {
            seen.add(u.id);
            result.push(u);
          }
        }
      }
      return result;
    },
    [users],
  );

  const visibleEmployees = useCallback((): User[] => {
    if (!currentUser) return [];
    if (currentUser.role === "ADMIN") return users.filter((u) => u.role !== "ADMIN");
    if (currentUser.role === "BDA") return [currentUser];
    if (currentUser.role === "BDM") return [currentUser, ...subordinates(currentUser.id)];
    return [currentUser, ...subordinates(currentUser.id)];
  }, [currentUser, subordinates, users]);

  const isRollupAop = useCallback(
    (targetUserId: string) =>
      currentUser?.role === "ZDM" && targetUserId === currentUser.id,
    [currentUser],
  );

  const canViewAop = useCallback(
    (targetUserId: string) => {
      if (!currentUser) return false;
      if (currentUser.role === "ADMIN") return true;
      if (targetUserId === currentUser.id) return true;
      if (currentUser.role === "BDA") return false;
      return subordinates(currentUser.id).some((u) => u.id === targetUserId);
    },
    [currentUser, subordinates],
  );

  const canEditAop = useCallback(
    (targetUserId: string) => {
      if (!currentUser) return false;
      if (isRollupAop(targetUserId)) return false;
      if (currentUser.role === "ADMIN") return true;
      if (currentUser.role === "ZDM") {
        return subordinates(currentUser.id).some((u) => u.id === targetUserId);
      }
      return false;
    },
    [currentUser, subordinates, isRollupAop],
  );

  const canEditProfile = useCallback(
    (targetUserId: string) => {
      if (!currentUser) return false;
      if (currentUser.role === "ADMIN") return true;
      if (currentUser.role === "ZDM") {
        return subordinates(currentUser.id).some((u) => u.id === targetUserId);
      }
      return false;
    },
    [currentUser, subordinates],
  );

  const canApproveAop = useCallback(
    (targetUserId: string) => {
      if (!currentUser) return false;
      if (targetUserId === currentUser.id) return false;
      // Program Team (ADMIN) can approve any submission they're reviewing.
      if (currentUser.role === "ADMIN") return true;
      if (currentUser.role === "ZDM") {
        return subordinates(currentUser.id).some((u) => u.id === targetUserId);
      }
      return false;
    },
    [currentUser, subordinates],
  );

  const canRaiseHiring = useCallback(
    () => currentUser?.role === "ZDM" || currentUser?.role === "ADMIN",
    [currentUser],
  );

  const canManageHiringStatus = useCallback(
    () => currentUser?.role === "ZDM" || currentUser?.role === "ADMIN",
    [currentUser],
  );

  const getStoredAop = useCallback(
    (userId: string): Aop => {
      const stored = state.aops[userId];
      if (!stored) return defaultAop(userId);
      return { ...defaultAop(userId), ...stored };
    },
    [state.aops],
  );

  const getAop = useCallback(
    (userId: string): Aop => {
      const u = users.find((x) => x.id === userId);
      if (u?.role === "ZDM") {
        const team = subordinates(userId);
        const teamAops = team.map((m) => getStoredAop(m.id));
        return aggregateTeamAop(teamAops, userId, u.zoneId);
      }
      return getStoredAop(userId);
    },
    [users, subordinates, getStoredAop],
  );

  const saveAop = useCallback(
    (aop: Aop) => {
      if (aop.isRollup) return;
      setState((s) => ({
        ...s,
        aops: {
          ...s.aops,
          [aop.userId]: {
            ...aop,
            updatedAt: new Date().toISOString(),
            updatedByUserId: s.currentUserId ?? aop.userId,
          },
        },
      }));
      if (LIVE && aopMeta.current.aopId && aopMeta.current.zmEmail) {
        void live.liveSaveAop(aopMeta.current.aopId, aopMeta.current.zmEmail, aop);
      }
      addAudit({
        tableName: "aop_master",
        recordId: aop.id,
        action: "update",
        changedBy: state.currentUserId ?? aop.userId,
        diff: { status: aop.status, userId: aop.userId },
      });
    },
    [addAudit, state.currentUserId],
  );

  const setAopStatus = useCallback((userId: string, status: AopStatus) => {
    setState((s) => {
      const existing = s.aops[userId] ?? defaultAop(userId);
      return {
        ...s,
        aops: {
          ...s.aops,
          [userId]: { ...existing, status, updatedAt: new Date().toISOString() },
        },
      };
    });
  }, []);

  const recordApproval = useCallback(
    (userId: string, action: ApprovalAction, comment: string) => {
      const statusMap: Record<ApprovalAction, AopStatus> = {
        submit: "submitted",
        approve: "approved",
        reject: "rejected",
        request_changes: "changes_requested",
      };
      setState((s) => {
        const existing = s.aops[userId] ?? defaultAop(userId);
        const nextStatus = statusMap[action];
        return {
          ...s,
          aops: {
            ...s.aops,
            [userId]: {
              ...existing,
              status: nextStatus,
              updatedAt: new Date().toISOString(),
              approvals: [
                ...existing.approvals,
                {
                  id: `ap-${Date.now()}`,
                  aopId: existing.id,
                  action,
                  byUserId: s.currentUserId ?? userId,
                  comment,
                  createdAt: new Date().toISOString(),
                },
              ],
            },
          },
          auditLogs: [
            {
              id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              tableName: "aop_master",
              recordId: existing.id,
              action,
              changedBy: s.currentUserId ?? userId,
              diff: { status: nextStatus, userId },
              createdAt: new Date().toISOString(),
            },
            ...s.auditLogs,
          ].slice(0, 500),
        };
      });
      if (LIVE && aopMeta.current.aopId) {
        void live.liveRecordApproval(aopMeta.current.aopId, userId, action, currentUser?.email ?? "", comment);
      }
    },
    [currentUser],
  );

  const updateUserProfile = useCallback(
    (userId: string, patch: Partial<Pick<User, "baseLocation" | "districtIds" | "states" | "blocks">>) => {
      setState((s) => ({
        ...s,
        users: s.users.map((u) => (u.id === userId ? { ...u, ...patch } : u)),
      }));
      if (LIVE && aopMeta.current.aopId && aopMeta.current.zmEmail) {
        const target = users.find((u) => u.id === userId);
        void live.liveUpdateProfile(
          aopMeta.current.aopId, aopMeta.current.zmEmail, userId,
          patch.baseLocation ?? target?.baseLocation ?? "",
          patch.districtIds ?? target?.districtIds ?? [],
          patch.states ?? target?.states ?? [],
          patch.blocks ?? target?.blocks ?? [],
        );
      }
      addAudit({
        tableName: "users",
        recordId: userId,
        action: "update_profile",
        changedBy: state.currentUserId ?? userId,
        diff: patch as Record<string, unknown>,
      });
    },
    [addAudit, state.currentUserId, users],
  );

  // A TBH has no order/universe history — start with a clean, zeroed plan.
  const blankTbhAop = (id: string): Aop => {
    const a = defaultAop(id);
    a.revenue.lastYearRevenue = 0;
    a.revenue.earlyYearsRevenueLY = 0;
    a.revenue.mathScienceRevenueLY = 0;
    a.revenue.otherCategoriesRevenueLY = 0;
    a.revenue.currentAov = 0;
    a.universe.totalSchools = 0;
    a.universe.activeSchools = 0;
    a.universe.userSchools = 0;
    a.universe.nonUserSchools = 0;
    a.universe.categories = a.universe.categories.map((c) => ({ ...c, currentCount: 0, activeCount: 0, userCount: 0 }));
    return a;
  };

  const addTbhMember = useCallback(
    async (name: string, role: string, baseLocation: string): Promise<string | null> => {
      if (LIVE && currentUser) {
        const u = await live.liveAddTbh(currentUser.email, name, role, baseLocation);
        if (!u) return null;
        setState((s) => ({ ...s, users: [...s.users, u], aops: { ...s.aops, [u.id]: blankTbhAop(u.id) } }));
        return u.id;
      }
      // Mock fallback: local-only TBH.
      const id = `tbh-${Date.now()}`;
      const u: User = {
        id, employeeCode: "TBH", name: name || "To Be Hired", email: id,
        role: role as User["role"], designation: `${role} · TBH`, baseLocation,
        zoneId: currentUser?.zoneId ?? "", districtIds: [], reportingManagerId: currentUser?.id ?? null,
        currentRevenue: 0, currentTarget: 0, isActive: true, isTbh: true, mappedEmail: null,
      };
      setState((s) => ({ ...s, users: [...s.users, u], aops: { ...s.aops, [id]: blankTbhAop(id) } }));
      return id;
    },
    [currentUser],
  );

  const updateTbhMember = useCallback(
    (id: string, patch: { name?: string; role?: string; baseLocation?: string; mappedEmail?: string | null }) => {
      setState((s) => ({
        ...s,
        users: s.users.map((u) =>
          u.id === id
            ? {
                ...u,
                name: patch.name ?? u.name,
                role: (patch.role as User["role"]) ?? u.role,
                baseLocation: patch.baseLocation ?? u.baseLocation,
                mappedEmail: patch.mappedEmail !== undefined ? patch.mappedEmail : u.mappedEmail,
              }
            : u,
        ),
      }));
      if (LIVE) {
        void live.liveUpdateTbh(id, {
          name: patch.name, role: patch.role,
          base_location: patch.baseLocation, mapped_email: patch.mappedEmail,
        });
      }
    },
    [],
  );

  const addHiring = useCallback(
    (req: Omit<HiringRequest, "id" | "createdAt" | "requestedByUserId" | "status">) => {
      if (LIVE && aopMeta.current.aopId && aopMeta.current.zmEmail) {
        void live
          .liveAddHiring(aopMeta.current.aopId, aopMeta.current.zmEmail, req)
          .then((row) => { if (row) setState((s) => ({ ...s, hiring: [row, ...s.hiring] })); });
        return;
      }
      setState((s) => ({
        ...s,
        hiring: [
          {
            ...req,
            id: `h-${Date.now()}`,
            requestedByUserId: s.currentUserId ?? "",
            status: "Requested",
            createdAt: new Date().toISOString(),
          },
          ...s.hiring,
        ],
      }));
    },
    [],
  );

  const updateHiringStatus = useCallback(
    (id: string, status: HiringRequest["status"]) => {
      setState((s) => ({
        ...s,
        hiring: s.hiring.map((h) => (h.id === id ? { ...h, status } : h)),
      }));
      if (LIVE) void live.liveUpdateHiringStatus(id, status);
    },
    [],
  );

  // Program Team: list every ZM, and load a chosen ZM's whole submission for review.
  const listZms = useCallback(async (): Promise<{ email: string; name: string }[]> => {
    if (LIVE) {
      const z = await live.liveListZms();
      return z.map((x) => ({ email: x.email, name: x.name }));
    }
    return users.filter((u) => u.role === "ZDM").map((u) => ({ email: u.email, name: u.name }));
  }, [users]);

  const loadZmContext = useCallback(async (zmEmail: string) => {
    if (!LIVE) return;
    setHydrating(true);
    try {
      const { aopId, status } = await live.ensureMaster(zmEmail);
      aopMeta.current = { aopId, zmEmail };
      const team = await live.liveTeam(zmEmail);
      const tbh = await live.liveListTbh(zmEmail);
      const fullTeam = [...team, ...tbh];
      const { aops, members } = await live.liveLoadBundle(aopId, status, fullTeam, zmEmail);
      const mergedTeam = fullTeam.map((u) => applyTerritory(u, members[u.email]));
      const hiring = await live.liveLoadHiring(aopId);
      setState((s) => {
        const admin = s.users.find((u) => u.id === s.currentUserId);
        const roster = admin ? [admin, ...mergedTeam.filter((m) => m.id !== admin.id)] : mergedTeam;
        return { ...s, users: roster, aops, hiring };
      });
    } finally {
      setHydrating(false);
    }
  }, []);

  const value: StoreContextValue = {
    currentUser,
    users,
    liveMode: LIVE,
    login,
    loginById,
    requestOtp,
    verifyOtpAndLogin,
    logout,
    hydrating,
    listZms,
    loadZmContext,
    subordinates,
    visibleEmployees,
    canEditAop,
    canViewAop,
    canEditProfile,
    canApproveAop,
    canRaiseHiring,
    canManageHiringStatus,
    isRollupAop,
    getAop,
    saveAop,
    setAopStatus,
    recordApproval,
    updateUserProfile,
    addTbhMember,
    updateTbhMember,
    hiring: state.hiring,
    addHiring,
    updateHiringStatus,
    auditLogs: state.auditLogs,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
