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
import clsx from "clsx";
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
import { CONTAINER_KINDS, nodeTypes } from "./nodes";
import { edgeTypes } from "./edges/DeletableEdge";

// Deterministic nested-layout constants (all px).
const PIN_ROW_H = 20;
const GROUP_HEADER_H = 26;
const GROUP_BOTTOM_PAD = 8;
const GROUP_WIDTH = 248;
const GROUP_GAP = 10;
const PIN_INNER_PAD = 8;
const PIN_PORT_WIDTH = GROUP_WIDTH - PIN_INNER_PAD * 2;
const PIN_PORT_H = PIN_ROW_H - 3;
const CONTAINER_PAD_X = 14;
const CONTAINER_TITLE_H = 42;
const CONTAINER_PAD_BOTTOM = 14;

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

  containers.forEach((container, idx) => {
    const groups = groupsByParent.get(container.id) ?? [];
    let cy = CONTAINER_TITLE_H;
    const groupLayouts = groups.map((group) => {
      const ports = portsByParent.get(group.id) ?? [];
      const height = GROUP_HEADER_H + Math.max(ports.length, 1) * PIN_ROW_H + GROUP_BOTTOM_PAD;
      const layout = { group, ports, y: cy, height };
      cy += height + GROUP_GAP;
      return layout;
    });
    const contentBottom = groups.length ? cy - GROUP_GAP : CONTAINER_TITLE_H + 24;
    const containerHeight = contentBottom + CONTAINER_PAD_BOTTOM;
    const containerWidth = CONTAINER_PAD_X * 2 + GROUP_WIDTH;
    const position = container.position ?? { x: 90 + idx * (containerWidth + 60), y: 80 };

    out.push({
      id: container.id,
      type: container.kind,
      position,
      data: { label: container.label, ...container.data },
      style: { width: containerWidth, height: containerHeight },
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
        style: { width: GROUP_WIDTH, height: gl.height },
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
          style: { width: PIN_PORT_WIDTH, height: PIN_PORT_H },
          draggable: false,
        });
      });
    }
  });

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
  const queryClient = useQueryClient();
  const [wireError, setWireError] = useState<string | null>(null);
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

  const quickPairMutation = useMutation({
    mutationFn: ({ pinAId, pinBId }: { pinAId: string; pinBId: string }) =>
      pairPins(vehicleId!, revisionId!, {
        pin_a_id: pinAId,
        pin_b_id: pinBId,
        create_edge: true,
      }),
    onSuccess: () => {
      clearPairing();
      setWireError(null);
      invalidateWiring();
    },
    onError: (error) => setWireError(handleMutationError(error, "Failed to create wire.")),
  });

  const deleteWireMutation = useMutation({
    mutationFn: (edgeId: string) => disconnectEdge(vehicleId!, revisionId!, edgeId),
    onSuccess: () => {
      setWireError(null);
      invalidateWiring();
    },
    onError: (error) => setWireError(handleMutationError(error, "Failed to remove wire.")),
  });

  const deleteShortMutation = useMutation({
    mutationFn: ({ connectorId, shortId }: { connectorId: string; shortId: string }) =>
      deletePinShort(vehicleId!, revisionId!, connectorId, shortId),
    onSuccess: () => {
      setWireError(null);
      invalidateWiring();
    },
    onError: (error) => setWireError(handleMutationError(error, "Failed to remove short.")),
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

  const nodes: Node[] = useMemo(() => buildNodes(data?.nodes ?? []), [data]);

  const edges: Edge[] = useMemo(
    () =>
      (data?.edges ?? []).map((e) => {
        const isShort = e.kind === "short" || e.data?.short;
        const onDelete = () => {
          if (isShort) {
            const connectorId = String(e.data?.connectorInstanceId ?? "");
            const shortId = String(e.data?.shortId ?? e.id.replace("short:", ""));
            if (connectorId) deleteShortMutation.mutate({ connectorId, shortId });
          } else {
            deleteWireMutation.mutate(e.id);
          }
        };
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          type: "deletable",
          label: e.label ?? undefined,
          data: { ...e.data, onDelete },
          style: {
            stroke: isShort ? "#f59e0b" : "#6b6b6b",
            strokeDasharray: isShort ? "6 4" : undefined,
            strokeWidth: isShort ? 2 : 1,
          },
          animated: e.kind === "bus",
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data],
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

  return (
    <div className="h-full w-full">
      <CanvasControls />
      {wireMode && (
        <div className="pointer-events-none absolute left-3 top-3 z-10 rounded border border-tesla-accent/40 bg-tesla-bg/90 px-2 py-1 text-xs text-tesla-muted">
          Wire mode: {pairingPinAId ? "pick pin B (or drag) to finish wire" : "pick pin A or drag between pins"}
        </div>
      )}
      {wireError && (
        <div className="absolute left-3 top-12 z-10 max-w-sm rounded border border-amber-500/40 bg-tesla-bg/95 px-2 py-1 text-xs text-amber-100">
          {wireError}
        </div>
      )}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        colorMode="dark"
        deleteKeyCode={null}
        proOptions={{ hideAttribution: true }}
        onConnect={onConnect}
        onNodeClick={(_, node) => {
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

function OpenTableIcon() {
  return (
    <svg aria-hidden className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 13h10V3H7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 3h4v4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13 3L7 9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Floating top-right cluster: open table + wiring toggle. */
function CanvasControls() {
  const level = useAppStore((s) => s.projectionLevel);
  const focusId = useAppStore((s) => s.focusId);
  const selectedNodeKind = useAppStore((s) => s.selectedNodeKind);
  const openConnectionTable = useAppStore((s) => s.openConnectionTable);
  const wireMode = useAppStore((s) => s.wireMode);
  const setWireMode = useAppStore((s) => s.setWireMode);

  function scopeForLevel(): {
    kind: "all" | "vehicle" | "enclosure" | "node" | "connector";
    id: string | null;
  } {
    if (focusId) {
      if (level === "enclosure") return { kind: "enclosure", id: focusId };
      if (level === "node") return { kind: "node", id: focusId };
      if (
        level === "connector" ||
        selectedNodeKind === "connector" ||
        selectedNodeKind === "panelMount" ||
        selectedNodeKind === "group"
      )
        return { kind: "connector", id: focusId };
    }
    // Vehicle flow level maps to the vehicle-level harnessing scope (not all pins).
    return { kind: "vehicle", id: null };
  }

  return (
    <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
      <button
        type="button"
        onClick={() => openConnectionTable(scopeForLevel())}
        className="flex items-center gap-1.5 rounded-md border border-tesla-border bg-tesla-bg/90 px-2 py-1 text-xs text-tesla-muted backdrop-blur transition hover:border-tesla-accent hover:text-tesla-text"
      >
        Open table
        <OpenTableIcon />
      </button>
      <button
        type="button"
        onClick={() => setWireMode(!wireMode)}
        className={clsx(
          "rounded-md px-2 py-1 text-xs transition",
          wireMode
            ? "bg-tesla-accent text-white"
            : "border border-tesla-border bg-tesla-bg/90 text-tesla-muted backdrop-blur hover:text-tesla-text",
        )}
      >
        {wireMode ? "Wiring active" : "Wire"}
      </button>
    </div>
  );
}
