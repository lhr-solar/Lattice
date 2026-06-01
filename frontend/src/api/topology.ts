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
