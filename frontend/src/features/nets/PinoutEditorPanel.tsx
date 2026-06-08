import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/api/client";
import { assignPinNet, fetchNets, fetchPins } from "@/api/nets";
import { fetchPinNameLibrary } from "@/api/pinNames";
import { updateConnectorPin } from "@/api/instances";
import { useAppStore } from "@/stores/appStore";
import { InstancePicker } from "@/components/library/TemplatePickers";
import { PinNamePicker } from "@/components/library/PinNamePicker";

export function PinoutEditorPanel() {
  const vehicleId = useAppStore((s) => s.selectedVehicleId);
  const revisionId = useAppStore((s) => s.selectedRevisionId);
  const selectedNodeKind = useAppStore((s) => s.selectedNodeKind);
  const focusId = useAppStore((s) => s.focusId);

  const connectorId =
    selectedNodeKind === "connector" || selectedNodeKind === "panelMount" || selectedNodeKind === "group"
      ? focusId
      : null;

  const [showModal, setShowModal] = useState(false);

  if (!vehicleId || !revisionId) return null;

  return (
    <>
      <div className="mt-4 border-t border-tesla-border pt-4">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-tesla-muted">
          Connector pinout
        </h3>
        {!connectorId ? (
          <p className="text-sm text-tesla-muted">
            Select any connector (inline, panel mount, or node connector) to edit its pinout.
          </p>
        ) : (
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="w-full rounded-md border border-tesla-border px-3 py-2 text-sm text-tesla-muted transition hover:border-tesla-accent hover:text-tesla-text"
          >
            Edit pinout
          </button>
        )}
      </div>
      {connectorId && (
        <PinoutEditorModal
          open={showModal}
          connectorId={connectorId}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}

function PinoutEditorModal({
  open,
  connectorId,
  onClose,
}: {
  open: boolean;
  connectorId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const vehicleId = useAppStore((s) => s.selectedVehicleId);
  const revisionId = useAppStore((s) => s.selectedRevisionId);
  const setShowNetManager = useAppStore((s) => s.setShowNetManager);
  const setShowPinNameLibrary = useAppStore((s) => s.setShowPinNameLibrary);

  const [draftNetAssignments, setDraftNetAssignments] = useState<Record<string, string>>({});
  const [draftNames, setDraftNames] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);

  const { data: nets = [] } = useQuery({
    queryKey: ["nets", vehicleId, revisionId],
    queryFn: () => fetchNets(vehicleId!, revisionId!),
    enabled: Boolean(open && vehicleId && revisionId),
  });

  const { data: pinNameLibrary = [] } = useQuery({
    queryKey: ["pin-name-library", vehicleId],
    queryFn: () => fetchPinNameLibrary(vehicleId!),
    enabled: Boolean(open && vehicleId),
  });

  const { data: pins = [], isLoading } = useQuery({
    queryKey: ["pins", vehicleId, revisionId, connectorId],
    queryFn: () =>
      fetchPins(vehicleId!, revisionId!, {
        connector_instance_id: connectorId,
      }),
    enabled: Boolean(open && vehicleId && revisionId && connectorId),
  });

  useEffect(() => {
    if (!open) return;
    setDraftNetAssignments({});
    setDraftNames({});
    setMessage(null);
  }, [open, connectorId]);

  const sortedPins = useMemo(
    () => [...pins].sort((a, b) => a.pin_number - b.pin_number),
    [pins],
  );

  const connectorLabel = sortedPins[0]?.connector_label ?? "Connector";

  const hasChanges = useMemo(
    () =>
      sortedPins.some((pin) => {
        const netValue = draftNetAssignments[pin.pin_id] ?? pin.primary_net_id ?? "__unassigned__";
        const netChanged = netValue !== (pin.primary_net_id ?? "__unassigned__");
        const name = (draftNames[pin.pin_id] ?? pin.pin_name).trim();
        return netChanged || name !== pin.pin_name;
      }),
    [sortedPins, draftNetAssignments, draftNames],
  );

  const saveAll = useMutation({
    mutationFn: async () => {
      const tasks: Promise<unknown>[] = [];
      for (const pin of sortedPins) {
        const netValue = draftNetAssignments[pin.pin_id] ?? pin.primary_net_id ?? "__unassigned__";
        if (netValue !== (pin.primary_net_id ?? "__unassigned__")) {
          tasks.push(
            assignPinNet(
              vehicleId!,
              revisionId!,
              pin.pin_id,
              netValue === "__unassigned__" ? null : netValue,
            ),
          );
        }
        const name = (draftNames[pin.pin_id] ?? pin.pin_name).trim();
        if (name && name !== pin.pin_name) {
          tasks.push(updateConnectorPin(vehicleId!, revisionId!, connectorId, pin.pin_id, { name }));
        }
      }
      await Promise.all(tasks);
    },
    onSuccess: async () => {
      setMessage("Pinout saved.");
      setDraftNetAssignments({});
      setDraftNames({});
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["pins"] }),
        queryClient.invalidateQueries({ queryKey: ["design-projection"] }),
        queryClient.invalidateQueries({ queryKey: ["nets"] }),
        queryClient.invalidateQueries({ queryKey: ["net-detail"] }),
        queryClient.invalidateQueries({ queryKey: ["connection-table"] }),
      ]);
    },
    onError: (error) => {
      setMessage(
        error instanceof ApiError ? `Failed to save pinout (${error.status}).` : "Failed to save pinout.",
      );
    },
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 panel-fade-in">
      <div className="flex h-[min(720px,92vh)] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-tesla-border bg-tesla-surface shadow-2xl">
        <header className="flex items-center justify-between border-b border-tesla-border px-4 py-3">
          <div>
            <h2 className="text-lg font-semibold">Edit pinout</h2>
            <p className="text-xs text-tesla-muted">{connectorLabel}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-1 text-tesla-muted transition hover:bg-tesla-border hover:text-tesla-text"
          >
            ✕
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-auto p-4">
          {isLoading && <p className="text-sm text-tesla-muted">Loading pins…</p>}
          {!isLoading && sortedPins.length === 0 && (
            <p className="text-sm text-tesla-muted">No pins found on this connector.</p>
          )}
          {sortedPins.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-tesla-border text-left text-xs uppercase tracking-wider text-tesla-muted">
                  <th className="w-16 pb-2 pr-3 font-medium">Pin</th>
                  <th className="pb-2 pr-3 font-medium">Name</th>
                  <th className="pb-2 font-medium">Net</th>
                </tr>
              </thead>
              <tbody>
                {sortedPins.map((pin) => {
                  const netValue = draftNetAssignments[pin.pin_id] ?? pin.primary_net_id ?? "__unassigned__";
                  return (
                    <tr key={pin.pin_id} className="border-b border-tesla-border/50">
                      <td className="py-2 pr-3 text-tesla-muted">{pin.pin_number}</td>
                      <td className="py-2 pr-3">
                        <PinNamePicker
                          value={draftNames[pin.pin_id] ?? pin.pin_name}
                          onChange={(name) =>
                            setDraftNames((prev) => ({ ...prev, [pin.pin_id]: name }))
                          }
                          entries={pinNameLibrary}
                          onManageLibrary={() => setShowPinNameLibrary(true)}
                        />
                      </td>
                      <td className="py-2">
                        <InstancePicker
                          label=""
                          instances={[
                            { id: "__unassigned__", label: "Unassigned net" },
                            ...nets.map((net) => ({ id: net.id, label: net.name })),
                          ]}
                          value={netValue}
                          onChange={(nextId) => {
                            setDraftNetAssignments((prev) => ({ ...prev, [pin.pin_id]: nextId }));
                            setMessage(null);
                          }}
                          placeholder="Select net…"
                          addActionLabel="Add net"
                          onAddAction={() => setShowNetManager(true)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <footer className="flex items-center justify-between border-t border-tesla-border px-4 py-3">
          {message ? <p className="text-xs text-tesla-muted">{message}</p> : <span />}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-tesla-border px-3 py-1.5 text-sm text-tesla-muted transition hover:border-tesla-accent hover:text-tesla-text"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!hasChanges || saveAll.isPending || sortedPins.length === 0}
              onClick={() => saveAll.mutate()}
              className="rounded bg-tesla-accent px-3 py-1.5 text-sm text-white transition hover:bg-tesla-accent/90 disabled:opacity-40"
            >
              {saveAll.isPending ? "Saving…" : "Save pinout"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
