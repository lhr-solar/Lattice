import { apiFetch } from "./client";
import type { Vehicle } from "./types";

export function fetchVehicles() {
  return apiFetch<Vehicle[]>("/vehicles");
}

export function createVehicle(name: string, description?: string) {
  return apiFetch<Vehicle>("/vehicles", {
    method: "POST",
    body: JSON.stringify({ name, description }),
  });
}

export function updateVehicleName(vehicleId: string, name: string) {
  return apiFetch<Vehicle>(`/vehicles/${vehicleId}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
}

export function deleteVehicle(vehicleId: string) {
  return apiFetch<void>(`/vehicles/${vehicleId}`, { method: "DELETE" });
}
