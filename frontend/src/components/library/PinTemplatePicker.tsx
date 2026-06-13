import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { PinTemplate } from "@/api/pinTemplates";
import {
  fetchPinTemplatesForConnector,
  pinTemplatesForConnectorQueryKey,
} from "@/lib/pinTemplateQueries";
import { useAppStore } from "@/stores/appStore";

export function PinTemplatePicker({
  vehicleId,
  connectorTemplateId,
  value,
  onChange,
  disabled,
}: {
  vehicleId: string | null;
  connectorTemplateId: string;
  value: string;
  onChange: (templateId: string, template: PinTemplate | null) => void;
  disabled?: boolean;
}) {
  const openPinTemplatesPick = useAppStore((s) => s.openPinTemplatesPick);
  const pickedPinTemplate = useAppStore((s) => s.pickedPinTemplate);
  const clearPickedPinTemplate = useAppStore((s) => s.clearPickedPinTemplate);

  const { data: templates = [], isLoading, isFetching } = useQuery({
    queryKey:
      vehicleId && connectorTemplateId
        ? pinTemplatesForConnectorQueryKey(vehicleId, connectorTemplateId)
        : ["pin-templates-for-connector", "none"],
    queryFn: () => fetchPinTemplatesForConnector(vehicleId!, connectorTemplateId),
    enabled: Boolean(vehicleId && connectorTemplateId),
    staleTime: 0,
    refetchOnMount: "always",
  });

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === value) ?? null,
    [templates, value],
  );

  useEffect(() => {
    if (!pickedPinTemplate || !connectorTemplateId) return;
    if (!pickedPinTemplate.connector_template_ids.includes(connectorTemplateId)) return;
    onChange(pickedPinTemplate.id, pickedPinTemplate);
    clearPickedPinTemplate();
  }, [pickedPinTemplate, connectorTemplateId, onChange, clearPickedPinTemplate]);

  if (!connectorTemplateId) {
    return <p className="text-xs text-tesla-muted">Select a connector first.</p>;
  }

  const loading = isLoading || isFetching;
  const hasTemplates = templates.length > 0;

  return (
    <div className="space-y-1">
      <label className="text-xs text-tesla-muted">Apply template</label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={disabled || loading}
          onClick={() => openPinTemplatesPick(connectorTemplateId)}
          className="min-w-0 flex-1 rounded border border-tesla-border bg-tesla-bg px-3 py-1.5 text-left text-sm text-tesla-text transition hover:border-tesla-accent disabled:opacity-50"
        >
          {loading
            ? "Loading templates…"
            : !hasTemplates
              ? "No pin templates for this connector"
              : selectedTemplate
                ? selectedTemplate.name
                : "Select pin template…"}
        </button>
        {selectedTemplate && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange("", null)}
            className="shrink-0 rounded border border-tesla-border px-2 py-1.5 text-xs text-tesla-muted transition hover:border-tesla-accent hover:text-tesla-text disabled:opacity-50"
            title="Clear selection"
          >
            Clear
          </button>
        )}
      </div>
      {hasTemplates && !loading && (
        <p className="text-xs text-tesla-muted">
          {templates.length} template{templates.length === 1 ? "" : "s"} available for this connector
        </p>
      )}
    </div>
  );
}
