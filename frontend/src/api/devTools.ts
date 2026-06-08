import { apiFetch } from "./client";

export function clearVehicleData(vehicleId: string) {
  return apiFetch<void>(`/dev-tools/vehicles/${vehicleId}/clear-all`, {
    method: "POST",
  });
}
