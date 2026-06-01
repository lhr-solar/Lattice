import { apiFetch } from "./client";

export interface HarnessGroup {
  id: string;
  name: string;
  scope: "internal" | "external";
  enclosure_instance_id: string | null;
  edge_ids: string[];
}

export interface ManufacturingRecord {
  id: string;
  harness_group_id: string;
  harness_group_name: string | null;
  harness_scope: "internal" | "external" | null;
  built_by: string | null;
  built_at: string | null;
  continuity_checked_by: string | null;
  continuity_checked_at: string | null;
  status: string;
}

export interface ManufacturingProjection {
  revision_id: string;
  internal_groups: HarnessGroup[];
  external_groups: HarnessGroup[];
  records: ManufacturingRecord[];
}

export function fetchManufacturingProjection(vehicleId: string, revisionId: string) {
  return apiFetch<ManufacturingProjection>(
    `/vehicles/${vehicleId}/revisions/${revisionId}/manufacturing/projection`,
  );
}

export function syncHarnessGroups(vehicleId: string, revisionId: string) {
  return apiFetch<HarnessGroup[]>(
    `/vehicles/${vehicleId}/revisions/${revisionId}/manufacturing/harness-groups/sync`,
    { method: "POST" },
  );
}

export function createManufacturingRecord(
  vehicleId: string,
  revisionId: string,
  harnessGroupId: string,
) {
  return apiFetch<ManufacturingRecord>(
    `/vehicles/${vehicleId}/revisions/${revisionId}/manufacturing/records`,
    { method: "POST", body: JSON.stringify({ harness_group_id: harnessGroupId }) },
  );
}

export function markBuilt(vehicleId: string, revisionId: string, recordId: string) {
  return apiFetch<ManufacturingRecord>(
    `/vehicles/${vehicleId}/revisions/${revisionId}/manufacturing/records/${recordId}`,
    {
      method: "PATCH",
      body: JSON.stringify({ status: "built" }),
    },
  );
}

export function addContinuityCheck(
  vehicleId: string,
  revisionId: string,
  recordId: string,
  passed: boolean,
) {
  return apiFetch(
    `/vehicles/${vehicleId}/revisions/${revisionId}/manufacturing/records/${recordId}/continuity-checks`,
    { method: "POST", body: JSON.stringify({ passed, details: {} }) },
  );
}
