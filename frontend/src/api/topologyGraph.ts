import { apiFetch } from "./client";
import type {
  TopologyGraphProjectionDto,
  TopologyLayoutRecord,
} from "./types";

export function fetchTopologyGraph(vehicleId: string, revisionId: string) {
  return apiFetch<TopologyGraphProjectionDto>(
    `/vehicles/${vehicleId}/revisions/${revisionId}/topology-graph`,
  );
}

export function patchTopologyLayout(
  vehicleId: string,
  revisionId: string,
  records: TopologyLayoutRecord[],
) {
  return apiFetch<TopologyLayoutRecord[]>(
    `/vehicles/${vehicleId}/revisions/${revisionId}/topology-graph/layout`,
    { method: "PATCH", body: JSON.stringify(records) },
  );
}
