import { apiFetch } from "./client";
import type { AdminUser, User, Vehicle } from "./types";

export function fetchUsers() {
  return apiFetch<AdminUser[]>("/admin/users");
}

export function fetchConnectedCount() {
  return apiFetch<{ count: number }>("/admin/connected-count");
}

export function createUser(username: string, password: string) {
  return apiFetch<User>("/admin/users", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function deleteUser(userId: string) {
  return apiFetch<void>(`/admin/users/${userId}`, { method: "DELETE" });
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
