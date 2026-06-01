import { apiFetch } from "./client";

export interface PinShort {
  id: string;
  pin_a_id: string;
  pin_b_id: string;
}

export function fetchPinShorts(
  vehicleId: string,
  revisionId: string,
  connectorInstanceId: string,
) {
  return apiFetch<PinShort[]>(
    `/vehicles/${vehicleId}/revisions/${revisionId}/instances/connectors/${connectorInstanceId}/shorts`,
  );
}

export function createPinShort(
  vehicleId: string,
  revisionId: string,
  connectorInstanceId: string,
  pinAId: string,
  pinBId: string,
) {
  return apiFetch<PinShort>(
    `/vehicles/${vehicleId}/revisions/${revisionId}/instances/connectors/${connectorInstanceId}/shorts`,
    {
      method: "POST",
      body: JSON.stringify({ pin_a_id: pinAId, pin_b_id: pinBId }),
    },
  );
}

export function deletePinShort(
  vehicleId: string,
  revisionId: string,
  connectorInstanceId: string,
  shortId: string,
) {
  return apiFetch<void>(
    `/vehicles/${vehicleId}/revisions/${revisionId}/instances/connectors/${connectorInstanceId}/shorts/${shortId}`,
    { method: "DELETE" },
  );
}

export function addTemplatePinShort(
  templateId: string,
  body: { pin_number_a?: number; pin_number_b?: number; pin_name?: string },
) {
  return apiFetch(`/connector-templates/${templateId}/shorts`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
