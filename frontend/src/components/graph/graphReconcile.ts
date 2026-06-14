/**
 * Pure, deterministic reconcile + hover-neighborhood helpers for the Topology
 * Graph View.
 *
 * These functions implement the client-owned "where things sit" half of the
 * layout-ownership split: the backend says *which* nodes/edges exist, and this
 * module maps that server topology onto on-screen positions and hover-highlight
 * sets. Both functions are intentionally free of any React or ReactFlow
 * dependency so they can be unit- and property-tested in isolation.
 *
 * Requirements: 6.6 (closed neighborhood highlight), 7.3 (new node placed
 * outside the existing bounding box), 7.4 (removed nodes and their incident
 * edges dropped). The circular placement reuses the already-implemented
 * `circularLayout` module (Req 4.1, 4.3).
 */

import type {
  TopologyGraphEdgeDto,
  TopologyGraphProjectionDto,
} from "../../api/types";
import { circularLayout, type Pt } from "./graphCircularLayout";

/**
 * The viewport context the reconcile step needs. Only the center point is
 * required: it is used as the circle center the first time nodes are laid out
 * (when nothing has been placed yet).
 */
export interface Viewport {
  /** Center of the visible viewport in canvas coordinates. */
  center: Pt;
}

/**
 * The closed neighborhood of a hovered node, split into the node ids and edge
 * ids that should be highlighted.
 */
export interface Neighborhood {
  /** `{h} ∪ nodes adjacent to h`. Empty when no node is hovered. */
  nodes: Set<string>;
  /** Ids of edges incident to `h`. Empty when no node is hovered. */
  edges: Set<string>;
}

/**
 * Reconcile the authoritative on-screen positions (`positionsRef`) against a
 * freshly fetched projection. This is the core client state machine.
 *
 * Steps (order matters):
 * 1. Drop position entries for nodes no longer in the projection, so removed
 *    nodes — and, by extension, the edges referencing them — disappear and no
 *    stale entry is carried forward (Req 7.4).
 * 2. Apply server-saved positions: any node whose DTO carries a non-null
 *    `position` is pinned to that position (the server is authoritative for
 *    saved layout, Req 3.3).
 * 3. Circular-place the *unsaved* nodes — those with a null `position` and no
 *    entry already in `positionsRef`. On first render this is every node, so
 *    the all-unsaved circle is centered on the viewport (Req 4.1). When some
 *    nodes are already placed (saved or laid out on a prior pass), the new
 *    nodes are placed on a secondary circle about the centroid of the placed
 *    nodes and outside their bounding box, which also covers a node that newly
 *    appears after a refetch (Req 4.3, 7.3).
 *
 * The function mutates `positionsRef` in place (it is the caller's authoritative
 * ref map) and also returns it for convenience. It is deterministic: identical
 * inputs always yield identical output.
 *
 * @param projection   the latest topology-graph projection from the backend.
 * @param viewport     viewport context (provides the initial circle center).
 * @param positionsRef the authoritative map of node id -> on-screen position.
 * @returns the same `positionsRef` map, after reconciliation.
 */
export function reconcile(
  projection: TopologyGraphProjectionDto,
  viewport: Viewport,
  positionsRef: Map<string, Pt>,
): Map<string, Pt> {
  const currentIds = new Set(projection.nodes.map((n) => n.id));

  // 1. Drop entries for nodes removed from the projection (Req 7.4).
  for (const id of [...positionsRef.keys()]) {
    if (!currentIds.has(id)) {
      positionsRef.delete(id);
    }
  }

  // 2. Apply server-saved positions (server is authoritative, Req 3.3).
  for (const node of projection.nodes) {
    if (node.position != null) {
      positionsRef.set(node.id, { x: node.position.x, y: node.position.y });
    }
  }

  // 3. Determine which nodes still need a position: null position AND not
  //    already placed on a prior pass.
  const unsavedIds = projection.nodes
    .filter((n) => n.position == null && !positionsRef.has(n.id))
    .map((n) => n.id);

  if (unsavedIds.length > 0) {
    const unsavedSet = new Set(unsavedIds);
    // Basis = every already-placed node (saved or previously laid out).
    const existing: Pt[] = [];
    for (const node of projection.nodes) {
      if (unsavedSet.has(node.id)) continue;
      const placed = positionsRef.get(node.id);
      if (placed != null) existing.push(placed);
    }

    const placements = circularLayout(unsavedIds, {
      center: viewport.center,
      existing,
    });
    for (const [id, pt] of placements) {
      positionsRef.set(id, pt);
    }
  }

  return positionsRef;
}

/**
 * Compute the closed neighborhood of a hovered node for highlight styling.
 *
 * The returned set is exactly `{h} ∪ { edges incident to h } ∪ { nodes adjacent
 * to h via an edge }` (Req 6.6). When `hoveredNodeId` is `null` (no hover),
 * both sets are empty.
 *
 * Pure and deterministic: it reads only the provided edges and hovered id.
 *
 * @param edges         the projection edges.
 * @param hoveredNodeId the currently hovered node id, or `null` for no hover.
 * @returns the highlighted node ids and edge ids.
 */
export function computeNeighborhood(
  edges: readonly TopologyGraphEdgeDto[],
  hoveredNodeId: string | null,
): Neighborhood {
  const nodes = new Set<string>();
  const edgeIds = new Set<string>();

  if (hoveredNodeId == null) {
    return { nodes, edges: edgeIds };
  }

  // The hovered node is always part of its own closed neighborhood.
  nodes.add(hoveredNodeId);

  for (const edge of edges) {
    if (edge.source === hoveredNodeId || edge.target === hoveredNodeId) {
      edgeIds.add(edge.id);
      nodes.add(edge.source);
      nodes.add(edge.target);
    }
  }

  return { nodes, edges: edgeIds };
}
