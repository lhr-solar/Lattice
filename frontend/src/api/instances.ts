import { apiFetch } from "./client";

export interface EnclosureInstance {
  id: string;
  display_name: string;
  enclosure_template_id: string;
  connector_instance_ids: string[];
}

export interface PcbInstance {
  id: string;
  display_name: string;
  pcb_template_id: string;
  enclosure_instance_id: string | null;
}

export interface ConnectorInstance {
  id: string;
  display_name: string;
  connector_template_id: string;
  pcb_instance_id: string | null;
  enclosure_instance_id: string | null;
  source_pcb_template_slot_id?: string | null;
  source_pcb_instance_id?: string | null;
  pin_origin_note?: string | null;
  is_panel_mount: boolean;
  inline_gender?: "male" | "female" | "hermaphroditic" | "unknown" | null;
  pin_ids: string[];
}

export interface PinInstance {
  id: string;
  connector_instance_id: string;
  pin_number: number;
  name: string;
  role: string | null;
}

export function fetchEnclosures(vehicleId: string, revisionId: string) {
  return apiFetch<EnclosureInstance[]>(
    `/vehicles/${vehicleId}/revisions/${revisionId}/instances/enclosures`,
  );
}

export function createEnclosure(
  vehicleId: string,
  revisionId: string,
  body: { enclosure_template_id: string; nickname?: string; use_template_name?: boolean },
) {
  return apiFetch<EnclosureInstance>(
    `/vehicles/${vehicleId}/revisions/${revisionId}/instances/enclosures`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export function createPcb(
  vehicleId: string,
  revisionId: string,
  body: {
    pcb_template_id: string;
    enclosure_instance_id?: string;
    nickname?: string;
    use_template_name?: boolean;
  },
) {
  return apiFetch<PcbInstance>(
    `/vehicles/${vehicleId}/revisions/${revisionId}/instances/pcbs`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export function createConnector(
  vehicleId: string,
  revisionId: string,
  body: {
    connector_template_id: string;
    enclosure_instance_id?: string | null;
    pcb_instance_id?: string | null;
    is_panel_mount?: boolean;
    inline_gender?: "male" | "female" | "hermaphroditic";
    nickname?: string;
    use_template_name?: boolean;
  },
) {
  return apiFetch<ConnectorInstance>(
    `/vehicles/${vehicleId}/revisions/${revisionId}/instances/connectors`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export function updateConnectorPin(
  vehicleId: string,
  revisionId: string,
  connectorInstanceId: string,
  pinId: string,
  body: { name: string },
) {
  return apiFetch<PinInstance>(
    `/vehicles/${vehicleId}/revisions/${revisionId}/instances/connectors/${connectorInstanceId}/pins/${pinId}`,
    { method: "PATCH", body: JSON.stringify(body) },
  );
}
