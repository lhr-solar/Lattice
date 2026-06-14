import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";

/**
 * Custom ReactFlow edge for the Topology Graph View.
 *
 * Draws a curved bezier line between the (hidden) center handles of two graph
 * nodes using the accent color `#7db4ff` (Req 6.3, 6.5). When the edge carries
 * a `wireCount > 1`, it renders a small badge centered on the edge midpoint
 * showing the count, with a contrasting dark background so it stays readable
 * against both the edge line and the `#141414` canvas (Req 6.4). The edge's
 * stroke width and opacity toggle based on the `highlight` state passed through
 * the edge `data` by the hover-neighborhood computation (Req 6.6).
 */

/** Edge accent color, consistent with the Lattice dark-mode design system. */
const EDGE_COLOR = "#7db4ff";

/** Highlight state driven by the hovered-node neighborhood (see GraphView). */
export type EdgeHighlight = "active" | "dim" | "none";

/** Shape of the `data` payload GraphView attaches to each topology edge. */
export interface GraphEdgeData {
  /** Distinct wire count for this node pair; badge shown only when > 1. */
  wireCount: number;
  /** Hover highlight state; defaults to "none" when no node is hovered. */
  highlight?: EdgeHighlight;
  [key: string]: unknown;
}

function readData(data: unknown): {
  wireCount: number;
  highlight: EdgeHighlight;
} {
  const d = (data ?? {}) as Partial<GraphEdgeData>;
  const wireCount = typeof d.wireCount === "number" ? d.wireCount : 1;
  const highlight: EdgeHighlight =
    d.highlight === "active" || d.highlight === "dim" ? d.highlight : "none";
  return { wireCount, highlight };
}

/** Resolve stroke width + opacity from the highlight state (Req 6.6). */
function strokeStyle(highlight: EdgeHighlight): {
  strokeWidth: number;
  opacity: number;
} {
  switch (highlight) {
    case "active":
      return { strokeWidth: 2.5, opacity: 1 };
    case "dim":
      return { strokeWidth: 1.5, opacity: 0.12 };
    default:
      return { strokeWidth: 1.5, opacity: 0.85 };
  }
}

export function GraphEdgeComponent({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  data,
}: EdgeProps) {
  const { wireCount, highlight } = readData(data);
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const { strokeWidth, opacity } = strokeStyle(highlight);
  const showBadge = wireCount > 1;

  return (
    <>
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: EDGE_COLOR,
          strokeWidth,
          opacity,
          transition:
            "stroke-width 120ms ease, opacity 120ms ease",
        }}
      />
      {showBadge && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "none",
              // Contrasting dark badge with an accent border: readable against
              // both the #7db4ff edge and the #141414 canvas (Req 6.4).
              background: "#0d1b2e",
              border: `1px solid ${EDGE_COLOR}`,
              borderRadius: 9999,
              color: "#cfe3ff",
              fontSize: 10,
              fontWeight: 600,
              lineHeight: 1,
              padding: "2px 6px",
              minWidth: 16,
              textAlign: "center",
              boxShadow: "0 1px 3px rgba(0, 0, 0, 0.6)",
              opacity: highlight === "dim" ? 0.4 : 1,
              transition: "opacity 120ms ease",
            }}
            className="nodrag nopan"
          >
            {wireCount}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const graphEdgeTypes = { topologyGraph: GraphEdgeComponent };
