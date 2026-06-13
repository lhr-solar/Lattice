import { apiFetch } from "./client";

export interface ConnectionDestination {
  edge_id: string;
  other_pin_id: string;
  other_pin_number: number;
  other_pin_name: string;
  other_connector_instance_id: string;
  other_connector_label: string;
  other_container_label: string | null;
  other_node_label?: string | null;
  other_enclosure_label?: string | null;
  other_connector_kind?: string | null;
  other_path_label: string;
  wire_color: string | null;
  effective_wire_color: string | null;
  net_default_wire_color: string | null;
  gauge_awg: string | null;
  gauge_label: string;
}

export interface PinConnectionRow {
  pin_id: string;
  pin_number: number;
  pin_name: string;
  connector_instance_id: string;
  connector_label: string;
  connector_kind: string | null;
  slot_key: string | null;
  connector_template_name: string | null;
  node_template_name: string | null;
  enclosure_template_name: string | null;
  container_label: string | null;
  container_kind: string | null;
  node_label: string | null;
  enclosure_label: string | null;
  primary_net_id: string | null;
  primary_net_name: string | null;
  is_auto_net: boolean;
  destinations: ConnectionDestination[];
  short_partner_pin_ids: string[];
}

export interface ConnectionScopeItem {
  id: string;
  kind: string;
  label: string;
  parent_label: string | null;
  pin_count: number;
  connector_count: number;
}

export interface ConnectPinsResult {
  edge: { id: string; pin_a_id: string; pin_b_id: string } & Record<string, unknown>;
  net_action: "picked_up" | "already_same" | "merged" | "conflict" | "none";
  net_id: string | null;
  net_name: string | null;
  message: string;
  conflict_net_a_id: string | null;
  conflict_net_a_name: string | null;
  conflict_net_b_id: string | null;
  conflict_net_b_name: string | null;
}

export interface ConnectionTableResult {
  rows: PinConnectionRow[];
  total: number;
  limit: number;
  offset: number;
}

const base = (vehicleId: string, revisionId: string) =>
  `/vehicles/${vehicleId}/revisions/${revisionId}/connections`;

export function fetchConnectionScopes(vehicleId: string, revisionId: string) {
  return apiFetch<{ scopes: ConnectionScopeItem[] }>(`${base(vehicleId, revisionId)}/scopes`).then(
    (r) => r.scopes,
  );
}

export function fetchConnectionTable(
  vehicleId: string,
  revisionId: string,
  params?: {
    connector_instance_id?: string;
    pcb_instance_id?: string;
    enclosure_instance_id?: string;
    vehicle_level?: boolean;
    search?: string;
    limit?: number;
    offset?: number;
  },
) {
  const q = new URLSearchParams();
  if (params?.connector_instance_id) q.set("connector_instance_id", params.connector_instance_id);
  if (params?.pcb_instance_id) q.set("pcb_instance_id", params.pcb_instance_id);
  if (params?.enclosure_instance_id) q.set("enclosure_instance_id", params.enclosure_instance_id);
  if (params?.vehicle_level) q.set("vehicle_level", "true");
  if (params?.search) q.set("search", params.search);
  if (params?.limit !== undefined) q.set("limit", String(params.limit));
  if (params?.offset !== undefined) q.set("offset", String(params.offset));
  const qs = q.toString();
  return apiFetch<ConnectionTableResult>(
    `${base(vehicleId, revisionId)}/table${qs ? `?${qs}` : ""}`,
  );
}

export function connectPins(
  vehicleId: string,
  revisionId: string,
  body: {
    pin_a_id: string;
    pin_b_id: string;
    wire_color?: string;
    gauge_awg?: number;
    merge_target_net_id?: string;
    expected_edit_sequence?: number;
  },
) {
  return apiFetch<ConnectPinsResult>(`${base(vehicleId, revisionId)}/connect`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function disconnectEdge(
  vehicleId: string,
  revisionId: string,
  edgeId: string,
  expectedEditSequence?: number,
) {
  const q = new URLSearchParams();
  if (expectedEditSequence !== undefined) {
    q.set("expected_edit_sequence", String(expectedEditSequence));
  }
  const qs = q.toString();
  return apiFetch<void>(`${base(vehicleId, revisionId)}/edges/${edgeId}${qs ? `?${qs}` : ""}`, {
    method: "DELETE",
  });
}

export function assignNetByName(
  vehicleId: string,
  revisionId: string,
  pinId: string,
  netName: string | null,
) {
  return apiFetch<{ net_id: string | null; net_name: string | null; unassigned: boolean }>(
    `${base(vehicleId, revisionId)}/pins/${pinId}/net`,
    { method: "PUT", body: JSON.stringify({ net_name: netName }) },
  );
}
