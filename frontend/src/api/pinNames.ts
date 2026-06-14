import { apiFetch } from "./client";

export interface PinNameEntry {
  id: string;
  vehicle_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export function fetchPinNameLibrary(vehicleId: string, search?: string) {
  const q = new URLSearchParams();
  if (search) q.set("search", search);
  const qs = q.toString();
  return apiFetch<PinNameEntry[]>(
    `/vehicles/${vehicleId}/pin-name-library${qs ? `?${qs}` : ""}`,
  );
}

export function createPinNameEntry(
  vehicleId: string,
  body: { name: string; description?: string | null },
) {
  return apiFetch<PinNameEntry>(`/vehicles/${vehicleId}/pin-name-library`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updatePinNameEntry(
  vehicleId: string,
  entryId: string,
  body: { name?: string; description?: string | null },
) {
  return apiFetch<PinNameEntry>(`/vehicles/${vehicleId}/pin-name-library/${entryId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function deletePinNameEntry(vehicleId: string, entryId: string) {
  return apiFetch<void>(`/vehicles/${vehicleId}/pin-name-library/${entryId}`, {
    method: "DELETE",
  });
}
