import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { fetchNets, fetchPins, pairPins, type NetPinInfo } from "@/api/nets";
import { useAutoDismiss } from "@/hooks/useAutoDismiss";
import { useAppStore } from "@/stores/appStore";
import { useRevisionSyncStore } from "@/stores/revisionSyncStore";

export function PinPairingPanel() {
  const queryClient = useQueryClient();
  const vehicleId = useAppStore((s) => s.selectedVehicleId);
  const revisionId = useAppStore((s) => s.selectedRevisionId);
  const wireMode = useAppStore((s) => s.wireMode);
  const pairingPinAId = useAppStore((s) => s.pairingPinAId);
  const setPairingPinA = useAppStore((s) => s.setPairingPinA);
  const clearPairing = useAppStore((s) => s.clearPairing);
  const editSequence = useRevisionSyncStore((s) => s.editSequence);
  const focusId = useAppStore((s) => s.focusId);
  const selectedNodeKind = useAppStore((s) => s.selectedNodeKind);

  const connectorId =
    selectedNodeKind === "connector" ||
    selectedNodeKind === "inlineConnector" ||
    selectedNodeKind === "panelMount"
      ? focusId
      : null;

  const [netMode, setNetMode] = useState<"existing" | "new">("existing");
  const [selectedNetId, setSelectedNetId] = useState("");
  const [newNetName, setNewNetName] = useState("");
  const [wireColor, setWireColor] = useState("");
  const [pairError, setPairError] = useState<string | null>(null);
  const clearPairError = useCallback(() => setPairError(null), []);
  useAutoDismiss(pairError, clearPairError);

  const { data: pins = [] } = useQuery({
    queryKey: ["pins", vehicleId, revisionId, connectorId],
    queryFn: () =>
      fetchPins(vehicleId!, revisionId!, {
        connector_instance_id: connectorId ?? undefined,
      }),
    enabled: Boolean(vehicleId && revisionId && wireMode),
  });

  const { data: nets = [] } = useQuery({
    queryKey: ["nets", vehicleId, revisionId],
    queryFn: () => fetchNets(vehicleId!, revisionId!),
    enabled: Boolean(vehicleId && revisionId && wireMode),
  });

  const pairMutation = useMutation({
    mutationFn: (pinBId: string) =>
      pairPins(vehicleId!, revisionId!, {
        pin_a_id: pairingPinAId!,
        pin_b_id: pinBId,
        net_id: netMode === "existing" ? selectedNetId : undefined,
        net_name: netMode === "new" ? newNetName.trim() : undefined,
        wire_color: wireColor || undefined,
        create_edge: true,
        expected_edit_sequence: editSequence,
      }),
    onSuccess: () => {
      clearPairing();
      setPairError(null);
      queryClient.invalidateQueries({ queryKey: ["nets"] });
      queryClient.invalidateQueries({ queryKey: ["pins"] });
      queryClient.invalidateQueries({ queryKey: ["design-projection"] });
      queryClient.invalidateQueries({ queryKey: ["topology-summary"] });
    },
    onError: (error) => {
      setPairError(error instanceof Error ? error.message : "Failed to pair pins.");
    },
  });

  if (!wireMode || !vehicleId || !revisionId) return null;

  const pinA = pins.find((p) => p.pin_id === pairingPinAId);

  return (
    <div className="mt-4 border-t border-tesla-border pt-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-medium uppercase tracking-wider text-tesla-muted">
          Wire / net pairing
        </h3>
        {pairingPinAId && (
          <button type="button" onClick={clearPairing} className="text-xs text-tesla-accent">
            Clear
          </button>
        )}
      </div>
      <p className="mb-2 text-xs text-tesla-muted">
        Wire mode: click pin A, then pin B on the graph or list to create a harness wire.
      </p>
      {pairError && <p className="mb-2 text-xs text-amber-200">{pairError}</p>}

      {!connectorId && (
        <p className="text-sm text-tesla-muted">
          Select a connector in the tree, or open connector view on the graph.
        </p>
      )}

      {connectorId && (
        <>
          <p className="mb-2 text-xs text-tesla-muted">
            {pairingPinAId
              ? "Click a second pin to pair, or pick below."
              : "Click a pin to start pairing."}
          </p>

          {pairingPinAId && pinA && (
            <div className="mb-3 rounded border border-tesla-accent/30 bg-tesla-accent/5 px-2 py-1.5 text-sm">
              Pin A: <strong>{pinA.pin_name}</strong>
              {pinA.primary_net_name && (
                <span className="text-tesla-muted"> ({pinA.primary_net_name})</span>
              )}
            </div>
          )}

          {pairingPinAId && (
            <div className="mb-3 space-y-2">
              <div className="flex gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setNetMode("existing")}
                  className={clsx(
                    "rounded px-2 py-1",
                    netMode === "existing" ? "bg-tesla-accent text-white" : "text-tesla-muted",
                  )}
                >
                  Existing net
                </button>
                <button
                  type="button"
                  onClick={() => setNetMode("new")}
                  className={clsx(
                    "rounded px-2 py-1",
                    netMode === "new" ? "bg-tesla-accent text-white" : "text-tesla-muted",
                  )}
                >
                  New net
                </button>
              </div>
              {netMode === "existing" ? (
                <select
                  value={selectedNetId}
                  onChange={(e) => setSelectedNetId(e.target.value)}
                  className="w-full rounded border border-tesla-border bg-tesla-bg px-2 py-1 text-sm"
                >
                  <option value="">Auto (origin.conn.pin → dest.conn.pin)</option>
                  {nets.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.name} ({n.pin_count})
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={newNetName}
                  onChange={(e) => setNewNetName(e.target.value)}
                  placeholder="Net name"
                  className="w-full rounded border border-tesla-border bg-tesla-bg px-2 py-1 text-sm"
                />
              )}
              <input
                value={wireColor}
                onChange={(e) => setWireColor(e.target.value)}
                placeholder="Wire color (optional)"
                className="w-full rounded border border-tesla-border bg-tesla-bg px-2 py-1 text-sm"
              />
            </div>
          )}

          <ul className="max-h-48 space-y-0.5 overflow-y-auto">
            {pins.map((pin) => (
              <PinRow
                key={pin.pin_id}
                pin={pin}
                isA={pin.pin_id === pairingPinAId}
                disabled={pairMutation.isPending}
                onSelect={() => {
                  if (!pairingPinAId) {
                    setPairingPinA(pin.pin_id);
                  } else if (pin.pin_id !== pairingPinAId) {
                    if (netMode === "new" && !newNetName.trim()) {
                      return;
                    }
                    pairMutation.mutate(pin.pin_id);
                  }
                }}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function PinRow({
  pin,
  isA,
  disabled,
  onSelect,
}: {
  pin: NetPinInfo;
  isA: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  const isDefaultName = pin.pin_name.trim() === String(pin.pin_number);
  return (
    <li>
      <button
        type="button"
        disabled={disabled}
        onClick={onSelect}
        className={clsx(
          "flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm transition",
          isA ? "bg-tesla-accent/20 text-tesla-text" : "hover:bg-tesla-border/50",
        )}
      >
        <span>
          {pin.pin_number}:{" "}
          <span className={isDefaultName ? "text-tesla-muted" : ""}>{pin.pin_name}</span>
        </span>
        <span className="truncate pl-2 text-xs text-tesla-muted">
          {pin.primary_net_name ?? "—"}
        </span>
      </button>
    </li>
  );
}
