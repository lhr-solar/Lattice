import { useEffect, useMemo, useState, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { fetchDesignProjection } from "@/api/projections";
import { pairPins } from "@/api/nets";
import { disconnectEdge } from "@/api/connections";
import { deletePinShort } from "@/api/shorts";
import { ApiError } from "@/api/client";
import type { DesignNodeDto } from "@/api/types";
import { useAutoDismiss } from "@/hooks/useAutoDismiss";
import { handleMutationError } from "@/lib/mutationErrors";
import { invalidateRevisionDomains } from "@/lib/revisionInvalidation";
import { useAppStore } from "@/stores/appStore";
import { useRevisionSyncStore } from "@/stores/revisionSyncStore";
import { CONTAINER_KINDS, nodeTypes } from "./nodes";
import { edgeTypes } from "./edges/DeletableEdge";
import { SelectionInfoBox } from "@/components/shell/SelectionInfoBox";
import {
  CONTAINER_PAD_X,
  FLOW_ORIGIN_X,
  FLOW_ORIGIN_Y,
  GROUP_HEADER_H,
  GROUP_WIDTH,
  measureContainer,
  PIN_INNER_PAD,
  PIN_PORT_H,
  PIN_PORT_WIDTH,
  PIN_ROW_H,
  reflowContainerColumns,
} from "./graphLayout";

/** Build React Flow nodes from the backend projection, computing the nested
 *  layout (containers -> connector groups -> pin ports) on the frontend so pin
 *  connection points line up on the right edge of every box. */
function buildNodes(dto: DesignNodeDto[]): Node[] {
  const containers = dto.filter((n) => CONTAINER_KINDS.has(n.kind));
  const groupsByParent = new Map<string, DesignNodeDto[]>();
  const portsByParent = new Map<string, DesignNodeDto[]>();
  for (const n of dto) {
    if (n.kind === "connectorGroup" && n.parent_id) {
      let arr = groupsByParent.get(n.parent_id);
      if (!arr) {
        arr = [];
        groupsByParent.set(n.parent_id, arr);
      }
      arr.push(n);
    } else if (n.kind === "pinPort" && n.parent_id) {
      let arr = portsByParent.get(n.parent_id);
      if (!arr) {
        arr = [];
        portsByParent.set(n.parent_id, arr);
      }
      arr.push(n);
    }
  }

  const out: Node[] = [];

  const containerPlans = containers.map((container) => {
    const groups = groupsByParent.get(container.id) ?? [];
    const { groupLayouts, containerWidth, containerHeight } = measureContainer(
      container,
      groups,
      portsByParent,
    );
    return {
      container,
      groupLayouts,
      containerWidth,
      containerHeight,
      position: { x: FLOW_ORIGIN_X, y: FLOW_ORIGIN_Y },
    };
  });

  reflowContainerColumns(containerPlans);

  for (const plan of containerPlans) {
    const { container, groupLayouts, containerWidth, containerHeight, position } = plan;

    out.push({
      id: container.id,
      type: container.kind,
      position,
      data: { label: container.label, ...container.data },
      style: { width: containerWidth, height: containerHeight, pointerEvents: "none" },
      draggable: true,
    });

    for (const gl of groupLayouts) {
      out.push({
        id: gl.group.id,
        type: "connectorGroup",
        parentId: container.id,
        extent: "parent",
        position: { x: CONTAINER_PAD_X, y: gl.y },
        data: { label: gl.group.label, ...gl.group.data },
        style: { width: GROUP_WIDTH, height: gl.height, pointerEvents: "none" },
        draggable: false,
        selectable: false,
      });
      gl.ports.forEach((port, i) => {
        out.push({
          id: port.id,
          type: "pinPort",
          parentId: gl.group.id,
          extent: "parent",
          position: { x: PIN_INNER_PAD, y: GROUP_HEADER_H + i * PIN_ROW_H },
          data: { label: port.label, ...port.data },
          style: { width: PIN_PORT_WIDTH, height: PIN_PORT_H, pointerEvents: "all" },
          draggable: false,
        });
      });
    }
  }

  // Leaf-level standalone nodes (connector + pin views).
  dto.forEach((n, i) => {
    if (n.kind !== "connectorPinBox" && n.kind !== "pin") return;
    out.push({
      id: n.id,
      type: n.kind,
      position: n.position ?? { x: 120, y: 80 + i * 72 },
      data: { label: n.label, ...n.data },
      style: { width: n.kind === "connectorPinBox" ? 240 : 200, height: n.kind === "connectorPinBox" ? 56 : 40 },
    });
  });

  return out;
}

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
  const editSequence = useRevisionSyncStore((s) => s.editSequence);
  const syncStatus = useRevisionSyncStore((s) => s.syncStatus);
  const queryClient = useQueryClient();
  const [wireError, setWireError] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [pendingDeleteEdgeIds, setPendingDeleteEdgeIds] = useState<Set<string>>(new Set());
  const clearWireError = useCallback(() => setWireError(null), []);
  useAutoDismiss(wireError, clearWireError);

  function invalidateWiring() {
    invalidateRevisionDomains(queryClient, [
      "nets",
      "pins",
      "design-projection",
      "topology-summary",
      "connection-table",
      "shorts",
    ]);
  }
  const shouldFallbackInvalidate = syncStatus !== "connected";

  const quickPairMutation = useMutation({
    mutationFn: ({ pinAId, pinBId }: { pinAId: string; pinBId: string }) =>
      pairPins(vehicleId!, revisionId!, {
        pin_a_id: pinAId,
        pin_b_id: pinBId,
        create_edge: true,
        expected_edit_sequence: editSequence,
      }),
    onSuccess: () => {
      clearPairing();
      setWireError(null);
      if (shouldFallbackInvalidate) {
        invalidateWiring();
      }
    },
    onError: (error) => setWireError(handleMutationError(error, "Failed to create wire.")),
  });

  const deleteWireMutation = useMutation({
    mutationFn: (edgeId: string) => disconnectEdge(vehicleId!, revisionId!, edgeId, editSequence),
    onMutate: (edgeId) => {
      setPendingDeleteEdgeIds((prev) => new Set(prev).add(edgeId));
    },
    onSuccess: () => {
      setWireError(null);
      if (shouldFallbackInvalidate) {
        invalidateWiring();
      }
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 404) {
        // Another user already deleted this edge. Sync UI and suppress the error.
        setWireError(null);
        if (shouldFallbackInvalidate) {
          invalidateWiring();
        }
        return;
      }
      setWireError(handleMutationError(error, "Failed to remove wire."));
    },
    onSettled: (_data, _error, edgeId) => {
      setPendingDeleteEdgeIds((prev) => {
        const next = new Set(prev);
        next.delete(edgeId);
        return next;
      });
    },
  });

  const deleteShortMutation = useMutation({
    mutationFn: ({
      edgeId: _edgeId,
      connectorId,
      shortId,
    }: {
      edgeId: string;
      connectorId: string;
      shortId: string;
    }) =>
      deletePinShort(vehicleId!, revisionId!, connectorId, shortId, editSequence),
    onMutate: ({ edgeId }) => {
      setPendingDeleteEdgeIds((prev) => new Set(prev).add(edgeId));
    },
    onSuccess: () => {
      setWireError(null);
      if (shouldFallbackInvalidate) {
        invalidateWiring();
      }
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 404) {
        setWireError(null);
        if (shouldFallbackInvalidate) {
          invalidateWiring();
        }
        return;
      }
      setWireError(handleMutationError(error, "Failed to remove short."));
    },
    onSettled: (_data, _error, vars) => {
      setPendingDeleteEdgeIds((prev) => {
        const next = new Set(prev);
        next.delete(vars.edgeId);
        return next;
      });
    },
  });

  const deleteEdge = useCallback(
    (edge: Pick<Edge, "id" | "data">) => {
      if (pendingDeleteEdgeIds.has(edge.id)) return;
      setSelectedEdgeId(null);
      const isShort = edge.data?.short === true || edge.id.startsWith("short:");
      const connectorId = String(edge.data?.connectorInstanceId ?? "");
      const shortId = String(edge.data?.shortId ?? edge.id.replace("short:", ""));
      if (isShort) {
        if (connectorId) deleteShortMutation.mutate({ edgeId: edge.id, connectorId, shortId });
        return;
      }
      deleteWireMutation.mutate(edge.id);
    },
    [deleteShortMutation, deleteWireMutation, pendingDeleteEdgeIds],
  );

  const selectEdge = useCallback((edgeId: string) => {
    setSelectedEdgeId(edgeId);
  }, []);

  const onEdgesDelete = useCallback(
    (deleted: Edge[]) => {
      for (const edge of deleted) deleteEdge(edge);
    },
    [deleteEdge],
  );

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["design-projection", vehicleId, revisionId, level, focusId],
    queryFn: () =>
      fetchDesignProjection(vehicleId!, revisionId!, level, focusId ?? undefined),
    enabled: Boolean(vehicleId && revisionId),
  });

  useEffect(() => {
    setSelectedEdgeId(null);
  }, [vehicleId, revisionId, level, focusId]);

  useEffect(() => {
    if (!error) return;
    if (error instanceof ApiError && (error.status === 404 || error.status === 422)) {
      setFocus(null);
      setProjectionLevel("vehicle");
    }
  }, [error, setFocus, setProjectionLevel]);

  const nodes: Node[] = useMemo(() => buildNodes(data?.nodes ?? []), [data]);

  const edges: Edge[] = useMemo(
    () =>
      (data?.edges ?? []).map((e) => {
        const isShort = e.kind === "short" || e.data?.short;
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          type: "deletable",
          label: e.label ?? undefined,
          selected: selectedEdgeId === e.id,
          data: {
            ...e.data,
            onSelect: () => selectEdge(e.id),
            onDelete: () => deleteEdge({ id: e.id, data: e.data }),
            isDeleting: pendingDeleteEdgeIds.has(e.id),
          },
          style: {
            stroke: isShort ? "#f59e0b" : "#6b6b6b",
            strokeDasharray: isShort ? "6 4" : undefined,
            strokeWidth: selectedEdgeId === e.id ? 2.5 : isShort ? 2 : 1.5,
          },
          animated: e.kind === "bus",
          selectable: true,
          focusable: true,
          interactionWidth: 8,
        };
      }),
    [data, deleteEdge, pendingDeleteEdgeIds, selectEdge, selectedEdgeId],
  );

  function tryPair(pinAId: string, pinBId: string) {
    if (pinAId === pinBId || quickPairMutation.isPending) return;
    quickPairMutation.mutate({ pinAId, pinBId });
  }

  function onConnect(conn: Connection) {
    if (!conn.source || !conn.target) return;
    if (!conn.source.startsWith("port:") || !conn.target.startsWith("port:")) return;
    tryPair(conn.source.replace("port:", ""), conn.target.replace("port:", ""));
  }

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

  const edgeCount = data?.edges?.length ?? 0;

  return (
    <div className="absolute inset-0">
      <div className="absolute right-3 top-3 z-10">
        <SelectionInfoBox />
      </div>
      {wireMode ? (
        <div className="pointer-events-none absolute left-3 top-3 z-10 max-w-md rounded border border-tesla-accent/40 bg-tesla-bg/90 px-2 py-1 text-xs text-tesla-muted">
          Wire mode: {pairingPinAId ? "pick pin B (or drag) to finish" : "pick pin A or drag between pins"}
          {edgeCount > 0 && " · click a wire, then × or Delete to remove"}
        </div>
      ) : (
        edgeCount > 0 && (
          <div className="pointer-events-none absolute left-3 top-3 z-10 rounded border border-tesla-border bg-tesla-bg/90 px-2 py-1 text-xs text-tesla-muted">
            Click a wire to select · × or Delete to remove
          </div>
        )
      )}
      {wireError && (
        <div className="absolute left-3 top-12 z-10 max-w-sm rounded border border-amber-500/40 bg-tesla-bg/95 px-2 py-1 text-xs text-amber-100">
          {wireError}
        </div>
      )}
      <ReactFlow
        className="h-full w-full"
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        colorMode="dark"
        deleteKeyCode={["Backspace", "Delete"]}
        onEdgesDelete={onEdgesDelete}
        elevateEdgesOnSelect
        defaultEdgeOptions={{ selectable: true, focusable: true, interactionWidth: 8 }}
        proOptions={{ hideAttribution: true }}
        onConnect={onConnect}
        onEdgeClick={(_, edge) => selectEdge(edge.id)}
        onPaneClick={() => setSelectedEdgeId(null)}
        onNodeClick={(_, node) => {
          setSelectedEdgeId(null);
          if (wireMode && node.id.startsWith("port:")) {
            const pinId = node.id.replace("port:", "");
            if (!pairingPinAId) {
              setPairingPinA(pinId);
            } else if (pairingPinAId !== pinId) {
              tryPair(pairingPinAId, pinId);
            }
            return;
          }
          if (node.id === "vehicle:root" || node.id.startsWith("vehicle:")) {
            setProjectionLevel("vehicle");
            setFocus(null);
            return;
          }
          if (node.id.startsWith("group:")) {
            const connectorId = String(node.data?.connectorInstanceId ?? "");
            if (!connectorId) return;
            setProjectionLevel("connector");
            setFocus(connectorId, "group");
            return;
          }
          if (node.id.startsWith("boundary-connector:")) {
            setProjectionLevel("connector");
            setFocus(node.id.replace("boundary-connector:", ""), "connector");
            return;
          }
          if (node.id.startsWith("node:")) {
            setProjectionLevel("node");
            setFocus(node.id.replace("node:", ""), "node");
            return;
          }
          if (node.id.startsWith("inline:")) {
            setProjectionLevel("connector");
            setFocus(node.id.replace("inline:", ""), "inlineConnector");
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
        <Controls position="bottom-left" />
        <MiniMap position="bottom-right" nodeColor="#2a2a2a" maskColor="rgba(10,10,10,0.8)" />
      </ReactFlow>
    </div>
  );
}
