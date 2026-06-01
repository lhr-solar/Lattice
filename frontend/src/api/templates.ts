import { apiFetch } from "./client";

export interface PcbSlotCreate {
  slot_key: string;
  connector_template_id: string;
  position_index?: number;
}

export interface PcbTemplate {
  id: string;
  vehicle_id: string;
  name: string;
  slots: Array<{ id: string; slot_key: string; connector_template_id: string }>;
}

export interface EnclosureTemplate {
  id: string;
  vehicle_id: string;
  name: string;
  slots: Array<{ id: string; slot_key: string; connector_template_id: string }>;
}

export function fetchPcbTemplates(vehicleId: string) {
  return apiFetch<PcbTemplate[]>(`/vehicles/${vehicleId}/pcb-templates`);
}

export function createPcbTemplate(
  vehicleId: string,
  body: { name: string; slots: PcbSlotCreate[] },
) {
  return apiFetch<PcbTemplate>(`/vehicles/${vehicleId}/pcb-templates`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function fetchEnclosureTemplates(vehicleId: string) {
  return apiFetch<EnclosureTemplate[]>(`/vehicles/${vehicleId}/enclosure-templates`);
}

export function createEnclosureTemplate(
  vehicleId: string,
  body: { name: string; slots: Array<{ slot_key: string; connector_template_id: string }> },
) {
  return apiFetch<EnclosureTemplate>(`/vehicles/${vehicleId}/enclosure-templates`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
