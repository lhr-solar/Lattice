import { useEffect, useMemo } from "react";
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

  const nodes: Node[] = useMemo(
    () =>
      (data?.nodes ?? []).map((n, i) => ({
        id: n.id,
        position: n.position ?? { x: 120 + i * 180, y: 120 + (i % 3) * 80 },
        data: { label: n.label, ...n.data },
        type: n.kind === "vehicleRoot" ? "input" : "default",
        style: {
          background: "#141414",
          border: "1px solid #2a2a2a",
          color: "#e8e8e8",
          borderRadius: 8,
          fontSize: 12,
          padding: 8,
        },
      })),
    [data],
  );

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
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        colorMode="dark"
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_, node) => {
          if (wireMode && node.id.startsWith("pin:")) {
            const pinId = node.id.replace("pin:", "");
            if (!pairingPinAId) {
              setPairingPinA(pinId);
            }
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
