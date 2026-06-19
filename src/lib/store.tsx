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
  login: (email: string) => Promise<boolean>;
  loginById: (userId: string) => void;
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
    patch: Partial<Pick<User, "baseLocation" | "districtIds">>,
  ) => void;

  hiring: HiringRequest[];
  addHiring: (
    req: Omit<HiringRequest, "id" | "createdAt" | "requestedByUserId" | "status">,
  ) => void;
  updateHiringStatus: (id: string, status: HiringRequest["status"]) => void;

  auditLogs: AuditLogEntry[];
}

const StoreContext = createContext<StoreContextValue | null>(null);

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
  const [hydrating, setHydrating] = useState(false);
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
      const roster = [user, ...team.filter((m) => m.email !== user.email)];
      const aops = await live.liveLoadBundle(aopId, status, roster);
      const hiring = await live.liveLoadHiring(aopId);
      setState((s) => ({ ...s, users: roster, aops, hiring, currentUserId: user.id }));
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

  const logout = useCallback(() => {
    if (LIVE && typeof window !== "undefined") window.localStorage.removeItem(LIVE_EMAIL_KEY);
    aopMeta.current = { aopId: null, zmEmail: null };
    setState((s) => ({ ...s, currentUserId: null }));
  }, []);

  const subordinates = useCallback(
    (userId: string): User[] => {
      const result: User[] = [];
      const stack = [userId];
      while (stack.length) {
        const current = stack.pop()!;
        for (const u of users) {
          if (u.reportingManagerId === current) {
            result.push(u);
            stack.push(u.id);
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
        void live.liveRecordApproval(aopMeta.current.aopId, action, currentUser?.email ?? "", comment);
      }
    },
    [currentUser],
  );

  const updateUserProfile = useCallback(
    (userId: string, patch: Partial<Pick<User, "baseLocation" | "districtIds">>) => {
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
      const aops = await live.liveLoadBundle(aopId, status, team);
      const hiring = await live.liveLoadHiring(aopId);
      setState((s) => {
        const admin = s.users.find((u) => u.id === s.currentUserId);
        const roster = admin ? [admin, ...team.filter((m) => m.id !== admin.id)] : team;
        return { ...s, users: roster, aops, hiring };
      });
    } finally {
      setHydrating(false);
    }
  }, []);

  const value: StoreContextValue = {
    currentUser,
    users,
    login,
    loginById,
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
