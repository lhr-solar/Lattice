import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { fetchDesignProjection } from "@/api/projections";
import { pairPins } from "@/api/nets";
import { ApiError } from "@/api/client";
import { useAppStore } from "@/stores/appStore";

export function TopologyCanvas() {
  const vehicleId = useAppStore((s) => s.selectedVehicleId);
  const revisionId = useAppStore((s) => s.selectedRevisionId);
  const level = useAppStore((s) => s.projectionLevel);
  const focusId = useAppStore((s) => s.focusId);
  const setFocus = useAppStore((s) => s.setFocus);
  const setProjectionLevel = useAppStore((s) => s.setProjectionLevel);
  const wireMode = useAppStore((s) => s.wireMode);
  const pairingPinAId = useAppStore((s) => s.pairingPinAId);
  const setPairingPinA = useAppStore((s) => s.setPairingPinA);
  const clearPairing = useAppStore((s) => s.clearPairing);
  const queryClient = useQueryClient();
  const [collapsedContainerIds, setCollapsedContainerIds] = useState<Set<string>>(new Set());

  const quickPairMutation = useMutation({
    mutationFn: ({ pinAId, pinBId }: { pinAId: string; pinBId: string }) =>
      pairPins(vehicleId!, revisionId!, {
        pin_a_id: pinAId,
        pin_b_id: pinBId,
        create_edge: true,
      }),
    onSuccess: () => {
      clearPairing();
      queryClient.invalidateQueries({ queryKey: ["nets"] });
      queryClient.invalidateQueries({ queryKey: ["pins"] });
      queryClient.invalidateQueries({ queryKey: ["design-projection"] });
      queryClient.invalidateQueries({ queryKey: ["topology-summary"] });
    },
  });

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["design-projection", vehicleId, revisionId, level, focusId],
    queryFn: () =>
      fetchDesignProjection(vehicleId!, revisionId!, level, focusId ?? undefined),
    enabled: Boolean(vehicleId && revisionId),
  });

  useEffect(() => {
    if (!error) return;
    if (error instanceof ApiError && (error.status === 404 || error.status === 422)) {
      setFocus(null);
      setProjectionLevel("vehicle");
    }
  }, [error, setFocus, setProjectionLevel]);

  const nodes: Node[] = useMemo(() => {
    const allNodes = data?.nodes ?? [];
    const childrenByParent = new Map<string, string[]>();
    for (const n of allNodes) {
      if (!n.parent_id) continue;
      const children = childrenByParent.get(n.parent_id) ?? [];
      children.push(n.id);
      childrenByParent.set(n.parent_id, children);
    }
    const hidden = new Set<string>();
    const queue = [...collapsedContainerIds];
    while (queue.length) {
      const current = queue.shift()!;
      const kids = childrenByParent.get(current) ?? [];
      for (const kid of kids) {
        if (hidden.has(kid)) continue;
        hidden.add(kid);
        queue.push(kid);
      }
    }
    return allNodes
      .filter((n) => !hidden.has(n.id))
      .map((n, i) => {
        const isContainer = n.kind === "vehicleRoot" || n.kind.endsWith("Container");
        const isCollapsed = collapsedContainerIds.has(n.id);
        const childCount = childrenByParent.get(n.id)?.length ?? 0;
        const label = isContainer
          ? `${n.label} ${isCollapsed ? `[+]` : "[-]"}${childCount ? ` (${childCount})` : ""}`
          : n.label;
        return {
          id: n.id,
          position: n.position ?? { x: 120 + i * 180, y: 120 + (i % 3) * 80 },
          parentId: n.parent_id ?? undefined,
          extent: n.parent_id ? ("parent" as const) : undefined,
          data: { label, ...n.data, isContainer },
          type: isContainer ? "group" : "default",
          style: {
            background: isContainer ? "rgba(20,20,20,0.7)" : "#141414",
            border: isContainer ? "1px solid #3a3a3a" : "1px solid #2a2a2a",
            color: "#e8e8e8",
            borderRadius: 8,
            fontSize: 12,
            padding: 8,
            width:
              n.kind === "vehicleRoot"
                ? 1400
                : n.kind === "enclosureContainer"
                  ? 420
                  : n.kind === "pcbContainer"
                    ? 360
                    : undefined,
            height:
              n.kind === "vehicleRoot"
                ? 900
                : n.kind === "enclosureContainer"
                  ? 560
                  : n.kind === "pcbContainer"
                    ? 180
                    : undefined,
            opacity:
              typeof n.data?.isDefaultName === "boolean" && n.data.isDefaultName ? 0.72 : 1,
          },
        };
      });
  }, [data, collapsedContainerIds]);

  const edges: Edge[] = useMemo(
    () =>
      (data?.edges ?? []).map((e) => {
        const isShort = e.kind === "short" || e.data?.short;
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          label: e.label ?? undefined,
          style: {
            stroke: isShort ? "#f59e0b" : "#6b6b6b",
            strokeDasharray: isShort ? "6 4" : undefined,
            strokeWidth: isShort ? 2 : 1,
          },
          animated: e.kind === "bus",
        };
      }),
    [data],
  );

  if (!vehicleId) {
    return (
      <div className="flex h-full items-center justify-center text-tesla-muted">
        Select or create a vehicle to view topology
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-tesla-muted">
        Loading graph projection…
      </div>
    );
  }

  if (isError) {
    const errorMessage =
      error instanceof ApiError
        ? `Failed to load projection (${error.status})`
        : "Failed to load projection";
    return (
      <div className="flex h-full items-center justify-center text-tesla-accent">
        {errorMessage}
      </div>
    );
  }

  return (
    <div className="h-full w-full">
      {wireMode && (
        <div className="pointer-events-none absolute left-3 top-3 z-10 rounded border border-tesla-accent/40 bg-tesla-bg/90 px-2 py-1 text-xs text-tesla-muted">
          Wire mode: {pairingPinAId ? "pick pin B to finish wire" : "pick pin A"}
        </div>
      )}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        colorMode="dark"
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_, node) => {
          if (
            node.id === "vehicle:root" ||
            node.id.startsWith("enclosure:") ||
            node.id.startsWith("pcb:")
          ) {
            setCollapsedContainerIds((prev) => {
              const next = new Set(prev);
              if (next.has(node.id)) {
                next.delete(node.id);
              } else {
                next.add(node.id);
              }
              return next;
            });
          }
          if (wireMode && node.id.startsWith("pin:")) {
            const pinId = node.id.replace("pin:", "");
            if (!pairingPinAId) {
              setPairingPinA(pinId);
            } else if (pairingPinAId !== pinId && !quickPairMutation.isPending) {
              quickPairMutation.mutate({ pinAId: pairingPinAId, pinBId: pinId });
            }
            return;
          }
          if (node.id === "vehicle:root" || node.id.startsWith("vehicle:")) {
            setProjectionLevel("vehicle");
            setFocus(null);
            return;
          }
          if (node.id.startsWith("boundary-connector:")) {
            setProjectionLevel("connector");
            setFocus(node.id.replace("boundary-connector:", ""), "connector");
            return;
          }
          if (node.id.startsWith("enclosure:")) {
            setProjectionLevel("enclosure");
            setFocus(node.id.replace("enclosure:", ""), "enclosure");
          } else if (node.id.startsWith("connector:")) {
            setProjectionLevel("connector");
            setFocus(node.id.replace("connector:", ""), "connector");
          } else if (node.id.startsWith("pin:")) {
            setProjectionLevel("pin");
            setFocus(node.id.replace("pin:", ""), "pin");
          }
        }}
      >
        <Background gap={20} color="#1f1f1f" />
        <Controls />
        <MiniMap nodeColor="#2a2a2a" maskColor="rgba(10,10,10,0.8)" />
      </ReactFlow>
    </div>
  );
}
