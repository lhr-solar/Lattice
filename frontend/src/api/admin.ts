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
  return apiFetch<{ configured: boolean }>("/admin/settings/default-password");
}

export function updateDefaultPassword(password: string) {
  return apiFetch<{ configured: boolean }>("/admin/settings/default-password", {
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
