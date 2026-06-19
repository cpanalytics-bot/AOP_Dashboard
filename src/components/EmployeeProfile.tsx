"use client";

import { useEffect, useState } from "react";
import { Badge, Button, Card, Field, SearchableMultiSelect, Select, TextInput } from "@/components/ui";
import { useStore } from "@/lib/store";
import { supabaseConfigured } from "@/lib/supabase/client";
import {
  liveStates,
  liveDistrictsForStates,
  liveBlocksForDistricts,
  liveTerritoryDefaults,
} from "@/lib/supabase/aop-data";
import { districts as masterDistricts } from "@/lib/master-data";

export function EmployeeProfile({ userId }: { userId: string }) {
  const { users, canEditProfile, updateUserProfile, updateTbhMember } = useStore();
  const user = users.find((u) => u.id === userId);
  const manager = users.find((u) => u.id === user?.reportingManagerId);
  const editable = canEditProfile(userId);
  const isTbh = !!user?.isTbh;

  const [editing, setEditing] = useState(false);
  const [baseLocation, setBaseLocation] = useState(user?.baseLocation ?? "");
  const [tbhName, setTbhName] = useState(user?.name ?? "");
  const [tbhRole, setTbhRole] = useState<string>(user?.role ?? "BDA");
  const [tbhMapped, setTbhMapped] = useState(user?.mappedEmail ?? "");
  const [selStates, setSelStates] = useState<string[]>(user?.states ?? []);
  const [selDistricts, setSelDistricts] = useState<string[]>(user?.districtIds ?? []);
  const [stateOptions, setStateOptions] = useState<string[]>([]);
  const [districtOptions, setDistrictOptions] = useState<string[]>([]);
  const [blocks, setBlocks] = useState<string[]>(user?.blocks ?? []);
  const [loadingStates, setLoadingStates] = useState(false);
  const [loadingDistricts, setLoadingDistricts] = useState(false);

  // ---- data sources (live = all_india_schools RPCs; mock = master-data) ----
  const fetchStates = (): Promise<string[]> =>
    supabaseConfigured
      ? liveStates()
      : Promise.resolve(Array.from(new Set(masterDistricts.map((d) => d.state))).sort());
  const fetchDistricts = (states: string[]): Promise<string[]> => {
    if (!states.length) return Promise.resolve([]);
    return supabaseConfigured
      ? liveDistrictsForStates(states)
      : Promise.resolve(masterDistricts.filter((d) => states.includes(d.state)).map((d) => d.name).sort());
  };
  const fetchBlocks = (dists: string[]): Promise<string[]> =>
    !dists.length || !supabaseConfigured ? Promise.resolve([]) : liveBlocksForDistricts(dists);

  // State options (once).
  useEffect(() => {
    let alive = true;
    setLoadingStates(true);
    fetchStates().then((s) => alive && setStateOptions(s)).finally(() => alive && setLoadingStates(false));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Seed home state/district from emp_record when not already set.
  useEffect(() => {
    if (!user?.email || !supabaseConfigured) return;
    let alive = true;
    liveTerritoryDefaults(user.email).then((d) => {
      if (!alive) return;
      if (d.state) setSelStates((cur) => (cur.length ? cur : [d.state!]));
      if (d.district) setSelDistricts((cur) => (cur.length ? cur : [d.district!]));
    });
    return () => { alive = false; };
  }, [user?.email]);

  // District options follow the selected states.
  useEffect(() => {
    let alive = true;
    setLoadingDistricts(true);
    fetchDistricts(selStates).then((d) => alive && setDistrictOptions(d)).finally(() => alive && setLoadingDistricts(false));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selStates.join("|")]);

  // Blocks are auto-assigned from the selected districts.
  useEffect(() => {
    let alive = true;
    fetchBlocks(selDistricts).then((b) => alive && setBlocks(b));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selDistricts.join("|")]);

  if (!user) return null;

  const dispStates = user.states?.length ? user.states : selStates;
  const dispDistricts = user.districtIds?.length ? user.districtIds : selDistricts;

  const startEdit = () => {
    setBaseLocation(user.baseLocation);
    setTbhName(user.name);
    setTbhRole(user.role);
    setTbhMapped(user.mappedEmail ?? "");
    setSelStates(user.states?.length ? [...user.states] : selStates);
    setSelDistricts(user.districtIds?.length ? [...user.districtIds] : selDistricts);
    setEditing(true);
  };
  const save = () => {
    updateUserProfile(userId, { baseLocation, districtIds: selDistricts, states: selStates, blocks });
    if (isTbh) {
      updateTbhMember(userId, {
        name: tbhName.trim() || "To Be Hired",
        role: tbhRole,
        baseLocation,
        mappedEmail: tbhMapped.trim() || null,
      });
    }
    setEditing(false);
  };

  return (
    <Card className="mb-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="t-title">{user.name}</h2>
            {isTbh && <Badge tone="amber">TBH</Badge>}
          </div>
          <p className="t-caption mt-0.5">
            {user.employeeCode} · {user.designation} · <Badge tone="slate">{user.role}</Badge>
          </p>
        </div>
        {editable && !editing && (
          <Button size="sm" variant="outline" onClick={startEdit}>Edit profile</Button>
        )}
        {editing && (
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            <Button size="sm" onClick={save}>Save</Button>
          </div>
        )}
      </div>

      <dl className="mt-4 grid gap-x-5 gap-y-4 sm:grid-cols-2">
        {isTbh && editing && (
          <>
            <Field label="Name" note="Label the placeholder until the person is hired.">
              <TextInput value={tbhName} onChange={(e) => setTbhName(e.target.value)} placeholder="To Be Hired" />
            </Field>
            <Field label="Role">
              <Select value={tbhRole} onChange={(e) => setTbhRole(e.target.value)}>
                <option value="BDA">BDA</option>
                <option value="BDM">BDM</option>
              </Select>
            </Field>
          </>
        )}
        <ProfileItem label="Reporting manager" value={manager?.name ?? "—"} />
        {editing ? (
          <Field label="Base location" note="Default city for this member.">
            <TextInput value={baseLocation} onChange={(e) => setBaseLocation(e.target.value)} />
          </Field>
        ) : (
          <ProfileItem label="Base location" value={user.baseLocation || "—"} />
        )}
        {isTbh ? (
          editing ? (
            <Field label="Mapped email · when hired" note="Set the real email once the person is hired.">
              <TextInput value={tbhMapped} onChange={(e) => setTbhMapped(e.target.value)} placeholder="name@pw.live" />
            </Field>
          ) : (
            <ProfileItem label="Email" value={user.mappedEmail || "To be hired · not yet mapped"} />
          )
        ) : (
          <ProfileItem label="Email" value={user.email} />
        )}

        {/* States */}
        <div>
          <p className="mb-1.5 t-overline">States</p>
          {editing ? (
            <SearchableMultiSelect
              options={stateOptions}
              selected={selStates}
              onChange={setSelStates}
              loading={loadingStates}
              placeholder="Select states…"
              searchPlaceholder="Search states…"
            />
          ) : (
            <p className="text-[13px] text-gray-700">{dispStates.length ? dispStates.join(", ") : "—"}</p>
          )}
        </div>

        {/* Districts */}
        <div>
          <p className="mb-1.5 t-overline">Assigned districts</p>
          {editing ? (
            <SearchableMultiSelect
              options={districtOptions}
              selected={selDistricts}
              onChange={setSelDistricts}
              loading={loadingDistricts}
              placeholder={selStates.length ? "Select districts…" : "Pick a state first"}
              searchPlaceholder="Search districts…"
              emptyText={selStates.length ? "No districts for these states" : "Select a state above"}
            />
          ) : (
            <p className="text-[13px] text-gray-700">{dispDistricts.length ? dispDistricts.join(", ") : "No districts assigned"}</p>
          )}
        </div>

        {/* Blocks (auto) */}
        <div className="sm:col-span-2">
          <p className="t-overline">
            Assigned blocks <span className="font-normal normal-case tracking-normal text-gray-400">(auto-assigned from districts)</span>
          </p>
          <p className="mt-1 text-[13px] text-gray-700">
            <span className="font-medium text-gray-900">{blocks.length} block{blocks.length === 1 ? "" : "s"}</span>
            {blocks.length > 0 ? (
              <span className="text-gray-500"> · {blocks.slice(0, 12).join(", ")}{blocks.length > 12 ? ` +${blocks.length - 12} more` : ""}</span>
            ) : (
              <span className="text-gray-400"> · {supabaseConfigured ? "Select districts to load blocks" : "Blocks load in connected mode"}</span>
            )}
          </p>
        </div>
      </dl>
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
