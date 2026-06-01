import { apiFetch } from "./client";

export interface ConnectorTemplate {
  id: string;
  name: string;
  pin_count: number;
  pins: Array<{ id: string; pin_number: number; name: string }>;
}

export function fetchConnectorTemplates() {
  return apiFetch<ConnectorTemplate[]>("/connector-templates");
}

export function createConnectorTemplate(body: {
  name: string;
  pin_count: number;
  pins: Array<{ pin_number: number; name: string }>;
  male_part_number?: string;
  female_part_number?: string;
  male_image_url?: string;
  female_image_url?: string;
  pin_shorts?: Array<{ pin_number_a?: number; pin_number_b?: number; pin_name?: string }>;
}) {
  return apiFetch<ConnectorTemplate>("/connector-templates", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
