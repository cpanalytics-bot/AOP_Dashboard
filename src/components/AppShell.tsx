"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { useStore } from "@/lib/store";
import { Badge, Button, Kbd } from "./ui";
import { CommandPalette } from "./CommandPalette";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { currentUser, logout, hydrating } = useStore();
  const router = useRouter();
  const pathname = usePathname();

  const nav = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.role === "ADMIN") {
      return [
        { href: "/admin", label: "Health" },
        { href: "/admin/targets", label: "Targets" },
        { href: "/admin/hiring", label: "Hiring" },
      ];
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
    if (!hydrating && !currentUser) router.replace("/login");
  }, [currentUser, hydrating, router]);

  if (!currentUser) return null;

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <CommandPalette />
      <header className="sticky top-0 z-20 border-b border-gray-200/70 bg-white/75 shadow-[0_1px_2px_rgba(16,24,40,0.05)] backdrop-blur-xl">
        {/* thin brand accent line */}
        <div aria-hidden className="h-[3px] w-full bg-gradient-to-r from-indigo-500 via-violet-500 to-sky-400" />
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-2.5">
          <Link href={currentUser.role === "ADMIN" ? "/admin" : currentUser.role === "ZDM" ? "/" : "/view"} className="group flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-[13px] font-bold text-white shadow-sm shadow-indigo-600/30 ring-1 ring-inset ring-white/25 transition group-hover:shadow-indigo-600/40">
              A
            </span>
            <span className="hidden items-center text-[15px] font-semibold tracking-tight text-gray-900 sm:flex">
              AOP Platform
              <span className="ml-1.5 rounded-md bg-gray-100 px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-gray-500">FY26-27</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-1 rounded-xl border border-gray-200/80 bg-gray-50/60 p-1 sm:flex">
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition-all ${
                  pathname === n.href
                    ? "bg-white text-indigo-700 shadow-sm ring-1 ring-inset ring-gray-200"
                    : "text-gray-500 hover:text-gray-900"
                }`}
              >
                {n.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => {
                const ev = new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true });
                window.dispatchEvent(ev);
              }}
              aria-label="Open command palette"
              className="hidden items-center gap-2 rounded-lg border border-gray-200 bg-white/70 px-2.5 py-1.5 text-[12px] text-gray-500 shadow-sm transition hover:border-gray-300 hover:text-gray-700 lg:inline-flex"
            >
              <span aria-hidden>⌕</span>
              Quick jump
              <span className="ml-1 flex items-center gap-0.5"><Kbd>⌘</Kbd><Kbd>K</Kbd></span>
            </button>
            <div className="hidden items-center gap-2 rounded-full border border-gray-200 bg-white/70 py-1 pl-3 pr-1 shadow-sm sm:flex">
              <span className="text-[13px] font-medium text-gray-800">{currentUser.name}</span>
              <Badge tone="indigo">
                {currentUser.role === "ZDM" ? "Zonal Manager" : currentUser.role === "ADMIN" ? "Admin Team" : currentUser.role}
              </Badge>
            </div>
            <Button size="sm" variant="outline" onClick={logout}>
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main key={pathname} className="page-enter mx-auto w-full max-w-6xl px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-5 sm:pb-10 sm:pt-6">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white/95 px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur sm:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-around">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`flex min-h-[44px] flex-1 items-center justify-center rounded-lg px-2 py-2.5 text-center text-[13px] font-medium ${
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
