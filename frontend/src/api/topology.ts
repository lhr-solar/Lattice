import { apiFetch } from "./client";

export interface TopologySummary {
  net_count: number;
  edge_count: number;
  pin_count: number;
  connector_count: number;
  enclosure_count: number;
  pcb_count: number;
}

export function fetchTopologySummary(vehicleId: string, revisionId: string) {
  return apiFetch<TopologySummary>(
    `/vehicles/${vehicleId}/revisions/${revisionId}/topology/summary`,
  );
}

export interface ConnectionEdge {
  id: string;
  pin_a_id: string;
  pin_b_id: string;
  signal_id: string | null;
  gauge_awg: string | null;
  wire_color: string | null;
}

export function updateEdge(
  vehicleId: string,
  revisionId: string,
  edgeId: string,
  body: { gauge_awg?: number | null; wire_color?: string | null },
) {
  return apiFetch<ConnectionEdge>(
    `/vehicles/${vehicleId}/revisions/${revisionId}/topology/edges/${edgeId}`,
    { method: "PATCH", body: JSON.stringify(body) },
  );
}
