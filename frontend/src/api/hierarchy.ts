import { apiFetch } from "./client";

export interface HierarchyNode {
  id: string;
  kind: string;
  label: string;
  template_label?: string | null;
  children: HierarchyNode[];
}

export interface VehicleHierarchy {
  vehicle_id: string;
  revision_id: string;
  root: HierarchyNode;
}

export function fetchHierarchy(vehicleId: string, revisionId: string) {
  return apiFetch<VehicleHierarchy>(
    `/vehicles/${vehicleId}/revisions/${revisionId}/hierarchy`,
  );
}
