"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { TeamCommandCenter } from "@/components/TeamCommandCenter";
import { useStore } from "@/lib/store";

export default function ViewDashboardPage() {
  const { currentUser } = useStore();
  const router = useRouter();

  useEffect(() => {
    if (!currentUser) return;
    if (currentUser.role === "ADMIN") router.replace("/admin");
    else if (currentUser.role === "ZDM") router.replace("/");
  }, [currentUser, router]);

  if (!currentUser || currentUser.role === "ADMIN" || currentUser.role === "ZDM") return null;

  return (
    <AppShell>
      <TeamCommandCenter
        readOnly
        title={currentUser.role === "BDA" ? "My plan" : "Team overview"}
        description={
          currentUser.role === "BDA"
            ? "View your assigned targets, districts, and plan status."
            : "View-only access to your team plans and hiring."
        }
      />
    </AppShell>
  );
}
