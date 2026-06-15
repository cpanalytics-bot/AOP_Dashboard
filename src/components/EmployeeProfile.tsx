"use client";

import { useMemo, useState } from "react";
import { Badge, Button, Card, Field, TextInput } from "@/components/ui";
import {
  blockNamesForDistricts,
  blocksForDistricts,
  districtNames,
  districts,
} from "@/lib/master-data";
import { useStore } from "@/lib/store";
import type { User } from "@/lib/types";

export function EmployeeProfile({ userId }: { userId: string }) {
  const { users, canEditProfile, updateUserProfile } = useStore();
  const user = users.find((u) => u.id === userId);
  const manager = users.find((u) => u.id === user?.reportingManagerId);
  const editable = canEditProfile(userId);

  const [editing, setEditing] = useState(false);
  const [baseLocation, setBaseLocation] = useState(user?.baseLocation ?? "");
  const [selectedDistricts, setSelectedDistricts] = useState<string[]>(user?.districtIds ?? []);

  const blocks = useMemo(() => blocksForDistricts(selectedDistricts), [selectedDistricts]);

  if (!user) return null;

  const save = () => {
    updateUserProfile(userId, {
      baseLocation,
      districtIds: selectedDistricts,
    });
    setEditing(false);
  };

  const toggleDistrict = (id: string) => {
    setSelectedDistricts((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const displayDistricts = editing ? selectedDistricts : user.districtIds;
  const displayBlocks = blocksForDistricts(displayDistricts);

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
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            <Button size="sm" onClick={save}>Save</Button>
          </div>
        )}
      </div>

      <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <ProfileItem label="Reporting manager" value={manager?.name ?? "—"} />
        {editing ? (
          <Field label="Base location">
            <TextInput value={baseLocation} onChange={(e) => setBaseLocation(e.target.value)} />
          </Field>
        ) : (
          <ProfileItem label="Base location" value={user.baseLocation} />
        )}
        <ProfileItem label="Email" value={user.email} />
      </dl>

      <div className="mt-4">
        <p className="t-overline mb-2">Assigned districts</p>
        {editing ? (
          <div className="flex flex-wrap gap-2">
            {districts.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => toggleDistrict(d.id)}
                className={`rounded-full border px-3 py-1 text-[12px] font-medium transition ${
                  selectedDistricts.includes(d.id)
                    ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                    : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                {d.name}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-[13px] text-gray-700">
            {districtNames(user.districtIds) || "No districts assigned"}
          </p>
        )}
      </div>

      <div className="mt-4 rounded-lg border border-gray-100 bg-gray-50/60 p-3">
        <p className="t-overline">Assigned blocks (auto from districts)</p>
        <p className="mt-1 text-[13px] font-medium text-gray-900">
          {displayBlocks.length} block{displayBlocks.length === 1 ? "" : "s"}
        </p>
        <p className="mt-0.5 text-[12px] text-gray-500">
          {blockNamesForDistricts(displayDistricts) || "Select districts to load blocks"}
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
