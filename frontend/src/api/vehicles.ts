import { apiFetch } from "./client";
import type { Vehicle } from "./types";

export function fetchVehicles() {
  return apiFetch<Vehicle[]>("/vehicles");
}
