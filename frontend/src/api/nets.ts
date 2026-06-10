import { apiFetch } from "./client";

export interface NetSummary {
  id: string;
  name: string;
  signal_kind: string;
  is_auto_named: boolean;
  pin_count: number;
  default_wire_color: string | null;
}

export interface NetPinInfo {
  pin_id: string;
  pin_number: number;
  pin_name: string;
  connector_instance_id: string;
  connector_label: string;
  primary_net_id: string | null;
  primary_net_name: string | null;
}

export interface NetDetail extends NetSummary {
  pins: NetPinInfo[];
  edge_ids: string[];
}

export interface NetDeleteResult {
  deleted_net_id: string;
  deleted_net_name: string;
  pins_reassigned: number;
  created_auto_nets: string[];
}

export function fetchNets(
  vehicleId: string,
  revisionId: string,
  params?: { search?: string; auto_named_only?: boolean },
) {
  const q = new URLSearchParams();
  if (params?.search) q.set("search", params.search);
  if (params?.auto_named_only !== undefined) q.set("auto_named_only", String(params.auto_named_only));
  const qs = q.toString();
  return apiFetch<NetSummary[]>(
    `/vehicles/${vehicleId}/revisions/${revisionId}/nets${qs ? `?${qs}` : ""}`,
  );
}

export function fetchNet(vehicleId: string, revisionId: string, netId: string) {
  return apiFetch<NetDetail>(`/vehicles/${vehicleId}/revisions/${revisionId}/nets/${netId}`);
}

export function createNet(
  vehicleId: string,
  revisionId: string,
  body: { name: string; signal_kind?: string; default_wire_color?: string | null },
) {
  return apiFetch<NetDetail>(`/vehicles/${vehicleId}/revisions/${revisionId}/nets`, {
    method: "POST",
    body: JSON.stringify({ signal_kind: "custom", ...body }),
  });
}

export function updateNet(
  vehicleId: string,
  revisionId: string,
  netId: string,
  body: {
    name?: string;
    signal_kind?: string;
    default_wire_color?: string | null;
    expected_edit_sequence?: number;
  },
) {
  return apiFetch<NetDetail>(`/vehicles/${vehicleId}/revisions/${revisionId}/nets/${netId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function deleteNet(vehicleId: string, revisionId: string, netId: string) {
  return apiFetch<NetDeleteResult>(
    `/vehicles/${vehicleId}/revisions/${revisionId}/nets/${netId}`,
    { method: "DELETE" },
  );
}

export function fetchPins(
  vehicleId: string,
  revisionId: string,
  params?: { connector_instance_id?: string; search?: string },
) {
  const q = new URLSearchParams();
  if (params?.connector_instance_id) q.set("connector_instance_id", params.connector_instance_id);
  if (params?.search) q.set("search", params.search);
  const qs = q.toString();
  return apiFetch<NetPinInfo[]>(
    `/vehicles/${vehicleId}/revisions/${revisionId}/nets/pins${qs ? `?${qs}` : ""}`,
  );
}

export function pairPins(
  vehicleId: string,
  revisionId: string,
  body: {
    pin_a_id: string;
    pin_b_id: string;
    net_id?: string;
    net_name?: string;
    create_edge?: boolean;
    wire_color?: string;
    replace_existing_primary?: boolean;
  },
) {
  return apiFetch<{ net: NetDetail; edge: unknown | null; assignments_created: number }>(
    `/vehicles/${vehicleId}/revisions/${revisionId}/nets/pair`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export function assignPinNet(
  vehicleId: string,
  revisionId: string,
  pinId: string,
  netId: string | null,
) {
  return apiFetch<NetDetail | { unassigned: boolean }>(
    `/vehicles/${vehicleId}/revisions/${revisionId}/nets/pins/${pinId}/assignment`,
    { method: "PUT", body: JSON.stringify({ net_id: netId }) },
  );
}
