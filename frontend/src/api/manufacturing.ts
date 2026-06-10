import { apiFetch } from "./client";

export interface WireManufacturingUserInfo {
  user_id: string;
  username: string;
}

export interface WireRow {
  edge_id: string;
  signal_name: string | null;
  source_node: string | null;
  source_connector: string;
  source_pin: string;
  source_pin_number: number;
  destination_node: string | null;
  destination_enclosure: string | null;
  destination_connector_kind: string | null;
  destination_connector: string;
  destination_pin: string;
  destination_pin_number: number;
  wire_color: string | null;
  effective_wire_color: string | null;
  gauge_label: string;
  notes: string | null;
  harness_scope: "internal" | "external" | null;
  section_key: string;
  section_title: string | null;
  manufactured: boolean;
  manufactured_by: WireManufacturingUserInfo | null;
  manufactured_at: string | null;
  manufactured_stale: boolean;
  continuity_checked: boolean;
  continuity_checked_by: WireManufacturingUserInfo | null;
  continuity_checked_at: string | null;
  continuity_checked_stale: boolean;
}

export interface WireTableResponse {
  revision_id: string;
  edit_sequence: number;
  rows: WireRow[];
}

export interface WireTableParams {
  vehicle_level?: boolean;
  enclosure_instance_id?: string;
  pcb_instance_id?: string;
  connector_instance_id?: string;
  search?: string;
}

function wireTableQuery(params: WireTableParams): string {
  const q = new URLSearchParams();
  if (params.vehicle_level) q.set("vehicle_level", "true");
  if (params.enclosure_instance_id) q.set("enclosure_instance_id", params.enclosure_instance_id);
  if (params.pcb_instance_id) q.set("pcb_instance_id", params.pcb_instance_id);
  if (params.connector_instance_id) q.set("connector_instance_id", params.connector_instance_id);
  if (params.search) q.set("search", params.search);
  const qs = q.toString();
  return qs ? `?${qs}` : "";
}

export function fetchWireTable(vehicleId: string, revisionId: string, params: WireTableParams = {}) {
  return apiFetch<WireTableResponse>(
    `/vehicles/${vehicleId}/revisions/${revisionId}/manufacturing/wire-table${wireTableQuery(params)}`,
  );
}

export function updateEdgeManufacturing(
  vehicleId: string,
  revisionId: string,
  edgeId: string,
  payload: { manufactured?: boolean; continuity_checked?: boolean },
) {
  return apiFetch<WireRow>(
    `/vehicles/${vehicleId}/revisions/${revisionId}/manufacturing/edges/${edgeId}/state`,
    { method: "PATCH", body: JSON.stringify(payload) },
  );
}
