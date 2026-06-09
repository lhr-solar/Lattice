import { apiFetch } from "./client";

export interface Revision {
  id: string;
  revision_number: number;
  status: string;
  label: string | null;
  is_immutable: boolean;
  edit_sequence: number;
}

export function fetchRevisions(vehicleId: string) {
  return apiFetch<{ revisions: Revision[] }>(`/vehicles/${vehicleId}/revisions`);
}

export function publishRevision(vehicleId: string, revisionId: string) {
  return apiFetch<{
    published_revision: Revision;
    new_draft_revision: Revision;
  }>(`/vehicles/${vehicleId}/revisions/${revisionId}/publish`, { method: "POST" });
}
