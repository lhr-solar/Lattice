import { useCallback, useEffect, useRef, useState } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
} from "@tanstack/react-query";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { fetchTopologyGraph, patchTopologyLayout } from "@/api/topologyGraph";
import type {
  TopologyGraphProjectionDto,
  TopologyLayoutRecord,
} from "@/api/types";
import { ApiError } from "@/api/client";
import { useAutoDismiss } from "@/hooks/useAutoDismiss";
import { handleMutationError } from "@/lib/mutationErrors";
import { useAppStore } from "@/stores/appStore";
import {
  computeNeighborhood,
  reconcile,
  type Neighborhood,
  type Viewport,
} from "./graphReconcile";
import { useDebouncedLayoutSaver } from "./graphLayoutSaver";
import {
  graphNodeTypes,
  type GraphHighlightState,
  type GraphNodeData,
} from "./nodes/GraphNodeComponent";
import {
  graphEdgeTypes,
  type EdgeHighlight,
  type GraphEdgeData,
} from "./edges/GraphEdgeComponent";
import type { Pt } from "./graphCircularLayout";

/** Canvas background, consistent with the Lattice dark-mode design (Req 6.5). */
const CANVAS_BG = "#141414";

/** Minimum time (ms) an inline error indicator stays visible (Req 3.5, 7.5). */
const ERROR_MIN_VISIBLE_MS = 3000;

const NODE_ID_PREFIX = "tg-node:";

/** ReactFlow node type carrying the topology graph node `data`. */
type GraphFlowNode = Node<GraphNodeData>;
/** ReactFlow edge type carrying the topology graph edge `data`. */
type GraphFlowEdge = Edge<GraphEdgeData>;

/** Resolve a node's highlight state from the hovered node's neighborhood (Req 6.6). */
function nodeHighlight(
  id: string,
  hoveredNodeId: string | null,
  neighborhood: Neighborhood,
): GraphHighlightState {
  if (hoveredNodeId == null) return "none";
  if (id === hoveredNodeId) return "active";
  if (neighborhood.nodes.has(id)) return "neighbor";
  return "dim";
}

/** Resolve an edge's highlight state from the hovered node's neighborhood (Req 6.6). */
function edgeHighlight(
  id: string,
  hoveredNodeId: string | null,
  neighborhood: Neighborhood,
): EdgeHighlight {
  if (hoveredNodeId == null) return "none";
  if (neighborhood.edges.has(id)) return "active";
  return "dim";
}

/**
 * Map the server projection plus the reconciled on-screen positions into the
 * ReactFlow node array, attaching the per-node hover-highlight state via `data`.
 */
function buildFlowNodes(
  projection: TopologyGraphProjectionDto,
  positions: Map<string, Pt>,
  hoveredNodeId: string | null,
  neighborhood: Neighborhood,
): GraphFlowNode[] {
  return projection.nodes.map((n) => ({
    id: n.id,
    type: "topologyGraphNode",
    position: positions.get(n.id) ?? { x: 0, y: 0 },
    data: {
      entity_kind: n.entity_kind,
      label: n.label,
      template_label: n.template_label,
      highlight: nodeHighlight(n.id, hoveredNodeId, neighborhood),
    },
  }));
}

/**
 * Map the server projection edges into the ReactFlow edge array, attaching the
 * `wireCount` and per-edge hover-highlight state via `data`.
 */
function buildFlowEdges(
  projection: TopologyGraphProjectionDto,
  hoveredNodeId: string | null,
  neighborhood: Neighborhood,
): GraphFlowEdge[] {
  return projection.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: "topologyGraph",
    data: {
      wireCount: e.wire_count,
      highlight: edgeHighlight(e.id, hoveredNodeId, neighborhood),
    },
  }));
}

