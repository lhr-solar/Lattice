import { apiFetch } from "./client";

export interface ConnectorTemplate {
  id: string;
  name: string;
  manufacturer?: string | null;
  pin_count: number;
  male_part_number?: string | null;
  female_part_number?: string | null;
  male_crimp_part_number?: string | null;
  female_crimp_part_number?: string | null;
  male_image_url?: string | null;
  female_image_url?: string | null;
  key_code?: string | null;
  default_is_panel_mount?: boolean;
  is_inline_template?: boolean;
  pins: Array<{ id: string; pin_number: number; name: string }>;
}

export function fetchConnectorTemplates() {
  return apiFetch<ConnectorTemplate[]>("/connector-templates");
}

export function createConnectorTemplate(body: {
  name: string;
  manufacturer?: string;
  pin_count: number;
  pins: Array<{ pin_number: number; name: string }>;
  male_part_number?: string;
  female_part_number?: string;
  male_crimp_part_number?: string;
  female_crimp_part_number?: string;
  male_image_url?: string;
  female_image_url?: string;
  key_code?: string;
  default_is_panel_mount?: boolean;
  is_inline_template?: boolean;
  pin_shorts?: Array<{ pin_number_a?: number; pin_number_b?: number; pin_name?: string }>;
}) {
  return apiFetch<ConnectorTemplate>("/connector-templates", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateConnectorTemplate(
  templateId: string,
  body: Parameters<typeof createConnectorTemplate>[0],
) {
  return apiFetch<ConnectorTemplate>(`/connector-templates/${templateId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function deleteConnectorTemplate(templateId: string) {
  return apiFetch<void>(`/connector-templates/${templateId}`, {
    method: "DELETE",
  });
}
