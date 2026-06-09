import { apiFetch } from "./client";

export interface ConnectionDestination {
  edge_id: string;
  other_pin_id: string;
  other_pin_number: number;
  other_pin_name: string;
  other_connector_instance_id: string;
  other_connector_label: string;
  other_container_label: string | null;
  other_path_label: string;
  wire_color: string | null;
  gauge_awg: string | null;
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
  },
) {
  const q = new URLSearchParams();
  if (params?.connector_instance_id) q.set("connector_instance_id", params.connector_instance_id);
  if (params?.pcb_instance_id) q.set("pcb_instance_id", params.pcb_instance_id);
  if (params?.enclosure_instance_id) q.set("enclosure_instance_id", params.enclosure_instance_id);
  if (params?.vehicle_level) q.set("vehicle_level", "true");
  if (params?.search) q.set("search", params.search);
  const qs = q.toString();
  return apiFetch<{ rows: PinConnectionRow[] }>(
    `${base(vehicleId, revisionId)}/table${qs ? `?${qs}` : ""}`,
  ).then((r) => r.rows);
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
  },
) {
  return apiFetch<ConnectPinsResult>(`${base(vehicleId, revisionId)}/connect`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function disconnectEdge(vehicleId: string, revisionId: string, edgeId: string) {
  return apiFetch<void>(`${base(vehicleId, revisionId)}/edges/${edgeId}`, { method: "DELETE" });
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
