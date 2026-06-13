import { apiFetch } from "./client";

export interface PinTemplatePin {
  pin_number: number;
  name: string | null;
}

export interface PinTemplate {
  id: string;
  vehicle_id: string;
  name: string;
  pin_count: number;
  connector_template_ids: string[];
  pins: PinTemplatePin[];
}

export interface PinTemplateCreate {
  name: string;
  connector_template_ids: string[];
  pins: Array<{ pin_number: number; name?: string | null }>;
}

export function fetchPinTemplates(vehicleId: string, connectorTemplateId?: string) {
  const params = connectorTemplateId ? `?connector_template_id=${connectorTemplateId}` : "";
  return apiFetch<PinTemplate[]>(`/vehicles/${vehicleId}/pin-templates${params}`);
}

export function createPinTemplate(vehicleId: string, body: PinTemplateCreate) {
  return apiFetch<PinTemplate>(`/vehicles/${vehicleId}/pin-templates`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updatePinTemplate(vehicleId: string, templateId: string, body: PinTemplateCreate) {
  return apiFetch<PinTemplate>(`/vehicles/${vehicleId}/pin-templates/${templateId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function deletePinTemplate(vehicleId: string, templateId: string) {
  return apiFetch<void>(`/vehicles/${vehicleId}/pin-templates/${templateId}`, {
    method: "DELETE",
  });
}
