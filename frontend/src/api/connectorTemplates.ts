import { apiFetch } from "./client";

export type ConnectorCategory = "wire_to_wire" | "wire_to_board";

export interface ConnectorTemplate {
  id: string;
  name: string;
  manufacturer?: string | null;
  pin_count: number;
  wire_gauge_awg?: number | null;
  male_part_number?: string | null;
  female_part_number?: string | null;
  male_crimp_part_number?: string | null;
  female_crimp_part_number?: string | null;
  male_image_url?: string | null;
  female_image_url?: string | null;
  key_code?: string | null;
  connector_category?: ConnectorCategory;
  default_is_panel_mount?: boolean;
  is_inline_template?: boolean;
  default_inline_gender?: "male" | "female" | "hermaphroditic" | "unknown" | null;
  inline_part_number?: string | null;
  pins: Array<{ id: string; pin_number: number; name: string }>;
}

export function fetchConnectorTemplates() {
  return apiFetch<ConnectorTemplate[]>("/connector-templates");
}

export function createConnectorTemplate(body: {
  name: string;
  manufacturer?: string;
  pin_count: number;
  wire_gauge_awg?: number;
  pins: Array<{ pin_number: number; name: string }>;
  male_part_number?: string;
  female_part_number?: string;
  male_crimp_part_number?: string;
  female_crimp_part_number?: string;
  male_image_url?: string;
  female_image_url?: string;
  key_code?: string;
  connector_category?: ConnectorCategory;
  default_is_panel_mount?: boolean;
  is_inline_template?: boolean;
  default_inline_gender?: "male" | "female" | "hermaphroditic";
  inline_part_number?: string;
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

export function connectorCategoryOf(template: ConnectorTemplate): ConnectorCategory {
  if (template.connector_category) {
    return template.connector_category;
  }
  if (template.is_inline_template || template.default_is_panel_mount) {
    return "wire_to_wire";
  }
  return "wire_to_board";
}

export function isWireToWireTemplate(template: ConnectorTemplate): boolean {
  return connectorCategoryOf(template) === "wire_to_wire";
}

export function isWireToBoardTemplate(template: ConnectorTemplate): boolean {
  return connectorCategoryOf(template) === "wire_to_board";
}

export function supportsInlineAddTemplate(template: ConnectorTemplate): boolean {
  return isWireToWireTemplate(template) && Boolean(template.is_inline_template);
}

export function supportsEnclosurePanelTemplate(template: ConnectorTemplate): boolean {
  return isWireToWireTemplate(template) && Boolean(template.default_is_panel_mount);
}

export function supportsNodeSlotTemplate(template: ConnectorTemplate): boolean {
  return isWireToBoardTemplate(template);
}

export function supportsNodeSlotPigtailOption(template: ConnectorTemplate): boolean {
  return isWireToBoardTemplate(template) && !template.default_is_panel_mount;
}

export function nodeSlotAutoBubblesToEnclosure(template: ConnectorTemplate): boolean {
  return isWireToBoardTemplate(template) && Boolean(template.default_is_panel_mount);
}
