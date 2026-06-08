import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/api/client";
import { fetchPins } from "@/api/nets";
import { updateConnectorPin } from "@/api/instances";
import { useAppStore } from "@/stores/appStore";

export function PinoutEditorPanel() {
  const queryClient = useQueryClient();
  const vehicleId = useAppStore((s) => s.selectedVehicleId);
  const revisionId = useAppStore((s) => s.selectedRevisionId);
  const selectedNodeKind = useAppStore((s) => s.selectedNodeKind);
  const focusId = useAppStore((s) => s.focusId);

  const connectorId =
    selectedNodeKind === "connector" || selectedNodeKind === "panelMount" ? focusId : null;

  const [draftNames, setDraftNames] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);

  const { data: pins = [], isLoading } = useQuery({
    queryKey: ["pins", vehicleId, revisionId, connectorId],
    queryFn: () =>
      fetchPins(vehicleId!, revisionId!, {
        connector_instance_id: connectorId ?? undefined,
      }),
    enabled: Boolean(vehicleId && revisionId && connectorId),
  });

  const savePin = useMutation({
    mutationFn: async ({ pinId, name }: { pinId: string; name: string }) =>
      updateConnectorPin(vehicleId!, revisionId!, connectorId!, pinId, { name }),
    onSuccess: async (_, { pinId }) => {
      setMessage("Pin name updated.");
      setDraftNames((prev) => {
        const next = { ...prev };
        delete next[pinId];
        return next;
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["pins"] }),
        queryClient.invalidateQueries({ queryKey: ["design-projection"] }),
        queryClient.invalidateQueries({ queryKey: ["nets"] }),
        queryClient.invalidateQueries({ queryKey: ["net-detail"] }),
      ]);
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        setMessage(`Failed to update pin name (${error.status}).`);
        return;
      }
      setMessage("Failed to update pin name.");
    },
  });

  const sortedPins = useMemo(
    () => [...pins].sort((a, b) => a.pin_number - b.pin_number),
    [pins],
  );

  if (!vehicleId || !revisionId) return null;

  return (
    <div className="mt-4 border-t border-tesla-border pt-4">
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-tesla-muted">
        Connector pinout
      </h3>
      {!connectorId && (
        <p className="text-sm text-tesla-muted">
          Select any connector (inline, panel mount, or PCB connector) to name its pins.
        </p>
      )}
      {connectorId && (
        <>
          <p className="mb-2 text-xs text-tesla-muted">
            Define real pin names first. Wire mode and auto net names use these values.
          </p>
          {isLoading && <p className="text-sm text-tesla-muted">Loading pins…</p>}
          {!isLoading && sortedPins.length === 0 && (
            <p className="text-sm text-tesla-muted">No pins found on this connector.</p>
          )}
          {sortedPins.length > 0 && (
            <ul className="max-h-56 space-y-1 overflow-y-auto">
              {sortedPins.map((pin) => {
                const value = draftNames[pin.pin_id] ?? pin.pin_name;
                const trimmed = value.trim();
                const changed = trimmed.length > 0 && trimmed !== pin.pin_name;
                const isDefaultName = pin.pin_name.trim() === String(pin.pin_number);
                return (
                  <li
                    key={pin.pin_id}
                    className="rounded border border-tesla-border/70 bg-tesla-bg/40 px-2 py-2"
                  >
                    <div className="mb-1 text-xs text-tesla-muted">Pin {pin.pin_number}</div>
                    <div className="flex gap-2">
                      <input
                        value={value}
                        onChange={(e) => {
                          setDraftNames((prev) => ({
                            ...prev,
                            [pin.pin_id]: e.target.value,
                          }));
                          setMessage(null);
                        }}
                        className={`min-w-0 flex-1 rounded border border-tesla-border bg-tesla-bg px-2 py-1 text-sm outline-none focus:border-tesla-accent ${
                          isDefaultName ? "text-tesla-muted" : "text-tesla-text"
                        }`}
                      />
                      <button
                        type="button"
                        disabled={!changed || savePin.isPending}
                        onClick={() => {
                          if (!changed) return;
                          savePin.mutate({ pinId: pin.pin_id, name: trimmed });
                        }}
                        className="rounded border border-tesla-border px-2 py-1 text-xs text-tesla-muted transition hover:border-tesla-accent hover:text-tesla-text disabled:opacity-40"
                      >
                        Save
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {message && <p className="mt-2 text-xs text-tesla-muted">{message}</p>}
        </>
      )}
    </div>
  );
}
