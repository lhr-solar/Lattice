import { apiFetch } from "./client";
import type { AdminUser, User, Vehicle } from "./types";

export function fetchUsers() {
  return apiFetch<AdminUser[]>("/admin/users");
}

export function fetchConnectedCount() {
  return apiFetch<{ count: number }>("/admin/connected-count");
}

export function createUser(username: string, password?: string) {
  return apiFetch<User>("/admin/users", {
    method: "POST",
    body: JSON.stringify({ username, password: password ?? null }),
  });
}

export function updateUserPassword(userId: string, password: string) {
  return apiFetch<void>(`/admin/users/${userId}/password`, {
    method: "PATCH",
    body: JSON.stringify({ password }),
  });
}

export function fetchDefaultPassword() {
  return apiFetch<{ configured: boolean; password: string }>("/admin/settings/default-password");
}

export function updateDefaultPassword(password: string) {
  return apiFetch<{ configured: boolean; password: string }>("/admin/settings/default-password", {
    method: "PATCH",
    body: JSON.stringify({ password }),
  });
}

export function deleteUser(userId: string) {
  return apiFetch<void>(`/admin/users/${userId}`, { method: "DELETE" });
}

export function createUsersBulk(usernames: string[], password?: string) {
  return apiFetch<{ created: User[]; skipped_usernames: string[] }>("/admin/users/bulk", {
    method: "POST",
    body: JSON.stringify({ usernames, password: password ?? null }),
  });
}

export function deleteUsersBulk(userIds: string[]) {
  return apiFetch<{ succeeded: number; failed: number; errors: string[] }>(
    "/admin/users/bulk/delete",
    {
      method: "POST",
      body: JSON.stringify({ user_ids: userIds }),
    },
  );
}

export function updateUsersPasswordBulk(userIds: string[], password: string) {
  return apiFetch<{ succeeded: number; failed: number; errors: string[] }>(
    "/admin/users/bulk/password",
    {
      method: "PATCH",
      body: JSON.stringify({ user_ids: userIds, password }),
    },
  );
}

export function createVehicle(name: string, description?: string) {
  return apiFetch<Vehicle>("/admin/vehicles", {
    method: "POST",
    body: JSON.stringify({ name, description: description ?? null }),
  });
}

export function updateVehicleName(vehicleId: string, name: string) {
  return apiFetch<Vehicle>(`/admin/vehicles/${vehicleId}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
}

export function deleteVehicle(vehicleId: string) {
  return apiFetch<void>(`/admin/vehicles/${vehicleId}`, { method: "DELETE" });
}

export function clearVehicleData(vehicleId: string) {
  return apiFetch<void>(`/admin/vehicles/${vehicleId}/clear-all`, { method: "POST" });
}

export function clearVehicleWires(vehicleId: string) {
  return apiFetch<void>(`/admin/vehicles/${vehicleId}/clear-wires`, { method: "POST" });
}

export function clearVehicleTopology(vehicleId: string) {
  return apiFetch<void>(`/admin/vehicles/${vehicleId}/clear-topology`, { method: "POST" });
}

export function clearVehicleRevisions(vehicleId: string) {
  return apiFetch<void>(`/admin/vehicles/${vehicleId}/clear-revisions`, { method: "POST" });
}

export interface AdminRevisionTimelineItem {
  id: string;
  vehicle_id: string;
  revision_number: number;
  status: string;
  label: string | null;
  is_immutable: boolean;
  created_at: string;
  edit_sequence: number;
  created_by: string | null;
  parent_revision_id: string | null;
  snapshot_taken_at: string | null;
  is_current: boolean;
  parent_revision_number: number | null;
  parent_created_at: string | null;
  parent_snapshot_taken_at: string | null;
}

export interface AdminRevisionTimelinePage {
  vehicle_id: string;
  current_revision_id: string | null;
  revisions: AdminRevisionTimelineItem[];
  total: number;
  offset: number;
  limit: number;
  has_more: boolean;
}

export function fetchVehicleRevisionTimeline(
  vehicleId: string,
  params?: { search?: string; offset?: number; limit?: number },
) {
  const qs = new URLSearchParams();
  if (params?.search?.trim()) qs.set("search", params.search.trim());
  if (params?.offset != null) qs.set("offset", String(params.offset));
  if (params?.limit != null) qs.set("limit", String(params.limit));
  const query = qs.toString();
  return apiFetch<AdminRevisionTimelinePage>(
    `/admin/vehicles/${vehicleId}/revisions${query ? `?${query}` : ""}`,
  );
}

export function revertVehicleRevision(vehicleId: string, revisionId: string) {
  return apiFetch<{
    source_revision: AdminRevisionTimelineItem;
    new_revision: AdminRevisionTimelineItem;
    previous_current_revision_id: string | null;
  }>(`/admin/vehicles/${vehicleId}/revisions/${revisionId}/revert`, { method: "POST" });
}
