"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { TeamCommandCenter } from "@/components/TeamCommandCenter";
import { useStore } from "@/lib/store";

export default function ZdmDashboardPage() {
  const { currentUser, hydrating } = useStore();
  const router = useRouter();

  useEffect(() => {
    if (hydrating) return;
    if (!currentUser) {
      router.replace("/login");
      return;
    }
    if (currentUser.role === "ADMIN") router.replace("/admin");
    else if (currentUser.role === "BDM" || currentUser.role === "BDA") router.replace("/view");
  }, [currentUser, hydrating, router]);

  if (!currentUser || currentUser.role !== "ZDM") return null;

  return (
    <AppShell>
      <TeamCommandCenter
        title="ZDM command center"
        description="Plan, review, and manage your zone team. Your zone AOP is auto-derived from team submissions."
      />
    </AppShell>
  );
}
