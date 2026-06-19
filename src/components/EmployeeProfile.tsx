"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Card, Field, TextInput } from "@/components/ui";
import {
  blockNamesForDistricts,
  blocksForDistricts,
  districtById,
  districtNames,
  districts,
} from "@/lib/master-data";
import { useStore } from "@/lib/store";

export function EmployeeProfile({ userId }: { userId: string }) {
  const { users, canEditProfile, updateUserProfile } = useStore();
  const user = users.find((u) => u.id === userId);
  const manager = users.find((u) => u.id === user?.reportingManagerId);
  const editable = canEditProfile(userId);

  const [editing, setEditing] = useState(false);
  const [baseLocation, setBaseLocation] = useState(user?.baseLocation ?? "");
  const [selectedDistricts, setSelectedDistricts] = useState<string[]>(user?.districtIds ?? []);
  const [districtMenuOpen, setDistrictMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // States the user is mapped to (derived from their currently-assigned districts).
  // The dropdown only offers districts in these states. If a user has no districts
  // yet, fall back to showing all states so onboarding still works.
  const mappedStates = useMemo(() => {
    const set = new Set<string>();
    (user?.districtIds ?? []).forEach((id) => {
      const d = districtById(id);
      if (d) set.add(d.state);
    });
    return set;
  }, [user?.districtIds]);

  const districtsByState = useMemo(() => {
    const eligible = mappedStates.size
      ? districts.filter((d) => mappedStates.has(d.state))
      : districts;
    const groups = new Map<string, typeof districts>();
    eligible.forEach((d) => {
      const arr = groups.get(d.state) ?? [];
      arr.push(d);
      groups.set(d.state, arr);
    });
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [mappedStates]);

  useEffect(() => {
    if (!districtMenuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setDistrictMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [districtMenuOpen]);

  if (!user) return null;

  const save = () => {
    updateUserProfile(userId, {
      baseLocation,
      districtIds: selectedDistricts,
    });
    setEditing(false);
    setDistrictMenuOpen(false);
  };

  const toggleDistrict = (id: string) => {
    setSelectedDistricts((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const displayDistricts = editing ? selectedDistricts : user.districtIds;
  const displayBlocks = blocksForDistricts(displayDistricts);
  const stateLabel = Array.from(mappedStates).sort().join(", ") || "All states";

  return (
    <Card className="mb-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="t-title">{user.name}</h2>
          <p className="t-caption mt-0.5">
            {user.employeeCode} · {user.designation} · <Badge tone="slate">{user.role}</Badge>
          </p>
        </div>
        {editable && !editing && (
          <Button size="sm" variant="outline" onClick={() => {
            setBaseLocation(user.baseLocation);
            setSelectedDistricts([...user.districtIds]);
            setEditing(true);
          }}>
            Edit profile
          </Button>
        )}
        {editing && (
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setDistrictMenuOpen(false); }}>Cancel</Button>
            <Button size="sm" onClick={save}>Save</Button>
          </div>
        )}
      </div>

      {/* Identity + territory. Assigned districts sits directly below base location. */}
      <dl className="mt-4 grid gap-x-5 gap-y-4 sm:grid-cols-2">
        <ProfileItem label="Reporting manager" value={manager?.name ?? "—"} />
        {editing ? (
          <Field label="Base location">
            <TextInput value={baseLocation} onChange={(e) => setBaseLocation(e.target.value)} />
          </Field>
        ) : (
          <ProfileItem label="Base location" value={user.baseLocation} />
        )}
        <ProfileItem label="Email" value={user.email} />

        {/* Assigned districts — directly under base location */}
        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <p className="t-overline">Assigned districts</p>
            {editing && (
              <p className="t-caption">Scoped to: <span className="font-medium text-gray-700">{stateLabel}</span></p>
            )}
          </div>
          {editing ? (
            <div ref={menuRef} className="relative">
              <button
                type="button"
                onClick={() => setDistrictMenuOpen((o) => !o)}
                className="flex w-full items-center justify-between rounded-lg border border-gray-300 bg-white px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
              >
                <span className="truncate">
                  {selectedDistricts.length
                    ? districtNames(selectedDistricts)
                    : "Select districts…"}
                </span>
                <span className="ml-2 shrink-0 text-gray-400">
                  {selectedDistricts.length} selected · {districtMenuOpen ? "▲" : "▼"}
                </span>
              </button>
              {districtMenuOpen && (
                <div className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                  {districtsByState.length === 0 && (
                    <div className="p-3 text-[13px] text-gray-500">No districts available for your state mapping.</div>
                  )}
                  {districtsByState.map(([state, list]) => (
                    <div key={state} className="border-b border-gray-100 last:border-0">
                      <div className="bg-gray-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">{state}</div>
                      {list.map((d) => (
                        <label
                          key={d.id}
                          className="flex cursor-pointer items-center gap-2 px-3 py-2 text-[13px] hover:bg-indigo-50"
                        >
                          <input
                            type="checkbox"
                            checked={selectedDistricts.includes(d.id)}
                            onChange={() => toggleDistrict(d.id)}
                            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="text-gray-700">{d.name}</span>
                          <span className="ml-auto text-[11px] text-gray-400">{d.code}</span>
                        </label>
                      ))}
                    </div>
                  ))}
                  <div className="sticky bottom-0 flex justify-end gap-2 border-t border-gray-100 bg-white px-3 py-2">
                    <Button size="sm" variant="ghost" onClick={() => setSelectedDistricts([])}>Clear</Button>
                    <Button size="sm" onClick={() => setDistrictMenuOpen(false)}>Done</Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-[13px] text-gray-700">
              {districtNames(user.districtIds) || "No districts assigned"}
            </p>
          )}
        </div>
      </dl>

      {/* Assigned blocks — left-aligned, consistent with the labels above */}
      <div className="mt-4">
        <p className="t-overline">
          Assigned blocks <span className="font-normal normal-case tracking-normal text-gray-400">(auto from districts)</span>
        </p>
        <p className="mt-1 text-[13px] text-gray-700">
          <span className="font-medium text-gray-900">
            {displayBlocks.length} block{displayBlocks.length === 1 ? "" : "s"}
          </span>
          {blockNamesForDistricts(displayDistricts) ? (
            <span className="text-gray-500"> · {blockNamesForDistricts(displayDistricts)}</span>
          ) : (
            <span className="text-gray-400"> · Select districts to load blocks</span>
          )}
        </p>
      </div>
    </Card>
  );
}

function ProfileItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="t-overline">{label}</dt>
      <dd className="mt-0.5 text-[13px] text-gray-700">{value}</dd>
    </div>
  );
}
