"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { useStore } from "@/lib/store";
import { Badge, Button } from "./ui";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { currentUser, logout } = useStore();
  const router = useRouter();
  const pathname = usePathname();

  const nav = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.role === "ADMIN") {
      return [{ href: "/admin", label: "Admin" }];
    }
    if (currentUser.role === "ZDM") {
      return [
        { href: "/", label: "Dashboard" },
        { href: "/hiring", label: "Hiring" },
      ];
    }
    return [
      { href: "/view", label: "My team" },
      { href: "/hiring", label: "Hiring" },
    ];
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) router.replace("/login");
  }, [currentUser, router]);

  if (!currentUser) return null;

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link href={currentUser.role === "ADMIN" ? "/admin" : currentUser.role === "ZDM" ? "/" : "/view"} className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-600 text-[13px] font-bold text-white">
              A
            </span>
            <span className="hidden text-[15px] font-semibold tracking-tight text-gray-900 sm:block">
              AOP Platform <span className="font-normal text-gray-400">FY26-27</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-1 sm:flex">
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${
                  pathname === n.href
                    ? "bg-gray-100 text-gray-900"
                    : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                {n.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 sm:flex">
              <span className="text-[13px] font-medium text-gray-900">{currentUser.name}</span>
              <Badge tone="indigo">{currentUser.role}</Badge>
            </div>
            <Button size="sm" variant="outline" onClick={logout}>
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pb-24 pt-6 sm:pb-10">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white/95 px-2 py-1.5 backdrop-blur sm:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-around">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`flex-1 rounded-lg px-2 py-2 text-center text-[12px] font-medium ${
                pathname === n.href ? "bg-gray-100 text-gray-900" : "text-gray-500"
              }`}
            >
              {n.label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
