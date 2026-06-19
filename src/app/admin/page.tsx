"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { Badge, Button, Card, PageHeader, StatusPill } from "@/components/ui";
import { useStore } from "@/lib/store";
import { fmtINR } from "@/lib/calc";

export default function AdminPage() {
  const router = useRouter();
  const { currentUser, users, getAop, listZms, loadZmContext, hydrating } = useStore();
  const [zms, setZms] = useState<{ email: string; name: string }[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (currentUser?.role === "ADMIN") void listZms().then(setZms);
  }, [currentUser, listZms]);

  const filteredZms = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return zms;
    return zms.filter((z) => z.name.toLowerCase().includes(q) || z.email.toLowerCase().includes(q));
  }, [zms, query]);

  // After a ZM is loaded, store.users = [admin, ...that ZM's team].
  const team = useMemo(
    () => users.filter((u) => u.id !== currentUser?.id),
    [users, currentUser],
  );

  if (!currentUser) return null;
  if (currentUser.role !== "ADMIN") {
    router.replace("/login");
    return null;
  }

  const openZm = async (email: string) => {
    setSelected(email);
    await loadZmContext(email);
  };

  return (
    <AppShell>
      <PageHeader
        title="Program Team console"
        description="Review and edit any Zonal Manager's FY26-27 AOP."
      />

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <Card>
          <h3 className="t-card-heading mb-2">Zonal Managers ({zms.length})</h3>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search ZM…"
            className="mb-2 h-9 w-full rounded-lg border border-gray-300 bg-white px-3 text-[13px] outline-none focus:border-indigo-500"
          />
          <div className="max-h-[62vh] space-y-1 overflow-auto">
            {filteredZms.map((z) => (
              <button
                key={z.email}
                type="button"
                onClick={() => openZm(z.email)}
                className={`flex w-full flex-col rounded-lg border px-3 py-2 text-left ${
                  selected === z.email
                    ? "border-indigo-300 bg-indigo-50"
                    : "border-gray-200 hover:bg-gray-50"
                }`}
              >
                <span className="text-[13px] font-medium text-gray-900">{z.name}</span>
                <span className="text-[11px] text-gray-500">{z.email}</span>
              </button>
            ))}
            {filteredZms.length === 0 && (
              <p className="t-caption px-1 py-2">No Zonal Managers found.</p>
            )}
          </div>
        </Card>

        <Card className="!p-0 overflow-x-auto">
          <div className="border-b border-gray-100 px-4 py-3">
            <h3 className="t-card-heading">
              {selected ? `Team · ${selected}` : "Select a ZM to review"}
            </h3>
          </div>
          {hydrating ? (
            <p className="t-caption p-4">Loading team plans…</p>
          ) : !selected ? (
            <p className="t-caption p-4">Pick a Zonal Manager on the left to load their team&apos;s plans.</p>
          ) : team.length === 0 ? (
            <p className="t-caption p-4">No team members found for this ZM.</p>
          ) : (
            <table className="w-full min-w-[640px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/80">
                  <th className="px-3 py-2 t-overline">Member</th>
                  <th className="px-3 py-2 t-overline">Role</th>
                  <th className="px-3 py-2 t-overline">Status</th>
                  <th className="px-3 py-2 t-overline">Revenue target</th>
                  <th className="px-3 py-2 t-overline text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {team.map((u) => {
                  const a = getAop(u.id);
                  return (
                    <tr key={u.id} className="border-b border-gray-100">
                      <td className="px-3 py-2 font-medium text-gray-900">{u.name}</td>
                      <td className="px-3 py-2"><Badge tone="slate">{u.role}</Badge></td>
                      <td className="px-3 py-2"><StatusPill status={a.status} /></td>
                      <td className="px-3 py-2 text-gray-700">{fmtINR(a.revenue.totalRevenueTarget)}</td>
                      <td className="px-3 py-2 text-right">
                        <Link href={`/aop/${encodeURIComponent(u.id)}`}>
                          <Button size="sm" variant="outline">Open</Button>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
