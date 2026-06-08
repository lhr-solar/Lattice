import { apiFetch } from "./client";

export interface PcbSlotCreate {
  slot_key: string;
  connector_template_id: string;
  position_index?: number;
  export_to_enclosure?: boolean;
  nickname?: string;
  description?: string;
}

export interface PcbTemplate {
  id: string;
  vehicle_id: string;
  name: string;
  description?: string | null;
  slots: Array<{
    id: string;
    slot_key: string;
    connector_template_id: string;
    export_to_enclosure?: boolean;
    nickname?: string | null;
    description?: string | null;
  }>;
}

export interface EnclosureTemplate {
  id: string;
  vehicle_id: string;
  name: string;
  slots: Array<{ id: string; slot_key: string; connector_template_id: string }>;
  pcb_slots?: Array<{ id: string; slot_key: string; pcb_template_id: string }>;
}

export function fetchPcbTemplates(vehicleId: string) {
  return apiFetch<PcbTemplate[]>(`/vehicles/${vehicleId}/pcb-templates`);
}

export function createPcbTemplate(
  vehicleId: string,
  body: { name: string; description?: string; slots: PcbSlotCreate[] },
) {
  return apiFetch<PcbTemplate>(`/vehicles/${vehicleId}/pcb-templates`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updatePcbTemplate(
  vehicleId: string,
  templateId: string,
  body: Parameters<typeof createPcbTemplate>[1],
) {
  return apiFetch<PcbTemplate>(`/vehicles/${vehicleId}/pcb-templates/${templateId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function deletePcbTemplate(vehicleId: string, templateId: string) {
  return apiFetch<void>(`/vehicles/${vehicleId}/pcb-templates/${templateId}`, {
    method: "DELETE",
  });
}

export function fetchEnclosureTemplates(vehicleId: string) {
  return apiFetch<EnclosureTemplate[]>(`/vehicles/${vehicleId}/enclosure-templates`);
}

export function createEnclosureTemplate(
  vehicleId: string,
  body: {
    name: string;
    slots: Array<{ slot_key: string; connector_template_id: string }>;
    pcb_slots?: Array<{ slot_key: string; pcb_template_id: string }>;
  },
) {
  return apiFetch<EnclosureTemplate>(`/vehicles/${vehicleId}/enclosure-templates`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateEnclosureTemplate(
  vehicleId: string,
  templateId: string,
  body: Parameters<typeof createEnclosureTemplate>[1],
) {
  return apiFetch<EnclosureTemplate>(`/vehicles/${vehicleId}/enclosure-templates/${templateId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function deleteEnclosureTemplate(vehicleId: string, templateId: string) {
  return apiFetch<void>(`/vehicles/${vehicleId}/enclosure-templates/${templateId}`, {
    method: "DELETE",
  });
}
