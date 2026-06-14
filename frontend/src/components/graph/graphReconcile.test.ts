/**
 * Property-based tests for the pure reconcile + hover-neighborhood helpers of
 * the Topology Graph View (`graphReconcile.ts`).
 *
 * Covers design Correctness Properties 8, 9 and 10:
 *   - Property 8  → hover highlight set equals the closed neighborhood (Req 6.6)
 *   - Property 9  → a newly appearing node is placed outside the existing
 *                   bounding box (Req 7.3)
 *   - Property 10 → removing a node from the projection drops the node (and its
 *                   retained position entry) (Req 7.4)
 *
 * Framework: Vitest + fast-check ({ numRuns: 100 }).
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { reconcile, computeNeighborhood, type Viewport } from "./graphReconcile";
import type { Pt } from "./graphCircularLayout";
import type {
  TopologyGraphEdgeDto,
  TopologyGraphNodeDto,
  TopologyGraphProjectionDto,
} from "../../api/types";

// --- shared helpers -------------------------------------------------------

const VIEWPORT: Viewport = { center: { x: 0, y: 0 } };

function makeProjection(
  nodes: TopologyGraphNodeDto[],
  edges: TopologyGraphEdgeDto[] = [],
): TopologyGraphProjectionDto {
  return {
    revision_id: "rev-1",
    view_key: "topology-graph:vehicle",
    nodes,
    edges,
    meta: {},
  };
}

function node(
  id: string,
  position: { x: number; y: number } | null = null,
): TopologyGraphNodeDto {
  return {
    id,
    entity_kind: "enclosure_instance",
    label: id,
    template_label: null,
    position,
  };
}

/** Axis-aligned bounding box of a non-empty list of points. */
function bbox(points: Pt[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

// =========================================================================
// Property 8 (Task 8.2)
// =========================================================================

// Feature: topology-graph-view, Property 8: Hover highlight set equals the
// closed neighborhood of the hovered node — for any graph and hovered node h
// the highlighted set = {h} ∪ incident edges ∪ adjacent nodes; with no hover
// nothing is highlighted.
// Validates: Requirements 6.6
describe("Property 8: hover highlight = closed neighborhood (Req 6.6)", () => {
  it("highlights exactly {h} ∪ incident edges ∪ adjacent nodes, nothing on no-hover", () => {
    const arb = fc
      .integer({ min: 1, max: 8 })
      .chain((nodeCount) => {
        const ids = Array.from({ length: nodeCount }, (_, i) => `tg-node:${i}`);
        return fc.record({
          ids: fc.constant(ids),
          edges: fc.array(
            fc.record({
              s: fc.integer({ min: 0, max: nodeCount - 1 }),
              t: fc.integer({ min: 0, max: nodeCount - 1 }),
            }),
            { maxLength: 16 },
          ),
          // hover: an existing node, a node id absent from any edge, or null.
          hover: fc.oneof(
            fc.constant<null>(null),
            fc.integer({ min: 0, max: nodeCount - 1 }).map((i) => ids[i]),
            fc.constant("tg-node:absent"),
          ),
        });
      });

    fc.assert(
      fc.property(arb, ({ ids, edges: edgeSpecs, hover }) => {
        const edges: TopologyGraphEdgeDto[] = edgeSpecs.map((e, i) => {
          const source = ids[e.s];
          const target = ids[e.t];
          return { id: `e${i}`, source, target, wire_count: 1 };
        });

        const result = computeNeighborhood(edges, hover);

        if (hover == null) {
          // No hover ⇒ nothing highlighted.
          expect(result.nodes.size).toBe(0);
          expect(result.edges.size).toBe(0);
          return;
        }

        // h is always part of its own closed neighborhood.
        expect(result.nodes.has(hover)).toBe(true);

        // Edge membership is exactly incidence to h (iff).
        for (const edge of edges) {
          const incident = edge.source === hover || edge.target === hover;
          expect(result.edges.has(edge.id)).toBe(incident);
          if (incident) {
            // Both endpoints of an incident edge are highlighted nodes.
            expect(result.nodes.has(edge.source)).toBe(true);
            expect(result.nodes.has(edge.target)).toBe(true);
          }
        }

        // The highlighted edge set contains only ids drawn from incident edges.
        const incidentEdgeIds = new Set(
          edges
            .filter((e) => e.source === hover || e.target === hover)
            .map((e) => e.id),
        );
        expect(result.edges).toEqual(incidentEdgeIds);

        // Every highlighted node is either h or adjacent to h via some edge.
        for (const nodeId of result.nodes) {
          if (nodeId === hover) continue;
          const adjacent = edges.some(
            (e) =>
              (e.source === hover && e.target === nodeId) ||
              (e.target === hover && e.source === nodeId),
          );
          expect(adjacent).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });
});

// =========================================================================
// Property 9 (Task 8.3)
// =========================================================================

// Feature: topology-graph-view, Property 9: A newly appearing node is placed
// outside the bounding box of already-placed nodes — for any non-empty set of
// placed positions and a node newly added by a refetch, reconcile assigns the
// new node a position outside the axis-aligned bbox of the placed positions.
// Validates: Requirements 7.3
describe("Property 9: new node placed outside existing bbox (Req 7.3)", () => {
  it("places a node added on refetch strictly outside the placed-nodes bbox", () => {
    const coord = fc.double({
      min: -2000,
      max: 2000,
      noNaN: true,
      noDefaultInfinity: true,
    });

    const arb = fc
      .integer({ min: 1, max: 8 })
      .chain((placedCount) =>
        fc.record({
          placed: fc.array(fc.record({ x: coord, y: coord }), {
            minLength: placedCount,
            maxLength: placedCount,
          }),
        }),
      );

    fc.assert(
      fc.property(arb, ({ placed }) => {
        const placedIds = placed.map((_, i) => `tg-node:placed-${i}`);
        const newId = "tg-node:new";

        // Seed the authoritative positions with the already-placed nodes.
        const positionsRef = new Map<string, Pt>();
        placedIds.forEach((id, i) => {
          positionsRef.set(id, { x: placed[i].x, y: placed[i].y });
        });

        // Refetch projection: the placed nodes (already on screen) plus one new
        // node with no position.
        const projection = makeProjection([
          ...placedIds.map((id) => node(id)),
          node(newId),
        ]);

        reconcile(projection, VIEWPORT, positionsRef);

        const newPos = positionsRef.get(newId);
        expect(newPos).toBeDefined();

        const box = bbox(placed);
        const outside =
          newPos!.x < box.minX ||
          newPos!.x > box.maxX ||
          newPos!.y < box.minY ||
          newPos!.y > box.maxY;
        expect(outside).toBe(true);

        // The already-placed nodes keep their positions.
        placedIds.forEach((id, i) => {
          expect(positionsRef.get(id)).toEqual({
            x: placed[i].x,
            y: placed[i].y,
          });
        });
      }),
      { numRuns: 100 },
    );
  });
});

// =========================================================================
// Property 10 (Task 8.4)
// =========================================================================

// Feature: topology-graph-view, Property 10: Removing a node from the
// projection removes the node and all its incident edges — for any rendered
// projection then a projection with nodes absent, after reconcile the
// positionsRef contains none of the removed nodes (and drops their entries).
// Validates: Requirements 7.4
describe("Property 10: removed nodes dropped from positionsRef (Req 7.4)", () => {
  it("drops every removed node's position entry and retains only present nodes", () => {
    const coord = fc.double({
      min: -2000,
      max: 2000,
      noNaN: true,
      noDefaultInfinity: true,
    });

    const arb = fc
      .uniqueArray(fc.uuid(), { minLength: 1, maxLength: 8 })
      .chain((uuids) => {
        const ids = uuids.map((u) => `tg-node:${u}`);
        return fc.record({
          ids: fc.constant(ids),
          positions: fc.array(fc.record({ x: coord, y: coord }), {
            minLength: ids.length,
            maxLength: ids.length,
          }),
          removed: fc.subarray(ids, { minLength: 1 }),
        });
      });

    fc.assert(
      fc.property(arb, ({ ids, positions, removed }) => {
        const removedSet = new Set(removed);

        // Initial projection: every node carries a saved position.
        const initial = makeProjection(
          ids.map((id, i) => node(id, { x: positions[i].x, y: positions[i].y })),
        );

        const positionsRef = new Map<string, Pt>();
        reconcile(initial, VIEWPORT, positionsRef);

        // Every initial node has a position after the first reconcile.
        for (const id of ids) {
          expect(positionsRef.has(id)).toBe(true);
        }

        // Refetch projection with the removed nodes absent. Edges that
        // reference a removed node are dropped along with the node.
        const remainingIds = ids.filter((id) => !removedSet.has(id));
        const next = makeProjection(
          remainingIds.map((id) => {
            const idx = ids.indexOf(id);
            return node(id, { x: positions[idx].x, y: positions[idx].y });
          }),
        );

        reconcile(next, VIEWPORT, positionsRef);

        // No removed node retains a position entry.
        for (const id of removed) {
          expect(positionsRef.has(id)).toBe(false);
        }

        // positionsRef holds exactly the remaining node ids (no stale entries).
        expect(new Set(positionsRef.keys())).toEqual(new Set(remainingIds));
      }),
      { numRuns: 100 },
    );
  });
});