function GraphViewInner() {
  const vehicleId = useAppStore((s) => s.selectedVehicleId);
  const revisionId = useAppStore((s) => s.selectedRevisionId);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const { screenToFlowPosition } = useReactFlow();

  // Authoritative on-screen positions: the client owns "where things sit".
  const positionsRef = useRef<Map<string, Pt>>(new Map());

  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const hoveredNodeIdRef = useRef<string | null>(null);
  hoveredNodeIdRef.current = hoveredNodeId;

  const [rfNodes, setRfNodes, onNodesChangeBase] =
    useNodesState<GraphFlowNode>([]);
  const [rfEdges, setRfEdges] = useEdgesState<GraphFlowEdge>([]);

  const { data, isFetching, isError, error } = useQuery({
    queryKey: ["design-projection", vehicleId, revisionId, "topology-graph"],
    queryFn: () => fetchTopologyGraph(vehicleId!, revisionId!),
    enabled: Boolean(vehicleId && revisionId),
    placeholderData: keepPreviousData,
  });

  // Inline save-failure indicator (Req 3.5): held for a minimum of 3 s, then
  // auto-dismissed. The node's new position is never reverted on error.
  const [saveError, setSaveError] = useState<string | null>(null);
  const clearSaveError = useCallback(() => setSaveError(null), []);
  useAutoDismiss(saveError, clearSaveError, ERROR_MIN_VISIBLE_MS);

  // Inline refetch-failure indicator (Req 7.5): held for a minimum of 3 s. The
  // last successful projection stays on screen (keepPreviousData), so the
  // canvas is never blanked.
  const [fetchError, setFetchError] = useState<string | null>(null);
  const clearFetchError = useCallback(() => setFetchError(null), []);
  useAutoDismiss(fetchError, clearFetchError, ERROR_MIN_VISIBLE_MS);

  useEffect(() => {
    if (!isError) return;
    setFetchError(
      error instanceof ApiError
        ? `Failed to refresh graph (${error.status})`
        : "Failed to refresh graph",
    );
  }, [isError, error]);

  // Drag-save mutation (Req 3.5): no automatic retry; on failure we surface an
  // inline indicator and keep the dragged position as-is (no revert).
  const { mutate: saveLayout } = useMutation({
    mutationFn: (records: TopologyLayoutRecord[]) =>
      patchTopologyLayout(vehicleId!, revisionId!, records),
    retry: false,
    onSuccess: () => setSaveError(null),
    onError: (err) =>
      setSaveError(handleMutationError(err, "Failed to save layout.")),
  });

  // Debounced drag-save: each drag-stop coalesces to its latest position and a
  // single PATCH is dispatched per 500 ms quiet window (Req 3.1).
  const saver = useDebouncedLayoutSaver(
    useCallback(
      (records: TopologyLayoutRecord[]) => {
        if (records.length === 0 || !vehicleId || !revisionId) return;
        saveLayout(records);
      },
      [saveLayout, vehicleId, revisionId],
    ),
  );

  /** Compute the circle center used by the reconcile step (viewport center). */
  const viewport = useCallback((): Viewport => {
    const el = containerRef.current;
    if (!el) return { center: { x: 0, y: 0 } };
    const rect = el.getBoundingClientRect();
    try {
      const center = screenToFlowPosition({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      });
      return { center };
    } catch {
      return { center: { x: 0, y: 0 } };
    }
  }, [screenToFlowPosition]);

  // Effect A: reconcile positions and rebuild nodes/edges whenever the server
  // projection changes (initial load, refetch after a revision sync, etc.).
  useEffect(() => {
    if (!data) return;
    reconcile(data, viewport(), positionsRef.current);
    const hovered = hoveredNodeIdRef.current;
    const neighborhood = computeNeighborhood(data.edges, hovered);
    setRfNodes(
      buildFlowNodes(data, positionsRef.current, hovered, neighborhood),
    );
    setRfEdges(buildFlowEdges(data, hovered, neighborhood));
  }, [data, viewport, setRfNodes, setRfEdges]);

  // Effect B: when the hovered node changes, update only the `highlight` field
  // of existing nodes/edges so positions and selection are preserved (Req 6.6).
  useEffect(() => {
    const neighborhood = computeNeighborhood(data?.edges ?? [], hoveredNodeId);
    setRfNodes((nds) =>
      nds.map((n) => ({
        ...n,
        data: {
          ...n.data,
          highlight: nodeHighlight(n.id, hoveredNodeId, neighborhood),
        },
      })),
    );
    setRfEdges((eds) =>
      eds.map((e) => ({
        ...e,
        data: {
          ...(e.data ?? { wireCount: 1 }),
          highlight: edgeHighlight(e.id, hoveredNodeId, neighborhood),
        },
      })),
    );
  }, [hoveredNodeId, data, setRfNodes, setRfEdges]);

  // Real-time drag: apply ReactFlow position changes immediately (Req 5.2) and
  // mirror them into positionsRef so subsequent rebuilds preserve the new spot.
  const onNodesChange = useCallback(
    (changes: NodeChange<GraphFlowNode>[]) => {
      onNodesChangeBase(changes);
      for (const change of changes) {
        if (change.type === "position" && change.position) {
          positionsRef.current.set(change.id, {
            x: change.position.x,
            y: change.position.y,
          });
        }
      }
    },
    [onNodesChangeBase],
  );

  // On drag end, record the node's final position for the debounced save.
  const onNodeDragStop = useCallback(
    (_event: unknown, node: GraphFlowNode) => {
      const entityId = node.id.startsWith(NODE_ID_PREFIX)
        ? node.id.slice(NODE_ID_PREFIX.length)
        : node.id;
      const entityKind =
        node.data?.entity_kind === "pcb_instance"
          ? "pcb_instance"
          : "enclosure_instance";
      saver.enqueue(node.id, {
        entity_kind: entityKind,
        entity_id: entityId,
        x: node.position.x,
        y: node.position.y,
      });
    },
    [saver],
  );

  const onNodeMouseEnter = useCallback(
    (_event: unknown, node: GraphFlowNode) => setHoveredNodeId(node.id),
    [],
  );
  const onNodeMouseLeave = useCallback(() => setHoveredNodeId(null), []);

  if (!vehicleId) {
    return (
      <div className="flex h-full items-center justify-center text-tesla-muted">
        Select or create a vehicle to view the topology graph
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      style={{ background: CANVAS_BG }}
    >
      {/* Non-blocking loading overlay during refetch (Req 7.2): a small badge
          that never obscures or blanks the graph. */}
      {isFetching && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded border border-tesla-border bg-tesla-bg/90 px-2 py-1 text-xs text-tesla-muted">
          Refreshing graph…
        </div>
      )}
      {/* Refetch-failure indicator (Req 7.5). */}
      {fetchError && (
        <div className="pointer-events-none absolute left-3 top-3 z-10 max-w-sm rounded border border-amber-500/40 bg-tesla-bg/95 px-2 py-1 text-xs text-amber-100">
          {fetchError}
        </div>
      )}
      {/* Layout save-failure indicator (Req 3.5). */}
      {saveError && (
        <div className="pointer-events-none absolute left-3 top-12 z-10 max-w-sm rounded border border-amber-500/40 bg-tesla-bg/95 px-2 py-1 text-xs text-amber-100">
          {saveError}
        </div>
      )}
      <ReactFlow
        className="h-full w-full"
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={graphNodeTypes}
        edgeTypes={graphEdgeTypes}
        colorMode="dark"
        fitView
        proOptions={{ hideAttribution: true }}
        nodesDraggable
        nodesConnectable={false}
        edgesFocusable={false}
        edgesReconnectable={false}
        elementsSelectable
        deleteKeyCode={null}
        onBeforeDelete={() => Promise.resolve(false)}
        onNodesChange={onNodesChange}
        onNodeDragStop={onNodeDragStop}
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeMouseLeave={onNodeMouseLeave}
      >
        <Background gap={20} color="#1f1f1f" />
        <Controls position="bottom-left" />
        <MiniMap
          position="bottom-right"
          nodeColor="#2a2a2a"
          maskColor="rgba(10,10,10,0.8)"
        />
      </ReactFlow>
    </div>
  );
}

/**
 * Topology Graph View: a high-level, flattened connection map rendered with
 * ReactFlow. One node per top-level enclosure / standalone PCB, one bezier edge
 * per connected node pair. Nodes float freely and are draggable; positions are
 * reconciled client-side (circular layout when unsaved) and persisted via a
 * debounced save on drag end.
 *
 * Wrapped in `ReactFlowProvider` so the inner component can read the live
 * viewport (for the circular-layout center) through `useReactFlow`.
 *
 * Requirements: 3.1, 3.5, 4.1, 4.3, 4.4, 5.1, 5.2, 5.3, 5.4, 5.5, 6.5, 6.6, 7.2, 7.5
 */
export function GraphView() {
  return (
    <ReactFlowProvider>
      <GraphViewInner />
    </ReactFlowProvider>
  );
}
