import { fetchPinTemplates } from "@/api/pinTemplates";

export function pinTemplateLibraryQueryKey(vehicleId: string) {
  return ["pin-template-library", vehicleId] as const;
}

export function pinTemplatesForConnectorQueryKey(vehicleId: string, connectorTemplateId: string) {
  return ["pin-templates-for-connector", vehicleId, connectorTemplateId] as const;
}

export function fetchPinTemplateLibrary(vehicleId: string) {
  return fetchPinTemplates(vehicleId);
}

export function fetchPinTemplatesForConnector(vehicleId: string, connectorTemplateId: string) {
  return fetchPinTemplates(vehicleId, connectorTemplateId);
}
