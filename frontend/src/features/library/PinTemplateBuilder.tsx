import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ConnectorTemplate } from "@/api/connectorTemplates";
import { fetchPinNameLibrary } from "@/api/pinNames";
import type { PinTemplate, PinTemplateCreate } from "@/api/pinTemplates";
import { PinNamePicker } from "@/components/library/PinNamePicker";
import {
  ConnectorTemplatePicker,
  connectorSubtitle,
} from "@/components/library/TemplatePickers";
import { Modal } from "@/components/ui/Modal";
import { useAppStore } from "@/stores/appStore";

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-tesla-muted">{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border border-tesla-border bg-tesla-bg px-2 py-1.5 text-sm text-tesla-text"
      />
    </label>
  );
}

export function PinTemplateBuilderModal({
  open,
  mode,
  initial,
  connectors,
  onClose,
  onSubmit,
  pending,
}: {
  open: boolean;
  mode: "add" | "edit";
  initial: PinTemplate | null;
  connectors: ConnectorTemplate[];
  onClose: () => void;
  onSubmit: (payload: PinTemplateCreate) => void;
  pending: boolean;
}) {
  const [name, setName] = useState("");
  const [selectedConnectorIds, setSelectedConnectorIds] = useState<string[]>([]);
  const [pickerConnectorId, setPickerConnectorId] = useState("");
  const [pinNames, setPinNames] = useState<Record<number, string>>({});
  const vehicleId = useAppStore((s) => s.selectedVehicleId);

  const { data: pinNameLibrary = [] } = useQuery({
    queryKey: ["pin-name-library", vehicleId],
    queryFn: () => fetchPinNameLibrary(vehicleId!),
    enabled: Boolean(open && vehicleId),
  });

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && initial) {
      setName(initial.name);
      setSelectedConnectorIds(initial.connector_template_ids);
      const names: Record<number, string> = {};
      for (const pin of initial.pins) {
        if (pin.name) names[pin.pin_number] = pin.name;
      }
      setPinNames(names);
      setPickerConnectorId("");
      return;
    }
    setName("");
    setSelectedConnectorIds([]);
    setPinNames({});
    setPickerConnectorId("");
  }, [open, mode, initial]);

  const connectorById = useMemo(
    () => new Map(connectors.map((connector) => [connector.id, connector])),
    [connectors],
  );

  const availableConnectors = useMemo(
    () => connectors.filter((connector) => !selectedConnectorIds.includes(connector.id)),
    [connectors, selectedConnectorIds],
  );

  const selectedConnectors = useMemo(
    () =>
      selectedConnectorIds
        .map((id) => connectorById.get(id))
        .filter((connector): connector is ConnectorTemplate => Boolean(connector)),
    [selectedConnectorIds, connectorById],
  );

  const pinCount = useMemo(() => {
    if (!selectedConnectors.length) return 0;
    return Math.min(...selectedConnectors.map((connector) => connector.pin_count));
  }, [selectedConnectors]);

  useEffect(() => {
    if (pinCount <= 0) return;
    setPinNames((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const pinNumber of Object.keys(next).map(Number)) {
        if (pinNumber > pinCount) {
          delete next[pinNumber];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [pinCount]);

  const addConnector = () => {
    if (!pickerConnectorId || selectedConnectorIds.includes(pickerConnectorId)) return;
    setSelectedConnectorIds((prev) => [...prev, pickerConnectorId]);
    setPickerConnectorId("");
  };

  const removeConnector = (connectorId: string) => {
    setSelectedConnectorIds((prev) => prev.filter((id) => id !== connectorId));
  };

  const canSubmit = Boolean(name.trim() && selectedConnectorIds.length && pinCount > 0 && !pending);
  const canAddConnector = Boolean(pickerConnectorId && !selectedConnectorIds.includes(pickerConnectorId));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === "edit" ? "Pin templates — edit" : "Pin templates — new"}
      layer="stacked"
      panelClassName="flex h-[min(840px,90vh)] max-w-2xl flex-col overflow-hidden"
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden !py-3"
      footer={
        <>
          <button type="button" className="rounded border border-tesla-border px-3 py-1 text-sm" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            className="rounded bg-tesla-accent px-3 py-1 text-sm text-white disabled:opacity-50"
            onClick={() =>
              onSubmit({
                name: name.trim(),
                connector_template_ids: selectedConnectorIds,
                pins: Array.from({ length: pinCount }, (_, idx) => {
                  const pinNumber = idx + 1;
                  const pinName = pinNames[pinNumber]?.trim();
                  return { pin_number: pinNumber, name: pinName || null };
                }).filter((pin) => pin.name),
              })
            }
          >
            {pending ? (mode === "edit" ? "Saving…" : "Creating…") : mode === "edit" ? "Save" : "Create"}
          </button>
        </>
      }
    >
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
        <Field label="Template name" value={name} onChange={setName} placeholder="e.g. Power harness" />
        <div className="space-y-2">
          <p className="text-xs text-tesla-muted">
            Add connector templates this pin template applies to. Pin count uses the smallest
            connector in the list.
          </p>
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <ConnectorTemplatePicker
                label="Connector"
                connectors={availableConnectors}
                value={pickerConnectorId}
                onChange={setPickerConnectorId}
              />
            </div>
            <button
              type="button"
              disabled={!canAddConnector}
              onClick={addConnector}
              className="shrink-0 rounded border border-tesla-border px-3 py-2 text-sm text-tesla-text transition hover:border-tesla-accent disabled:opacity-40"
            >
              Add
            </button>
          </div>
          {selectedConnectors.length > 0 ? (
            <ul className="space-y-1 rounded border border-tesla-border p-2">
              {selectedConnectors.map((connector) => (
                <li
                  key={connector.id}
                  className="flex items-center gap-2 rounded border border-tesla-border/60 px-2 py-1.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-tesla-text">{connector.name}</p>
                    <p className="truncate text-xs text-tesla-muted">{connectorSubtitle(connector)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeConnector(connector.id)}
                    className="flex size-7 shrink-0 items-center justify-center rounded border border-tesla-border text-base leading-none text-tesla-muted transition hover:border-red-500/50 hover:text-red-300"
                    title="Remove connector"
                    aria-label={`Remove ${connector.name}`}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-tesla-muted">No connectors added yet.</p>
          )}
        </div>
        {selectedConnectorIds.length > 0 && (
          <p className="text-xs text-tesla-muted">
            Template covers pins 1–{pinCount}. Leave a pin blank to make no change when applying.
          </p>
        )}
        {pinCount > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wider text-tesla-muted">Pin names</p>
            <ul className="divide-y divide-tesla-border/50 rounded border border-tesla-border">
              {Array.from({ length: pinCount }, (_, idx) => {
                const pinNumber = idx + 1;
                return (
                  <li key={pinNumber} className="flex items-center gap-3 px-3 py-2">
                    <span className="w-10 shrink-0 text-sm text-tesla-muted">{pinNumber}</span>
                    <div className="min-w-0 flex-1">
                      <PinNamePicker
                        value={pinNames[pinNumber] ?? ""}
                        onChange={(value) =>
                          setPinNames((prev) => {
                            const next = { ...prev };
                            if (value.trim()) next[pinNumber] = value;
                            else delete next[pinNumber];
                            return next;
                          })
                        }
                        entries={pinNameLibrary}
                        placeholder="(blank)"
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}

export function pinTemplateSubtitle(template: PinTemplate, connectors: ConnectorTemplate[]) {
  const connectorNames = template.connector_template_ids
    .map((id) => connectors.find((c) => c.id === id)?.name ?? id.slice(0, 8))
    .join(", ");
  const namedCount = template.pins.filter((p) => p.name).length;
  return `${template.pin_count} pins · ${namedCount} named · ${connectorNames}`;
}
