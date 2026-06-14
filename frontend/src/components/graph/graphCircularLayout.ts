/**
 * Pure, deterministic circular-layout helper for the Topology Graph View.
 *
 * The backend is authoritative for *what* nodes exist; the frontend owns *where*
 * they sit. This module computes initial positions for nodes that have no saved
 * position, using a circular arrangement. It is intentionally free of any React
 * or ReactFlow dependency so it can be unit- and property-tested in isolation.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4 (and the new-node-outside-bbox behaviour
 * shared with Req 7.3).
 */

/** A node bounding box in px. Defaults to 120 x 40 when actual sizes are unknown. */
export interface Box {
  width: number;
  height: number;
}

/** A 2D point in canvas coordinates. */
export interface Pt {
  x: number;
  y: number;
}

export interface CircularLayoutOptions {
  /** Viewport center; used as the circle center when no nodes are placed yet. */
  center: Pt;
  /** Positions of already-placed (saved or previously laid-out) nodes. */
  existing?: Pt[];
  /** Assumed node bounding box; defaults to {@link DEFAULT_NODE_BOX}. */
  box?: Box;
}

/** Default node bounding box (Req 4.2). */
export const DEFAULT_NODE_BOX: Box = { width: 120, height: 40 };

/** Minimum circle radius in px (Req 4.2, 4.3). */
export const MIN_RADIUS = 180;

/** Radius contribution per node in px (Req 4.2, 4.3). */
export const RADIUS_PER_NODE = 60;

/** Extra gap (px) added when clearing the existing bounding box (Req 7.3). */
export const BBOX_CLEARANCE_GAP = 40;

/**
 * Compute circular placements for the given node ids.
 *
 * Rules:
 * - `nodeIds.length === 1` with no `existing` nodes -> placed at `center` (Req 4.4).
 * - No `existing` nodes -> all nodes evenly spaced at `360 / n` degrees on a
 *   circle of radius `max(n * 60, 180)` around `center` (Req 4.1, 4.2).
 * - Some `existing` nodes -> nodes evenly spaced at `360 / n` degrees on a
 *   secondary circle centered at the centroid of `existing`, with radius
 *   `max(n * 60, 180)` (Req 4.3), enlarged when necessary so every placement
 *   falls outside the bounding box of the already-placed nodes (Req 7.3).
 *
 * The function is deterministic: identical inputs always yield identical output.
 *
 * @returns a Map from node id to its computed position.
 */
export function circularLayout(
  nodeIds: string[],
  opts: CircularLayoutOptions,
): Map<string, Pt> {
  const result = new Map<string, Pt>();
  const n = nodeIds.length;
  if (n === 0) return result;

  const box = opts.box ?? DEFAULT_NODE_BOX;
  const existing = opts.existing ?? [];
  const hasExisting = existing.length > 0;

  // Req 4.4: exactly one graph node and nothing placed yet -> viewport center.
  if (n === 1 && !hasExisting) {
    result.set(nodeIds[0], { x: opts.center.x, y: opts.center.y });
    return result;
  }

  let circleCenter: Pt;
  let radius: number;

  if (!hasExisting) {
    // Req 4.1, 4.2: all-unsaved circle around the viewport center.
    circleCenter = { x: opts.center.x, y: opts.center.y };
    radius = Math.max(n * RADIUS_PER_NODE, MIN_RADIUS);
  } else {
    // Req 4.3: secondary circle about the centroid of already-placed nodes.
    circleCenter = centroid(existing);
    const baseRadius = Math.max(n * RADIUS_PER_NODE, MIN_RADIUS);
    // Req 7.3: enlarge the radius (if needed) so placements clear the bbox of
    // the already-placed nodes, keeping the circle centered on the centroid.
    const clearRadius = bboxClearRadius(existing, circleCenter, box);
    radius = Math.max(baseRadius, clearRadius);
  }

  // Even angular spacing of `360 / n` degrees, starting from the top (-90 deg)
  // and proceeding clockwise so the arrangement is deterministic and balanced.
  const step = (2 * Math.PI) / n;
  const startAngle = -Math.PI / 2;
  nodeIds.forEach((id, i) => {
    const angle = startAngle + i * step;
    result.set(id, {
      x: circleCenter.x + radius * Math.cos(angle),
      y: circleCenter.y + radius * Math.sin(angle),
    });
  });

  return result;
}

/** Arithmetic mean of a non-empty list of points. */
function centroid(points: Pt[]): Pt {
  const sum = points.reduce(
    (acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }),
    { x: 0, y: 0 },
  );
  return { x: sum.x / points.length, y: sum.y / points.length };
}

/**
 * Smallest radius from `center` for which every point on the circle lies
 * outside the axis-aligned bounding box of `points`, where the bbox is expanded
 * by half a node box plus a gap on each side so node boxes do not overlap.
 *
 * A circle whose radius exceeds the distance from `center` to the farthest
 * corner of the (expanded) bbox fully encloses that bbox, guaranteeing that no
 * point on the circle can fall inside it.
 */
function bboxClearRadius(points: Pt[], center: Pt, box: Box): number {
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

  const padX = box.width / 2 + BBOX_CLEARANCE_GAP;
  const padY = box.height / 2 + BBOX_CLEARANCE_GAP;
  minX -= padX;
  maxX += padX;
  minY -= padY;
  maxY += padY;

  const corners: Pt[] = [
    { x: minX, y: minY },
    { x: minX, y: maxY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
  ];
  return corners.reduce(
    (max, c) => Math.max(max, Math.hypot(c.x - center.x, c.y - center.y)),
    0,
  );
}
