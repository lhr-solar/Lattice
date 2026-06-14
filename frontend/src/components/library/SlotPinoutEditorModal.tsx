import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ConnectorTemplate } from "@/api/connectorTemplates";
import type { PinMappingEntry } from "@/api/templates";
import { fetchPinNameLibrary } from "@/api/pinNames";
import { PinNamePicker } from "@/components/library/PinNamePicker";
import { PinTemplateApplyControl } from "@/components/library/PinTemplateApplyControl";
import { pinStatesFromMapping } from "@/lib/pinTemplateApply";
import { ModalOverlay } from "@/components/ui/Modal";
import { useAppStore } from "@/stores/appStore";

export function SlotPinoutEditorModal({
  open,
  slotLabel,
  connector,
  pinMapping,
  onClose,
  onSave,
  sharedNote = "Pin names apply to every instance of this node or enclosure that uses this connector slot.",
}: {
  open: boolean;
  slotLabel: string;
  connector: ConnectorTemplate | null;
  pinMapping: PinMappingEntry[];
  onClose: () => void;
  onSave: (mapping: PinMappingEntry[]) => void;
  sharedNote?: string;
}) {
  const vehicleId = useAppStore((s) => s.selectedVehicleId);
  const openPinTemplatesManage = useAppStore((s) => s.openPinTemplatesManage);
  const [draftNames, setDraftNames] = useState<Record<number, string>>({});

  const { data: pinNameLibrary = [] } = useQuery({
    queryKey: ["pin-name-library", vehicleId],
    queryFn: () => fetchPinNameLibrary(vehicleId!),
    enabled: Boolean(open && vehicleId),
  });

  useEffect(() => {
    if (!open || !connector) return;
    const states = pinStatesFromMapping(
      connector.pin_count,
      pinMapping,
      connector.pins?.map((p) => ({ pin_number: p.pin_number, name: p.name })),
    );
    const next: Record<number, string> = {};
    for (const row of states) next[row.pin_number] = row.name;
    setDraftNames(next);
  }, [open, connector, pinMapping]);

  const sortedPins = useMemo(() => {
    if (!connector) return [];
    return Array.from({ length: connector.pin_count }, (_, idx) => idx + 1);
  }, [connector]);

  if (!open || !connector) return null;

  const buildMapping = (): PinMappingEntry[] =>
    sortedPins
      .map((pinNumber) => ({
        pin_number: pinNumber,
        name: (draftNames[pinNumber] ?? String(pinNumber)).trim(),
      }))
      .filter((row) => row.name && row.name !== String(row.pin_number))
      .map((row) => ({ pin_number: row.pin_number, name: row.name }));

  return (
    <ModalOverlay
      open={open}
      onClose={onClose}
      layer="stacked"
      ariaLabel="Edit pinout"
      panelClassName="flex h-[min(640px,90vh)] max-w-2xl flex-col overflow-hidden"
    >
      <header className="flex items-center justify-between border-b border-tesla-border px-4 py-3">
          <div>
            <h2 className="text-lg font-semibold">Edit pinout</h2>
            <p className="text-xs text-tesla-muted">
              {slotLabel} · {connector.name}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-1 text-tesla-muted transition hover:bg-tesla-border hover:text-tesla-text"
          >
            ✕
          </button>
        </header>

        <div className="border-b border-tesla-border px-4 py-2 text-xs text-tesla-muted">
          {sharedNote}
        </div>

        <div className="border-b border-tesla-border px-4 py-3">
          <PinTemplateApplyControl
            vehicleId={vehicleId}
            connectorTemplateId={connector.id}
            connectorPinCount={connector.pin_count}
            connectorPins={connector.pins?.map((p) => ({ pin_number: p.pin_number, name: p.name }))}
            pinMapping={buildMapping()}
            onApply={(mapping) => {
              const states = pinStatesFromMapping(
                connector.pin_count,
                mapping,
                connector.pins?.map((p) => ({ pin_number: p.pin_number, name: p.name })),
              );
              const next: Record<number, string> = {};
              for (const row of states) next[row.pin_number] = row.name;
              setDraftNames(next);
            }}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-tesla-border text-left text-xs uppercase tracking-wider text-tesla-muted">
                <th className="w-16 pb-2 pr-3 font-medium">Pin</th>
                <th className="pb-2 font-medium">Name</th>
              </tr>
            </thead>
            <tbody>
              {sortedPins.map((pinNumber) => (
                <tr key={pinNumber} className="border-b border-tesla-border/50">
                  <td className="py-2 pr-3 text-tesla-muted">{pinNumber}</td>
                  <td className="py-2">
                    <PinNamePicker
                      value={draftNames[pinNumber] ?? String(pinNumber)}
                      onChange={(name) =>
                        setDraftNames((prev) => ({ ...prev, [pinNumber]: name }))
                      }
                      entries={pinNameLibrary}
                      onManageLibrary={() => openPinTemplatesManage("names")}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <footer className="flex justify-end gap-2 border-t border-tesla-border px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-tesla-border px-3 py-1.5 text-sm text-tesla-muted"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onSave(buildMapping());
              onClose();
            }}
            className="rounded bg-tesla-accent px-3 py-1.5 text-sm text-white"
          >
            Apply pinout
          </button>
        </footer>
    </ModalOverlay>
  );
}
