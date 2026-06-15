"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Kbd } from "@/components/ui";
import { useStore } from "@/lib/store";
import { districtNames } from "@/lib/master-data";

interface CommandItem {
  id: string;
  title: string;
  sub?: string;
  group: string;
  hint?: string;
  run: () => void;
}

export function CommandPalette() {
  const router = useRouter();
  const { currentUser, visibleEmployees, logout } = useStore();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Global ⌘K / Ctrl+K + "/" handler
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      const isField = tag === "input" || tag === "textarea" || tag === "select";
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (!isField && e.key === "/") {
        e.preventDefault();
        setOpen(true);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const items = useMemo<CommandItem[]>(() => {
    const out: CommandItem[] = [];
    if (!currentUser) return out;

    // Members
    visibleEmployees().forEach((u) => {
      out.push({
        id: `member-${u.id}`,
        title: u.name,
        sub: `${u.role} · ${u.employeeCode} · ${districtNames(u.districtIds) || "—"}`,
        group: "Open AOP",
        run: () => router.push(`/aop/${u.id}`),
      });
    });

    // Navigation
    out.push({
      id: "nav-dashboard",
      title: "Dashboard",
      group: "Navigate",
      run: () => router.push(currentUser.role === "ADMIN" ? "/admin" : currentUser.role === "ZDM" ? "/" : "/view"),
    });
    out.push({
      id: "nav-hiring",
      title: "Hiring requests",
      group: "Navigate",
      run: () => router.push("/hiring"),
    });

    out.push({
      id: "act-logout",
      title: "Log out",
      group: "Account",
      run: () => {
        logout();
        router.push("/login");
      },
    });

    return out;
  }, [currentUser, visibleEmployees, router, logout]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, 12);
    return items
      .filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          (i.sub ?? "").toLowerCase().includes(q) ||
          i.group.toLowerCase().includes(q),
      )
      .slice(0, 18);
  }, [items, query]);

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  if (!open) return null;

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const it = filtered[activeIdx];
      if (it) {
        it.run();
        setOpen(false);
      }
    }
  };

  // Group items by group label preserving order
  const groups: { label: string; rows: CommandItem[] }[] = [];
  filtered.forEach((it) => {
    let g = groups.find((x) => x.label === it.group);
    if (!g) {
      g = { label: it.group, rows: [] };
      groups.push(g);
    }
    g.rows.push(it);
  });

  let runningIdx = -1;

  return (
    <div
      className="cp-overlay fixed inset-0 z-[60] flex items-start justify-center bg-gray-900/40 p-4 pt-[12vh] backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onMouseDown={() => setOpen(false)}
    >
      <div
        className="cp-panel w-full max-w-xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-gray-100 px-3.5 py-3">
          <span className="text-gray-400" aria-hidden>⌕</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Jump to a team member, page, or action…"
            className="w-full bg-transparent text-[15px] text-gray-900 outline-none placeholder:text-gray-400"
          />
          <span className="hidden items-center gap-1 text-[11px] text-gray-400 sm:flex">
            <Kbd>esc</Kbd> close
          </span>
        </div>

        <div className="max-h-[60vh] overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <p className="px-4 py-6 text-center text-[13px] text-gray-500">No matches.</p>
          ) : (
            groups.map((g) => (
              <div key={g.label} className="py-1">
                <p className="px-3.5 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-wide text-gray-400">
                  {g.label}
                </p>
                {g.rows.map((it) => {
                  runningIdx += 1;
                  const active = runningIdx === activeIdx;
                  return (
                    <button
                      key={it.id}
                      onMouseMove={() => setActiveIdx(runningIdx)}
                      onClick={() => {
                        it.run();
                        setOpen(false);
                      }}
                      className={`flex w-full items-center justify-between gap-2 px-3.5 py-2 text-left transition ${
                        active ? "bg-indigo-50" : "hover:bg-gray-50"
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium text-gray-900">{it.title}</p>
                        {it.sub && <p className="truncate text-[11.5px] text-gray-400">{it.sub}</p>}
                      </div>
                      {it.hint && <span className="text-[11px] text-gray-400">{it.hint}</span>}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50/60 px-3.5 py-2 text-[11px] text-gray-400">
          <span className="flex items-center gap-2">
            <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> navigate</span>
            <span className="flex items-center gap-1"><Kbd>↵</Kbd> open</span>
          </span>
          <span>{filtered.length} result{filtered.length === 1 ? "" : "s"}</span>
        </div>
      </div>
    </div>
  );
}
