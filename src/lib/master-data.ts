// District & block master data (dummy — replace via CSV import when real file is provided).
import type { Block, District, Zone } from "./types";

export const zones: Zone[] = [
  { id: "z-north", code: "NORTH", name: "North", collectionPercent: 85 },
  { id: "z-west", code: "WEST", name: "West", collectionPercent: 88 },
  { id: "z-south", code: "SOUTH", name: "South", collectionPercent: 90 },
  { id: "z-east", code: "EAST", name: "East", collectionPercent: 86 },
];

export const districts: District[] = [
  { id: "d-del-n", code: "DEL-N", name: "North Delhi", state: "Delhi", zoneId: "z-north" },
  { id: "d-del-s", code: "DEL-S", name: "South Delhi", state: "Delhi", zoneId: "z-north" },
  { id: "d-gzb", code: "GZB", name: "Ghaziabad", state: "Uttar Pradesh", zoneId: "z-north" },
  { id: "d-mum-w", code: "MUM-W", name: "Mumbai Suburban", state: "Maharashtra", zoneId: "z-west" },
  { id: "d-pune", code: "PUN", name: "Pune", state: "Maharashtra", zoneId: "z-west" },
  { id: "d-blr", code: "BLR", name: "Bengaluru Urban", state: "Karnataka", zoneId: "z-south" },
];

export const blocks: Block[] = [
  { id: "b-del-n-1", code: "DEL-N-MT", name: "Model Town", districtId: "d-del-n" },
  { id: "b-del-n-2", code: "DEL-N-RH", name: "Rohini", districtId: "d-del-n" },
  { id: "b-del-n-3", code: "DEL-N-PT", name: "Pitampura", districtId: "d-del-n" },
  { id: "b-del-s-1", code: "DEL-S-SK", name: "Saket", districtId: "d-del-s" },
  { id: "b-del-s-2", code: "DEL-S-DW", name: "Dwarka", districtId: "d-del-s" },
  { id: "b-del-s-3", code: "DEL-S-ND", name: "Neb Sarai", districtId: "d-del-s" },
  { id: "b-gzb-1", code: "GZB-VA", name: "Vaishali", districtId: "d-gzb" },
  { id: "b-gzb-2", code: "GZB-IN", name: "Indirapuram", districtId: "d-gzb" },
  { id: "b-gzb-3", code: "GZB-KA", name: "Kaushambi", districtId: "d-gzb" },
  { id: "b-mum-w-1", code: "MUM-W-AN", name: "Andheri West", districtId: "d-mum-w" },
  { id: "b-mum-w-2", code: "MUM-W-BN", name: "Bandra", districtId: "d-mum-w" },
  { id: "b-mum-w-3", code: "MUM-W-GO", name: "Goregaon", districtId: "d-mum-w" },
  { id: "b-pune-1", code: "PUN-HN", name: "Hinjewadi", districtId: "d-pune" },
  { id: "b-pune-2", code: "PUN-KH", name: "Kharadi", districtId: "d-pune" },
  { id: "b-pune-3", code: "PUN-WG", name: "Wagholi", districtId: "d-pune" },
  { id: "b-blr-1", code: "BLR-WH", name: "Whitefield", districtId: "d-blr" },
  { id: "b-blr-2", code: "BLR-IN", name: "Indiranagar", districtId: "d-blr" },
  { id: "b-blr-3", code: "BLR-HS", name: "HSR Layout", districtId: "d-blr" },
];

export function districtById(id: string) {
  return districts.find((d) => d.id === id);
}

export function zoneById(id: string) {
  return zones.find((z) => z.id === id);
}

export function blocksForDistricts(districtIds: string[]): Block[] {
  const set = new Set(districtIds);
  return blocks.filter((b) => set.has(b.districtId));
}

export function districtNames(ids: string[]): string {
  return ids.map((id) => districtById(id)?.name ?? id).join(", ");
}

export function blockNamesForDistricts(districtIds: string[]): string {
  return blocksForDistricts(districtIds)
    .map((b) => b.name)
    .join(", ");
}
