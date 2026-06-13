import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createPinShort, deletePinShort, fetchPinShorts } from "@/api/shorts";
import { fetchPins } from "@/api/nets";
import { useAppStore } from "@/stores/appStore";
import { useRevisionSyncStore } from "@/stores/revisionSyncStore";

export function PinShortPanel() {
  const queryClient = useQueryClient();
  const vehicleId = useAppStore((s) => s.selectedVehicleId);
  const revisionId = useAppStore((s) => s.selectedRevisionId);
  const focusId = useAppStore((s) => s.focusId);
  const selectedNodeKind = useAppStore((s) => s.selectedNodeKind);
  const wireMode = useAppStore((s) => s.wireMode);
  const editSequence = useRevisionSyncStore((s) => s.editSequence);

  const connectorId =
    selectedNodeKind === "connector" ||
    selectedNodeKind === "inlineConnector" ||
    selectedNodeKind === "panelMount"
      ? focusId
      : null;

  const [shortPinA, setShortPinA] = useState<string | null>(null);

  const { data: pins = [] } = useQuery({
    queryKey: ["pins", vehicleId, revisionId, connectorId],
    queryFn: () =>
      fetchPins(vehicleId!, revisionId!, { connector_instance_id: connectorId ?? undefined }),
    enabled: Boolean(vehicleId && revisionId && connectorId && wireMode),
  });

  const { data: shorts = [] } = useQuery({
    queryKey: ["shorts", vehicleId, revisionId, connectorId],
    queryFn: () => fetchPinShorts(vehicleId!, revisionId!, connectorId!),
    enabled: Boolean(vehicleId && revisionId && connectorId),
  });

  const shortMutation = useMutation({
    mutationFn: (pinBId: string) =>
      createPinShort(vehicleId!, revisionId!, connectorId!, shortPinA!, pinBId, editSequence),
    onSuccess: () => {
      setShortPinA(null);
      queryClient.invalidateQueries({ queryKey: ["shorts"] });
      queryClient.invalidateQueries({ queryKey: ["pins"] });
      queryClient.invalidateQueries({ queryKey: ["nets"] });
      queryClient.invalidateQueries({ queryKey: ["design-projection"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (shortId: string) =>
      deletePinShort(vehicleId!, revisionId!, connectorId!, shortId, editSequence),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shorts"] });
      queryClient.invalidateQueries({ queryKey: ["design-projection"] });
    },
  });

  if (!wireMode || !connectorId) return null;

  return (
    <div className="mt-4 border-t border-tesla-border pt-4">
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-tesla-muted">
        Pin shorts (internal continuity)
      </h3>
      <p className="mb-2 text-xs text-tesla-muted">
        Bond pins on this connector (e.g. CAN-H to CAN-H). Does not add a harness wire — shows as
        dashed &quot;short&quot; on the graph.
      </p>

      {shorts.length > 0 && (
        <ul className="mb-3 space-y-1 text-xs">
          {shorts.map((s) => {
            const pa = pins.find((p) => p.pin_id === s.pin_a_id);
            const pb = pins.find((p) => p.pin_id === s.pin_b_id);
            return (
              <li key={s.id} className="flex items-center justify-between rounded bg-tesla-bg px-2 py-1">
                <span>
                  {pa?.pin_name ?? "?"} ↔ {pb?.pin_name ?? "?"}
                </span>
                <button
                  type="button"
                  className="text-tesla-accent"
                  onClick={() => deleteMutation.mutate(s.id)}
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mb-1 text-xs text-tesla-muted">
        {shortPinA ? "Select second pin to short" : "Select first pin"}
      </p>
      <ul className="max-h-32 space-y-0.5 overflow-y-auto">
        {pins.map((pin) => (
          <li key={pin.pin_id}>
            <button
              type="button"
              onClick={() => {
                if (!shortPinA) setShortPinA(pin.pin_id);
                else if (shortPinA !== pin.pin_id) shortMutation.mutate(pin.pin_id);
              }}
              className={`w-full rounded px-2 py-1 text-left text-sm ${
                shortPinA === pin.pin_id ? "bg-tesla-accent/20" : "hover:bg-tesla-border/50"
              }`}
            >
              {pin.pin_number}: {pin.pin_name}
            </button>
          </li>
        ))}
      </ul>
      {shortPinA && (
        <button
          type="button"
          className="mt-2 text-xs text-tesla-accent"
          onClick={() => setShortPinA(null)}
        >
          Cancel short
        </button>
      )}
    </div>
  );
}
