import { Position, getSmoothStepPath } from "@xyflow/react";

type WirePathParams = {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourcePosition?: Position;
  targetPosition?: Position;
};

type Point = { x: number; y: number };

const MIN_CHANNEL = 24;
const MAX_CHANNEL = 56;
const CORNER_RADIUS = 8;

function dist(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Rounded corner between orthogonal segments (matches React Flow smooth-step bends). */
function bend(a: Point, b: Point, c: Point, size: number): string {
  const bendSize = Math.min(dist(a, b) / 2, dist(b, c) / 2, size);
  const { x, y } = b;
  if ((a.x === x && x === c.x) || (a.y === y && y === c.y)) {
    return `L ${x} ${y}`;
  }
  if (a.y === y) {
    const xDir = a.x < c.x ? -1 : 1;
    const yDir = a.y < c.y ? 1 : -1;
    return `L ${x + bendSize * xDir},${y} Q ${x},${y} ${x},${y + bendSize * yDir}`;
  }
  const xDir = a.x < c.x ? 1 : -1;
  const yDir = a.y < c.y ? -1 : 1;
  return `L ${x},${y + bendSize * yDir} Q ${x},${y} ${x + bendSize * xDir},${y}`;
}

function buildSmoothPath(points: Point[], cornerRadius: number): string {
  if (points.length < 2) return "";
  let path = `M ${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    path += bend(points[i - 1], points[i], points[i + 1], cornerRadius);
  }
  const last = points[points.length - 1];
  path += ` L ${last.x},${last.y}`;
  return path;
}

/** Cubic midpoint (t = 0.5) for label / delete anchor fallback. */
function cubicMidpoint(
  sx: number,
  sy: number,
  c1x: number,
  c1y: number,
  c2x: number,
  c2y: number,
  tx: number,
  ty: number,
): [number, number] {
  const mx1 = (sx + c1x) / 2;
  const my1 = (sy + c1y) / 2;
  const mx2 = (c1x + c2x) / 2;
  const my2 = (c1y + c2y) / 2;
  const mx3 = (c2x + tx) / 2;
  const my3 = (c2y + ty) / 2;
  const mx4 = (mx1 + mx2) / 2;
  const my4 = (my1 + my2) / 2;
  const mx5 = (mx2 + mx3) / 2;
  const my5 = (my2 + my3) / 2;
  return [(mx4 + mx5) / 2, (my4 + my5) / 2];
}

/**
 * Stacked pins (mostly vertical separation): smooth cubic through a channel
 * to the right of both handles.
 */
function verticalChannelWire(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
): [string, number, number] {
  const absDx = Math.abs(targetX - sourceX);
  const absDy = Math.abs(targetY - sourceY);
  const span = Math.max(absDx, absDy, 1);
  const channel = Math.max(MIN_CHANNEL, Math.min(MAX_CHANNEL, span * 0.35 + 20));
  const ox = Math.max(sourceX, targetX) + channel;
  const c1x = ox;
  const c1y = sourceY;
  const c2x = ox;
  const c2y = targetY;
  const path = `M ${sourceX},${sourceY} C ${c1x},${c1y} ${c2x},${c2y} ${targetX},${targetY}`;
  const [labelX, labelY] = cubicMidpoint(sourceX, sourceY, c1x, c1y, c2x, c2y, targetX, targetY);
  return [path, labelX, labelY];
}

/**
 * Inline pins (mostly horizontal separation): route above the row — stub out,
 * lift, run across, drop into the target. Avoids the degenerate right-side loop
 * when both handles share the same Y.
 */
function horizontalOverheadWire(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
): [string, number, number] {
  const absDx = Math.abs(targetX - sourceX);
  const absDy = Math.abs(targetY - sourceY);
  const stub = Math.max(10, Math.min(22, absDx * 0.08 + 8));
  const lift = Math.max(18, Math.min(42, absDx * 0.12 + absDy * 0.35 + 14));
  const routeY = Math.min(sourceY, targetY) - lift;
  const sx1 = sourceX + stub;
  const tx1 = targetX + stub;
  const path = buildSmoothPath(
    [
      { x: sourceX, y: sourceY },
      { x: sx1, y: sourceY },
      { x: sx1, y: routeY },
      { x: tx1, y: routeY },
      { x: tx1, y: targetY },
      { x: targetX, y: targetY },
    ],
    CORNER_RADIUS,
  );
  return [path, (sx1 + tx1) / 2, routeY];
}

/** Pick vertical-channel vs overhead routing for Right→Right pin wires. */
function sameSideWire(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
): [string, number, number] {
  const dx = targetX - sourceX;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(targetY - sourceY);

  if (absDx < 6 && absDy < 6) {
    return verticalChannelWire(sourceX, sourceY, targetX, targetY);
  }

  const horizontalDominant = absDx >= absDy * 1.05;
  const verticalDominant = absDy >= absDx * 1.05;

  if (verticalDominant) {
    return verticalChannelWire(sourceX, sourceY, targetX, targetY);
  }

  if (horizontalDominant) {
    // Target to the left of source must loop back via a right-side channel.
    if (dx < -8) {
      return verticalChannelWire(sourceX, sourceY, targetX, targetY);
    }
    return horizontalOverheadWire(sourceX, sourceY, targetX, targetY);
  }

  // Diagonal: overhead when target is not clearly left, else channel.
  if (dx >= 0) {
    return horizontalOverheadWire(sourceX, sourceY, targetX, targetY);
  }
  return verticalChannelWire(sourceX, sourceY, targetX, targetY);
}

/**
 * Route a topology wire with smooth splines tuned for pin-port handles.
 */
export function getWirePath({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition = Position.Right,
  targetPosition = Position.Right,
}: WirePathParams): [path: string, labelX: number, labelY: number] {
  if (sourcePosition === targetPosition) {
    return sameSideWire(sourceX, sourceY, targetX, targetY);
  }

  const absDx = Math.abs(targetX - sourceX);
  const absDy = Math.abs(targetY - sourceY);
  const offset = Math.max(MIN_CHANNEL, Math.min(MAX_CHANNEL, Math.min(absDx, absDy) * 0.35 + 20));

  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: CORNER_RADIUS,
    offset,
  });
  return [path, labelX, labelY];
}
