"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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

const LS_KEY = "aop-platform-state-v2";

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
  login: (email: string) => boolean;
  loginById: (userId: string) => void;
  logout: () => void;

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

  useEffect(() => {
    setState(loadState());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
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
    (email: string): boolean => {
      const u = users.find((x) => x.email.toLowerCase() === email.trim().toLowerCase());
      if (!u || u.isActive === false) return false;
      loginById(u.id);
      return true;
    },
    [users, loginById],
  );

  const logout = useCallback(() => {
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
      if (currentUser.role === "ADMIN" || currentUser.role === "ZDM") {
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
      setState((s) => {
        const existing = s.aops[userId] ?? defaultAop(userId);
        const statusMap: Record<ApprovalAction, AopStatus> = {
          submit: "submitted",
          approve: "approved",
          reject: "rejected",
          request_changes: "changes_requested",
        };
        return {
          ...s,
          aops: {
            ...s.aops,
            [userId]: {
              ...existing,
              status: statusMap[action],
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
        };
      });
    },
    [],
  );

  const updateUserProfile = useCallback(
    (userId: string, patch: Partial<Pick<User, "baseLocation" | "districtIds">>) => {
      setState((s) => ({
        ...s,
        users: s.users.map((u) => (u.id === userId ? { ...u, ...patch } : u)),
      }));
      addAudit({
        tableName: "users",
        recordId: userId,
        action: "update_profile",
        changedBy: state.currentUserId ?? userId,
        diff: patch as Record<string, unknown>,
      });
    },
    [addAudit, state.currentUserId],
  );

  const addHiring = useCallback(
    (req: Omit<HiringRequest, "id" | "createdAt" | "requestedByUserId" | "status">) => {
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
    },
    [],
  );

  const value: StoreContextValue = {
    currentUser,
    users,
    login,
    loginById,
    logout,
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
