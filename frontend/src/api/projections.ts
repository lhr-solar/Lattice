import { apiFetch } from "./client";
import type { DesignGraphProjectionDto, ProjectionLevel } from "./types";

export function fetchDesignProjection(
  vehicleId: string,
  revisionId: string,
  level: ProjectionLevel = "vehicle",
  focusId?: string,
) {
  const params = new URLSearchParams({ level });
  if (focusId) params.set("focus_id", focusId);
  return apiFetch<DesignGraphProjectionDto>(
    `/vehicles/${vehicleId}/revisions/${revisionId}/projections/design?${params}`,
  );
}
