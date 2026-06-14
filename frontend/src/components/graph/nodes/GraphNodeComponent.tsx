import { Handle, Position, type NodeProps } from "@xyflow/react";

/**
 * Hover/selection highlight state carried on a graph node's `data`.
 *
 * - `"active"`   the node currently hovered.
 * - `"neighbor"` a node adjacent to the hovered node.
 * - `"dim"`      a node outside the hovered node's closed neighborhood.
 * - `"none"`     no node is hovered (default styling).
 */
export type GraphHighlightState = "active" | "neighbor" | "dim" | "none";

/** Shape of the `data` payload `GraphView` puts on each topology graph node. */
export interface GraphNodeData {
  entity_kind: "enclosure_instance" | "pcb_instance";
  label: string;
  template_label: string | null;
  highlight: GraphHighlightState;
  [key: string]: unknown;
}

const ENCLOSURE_BG = "#1e2a3a";
const PCB_BG = "#1a2e1a";
const BORDER = "#2a2a2a";
const ACCENT = "#7db4ff";
const TEMPLATE_COLOR = "#8899aa";

/** Hidden center handle so bezier edges attach to the node center (Req 6.3). */
const centerHandleStyle = {
  left: "50%",
  top: "50%",
  width: 1,
  height: 1,
  minWidth: 0,
  minHeight: 0,
  background: "transparent",
  border: "none",
  opacity: 0,
  pointerEvents: "none" as const,
};

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function isHighlight(value: unknown): value is GraphHighlightState {
  return (
    value === "active" ||
    value === "neighbor" ||
    value === "dim" ||
    value === "none"
  );
}

/**
 * Custom ReactFlow node for the Topology Graph View: a filled pill whose
 * background distinguishes enclosures from standalone PCBs (Req 6.1), showing
 * the instance label and optional template label (Req 6.2), with selection and
 * hover/neighbor highlight styling (Req 6.6, 6.7).
 *
 * Requirements: 6.1, 6.2, 6.7
 */
export function GraphNodeComponent({ data, selected }: NodeProps) {
  const entityKind =
    data?.entity_kind === "pcb_instance" ? "pcb_instance" : "enclosure_instance";
  const label = asString(data?.label);
  const templateLabel =
    typeof data?.template_label === "string" ? data.template_label : null;
  const highlight: GraphHighlightState = isHighlight(data?.highlight)
    ? data.highlight
    : "none";

  const background = entityKind === "pcb_instance" ? PCB_BG : ENCLOSURE_BG;
  const highlighted = highlight === "active" || highlight === "neighbor";

  // Selection border (Req 6.7) takes precedence; otherwise accent the node when
  // it is the hovered node or a neighbor (Req 6.6); default border otherwise.
  let border = `1px solid ${BORDER}`;
  if (selected) {
    border = `2px solid ${ACCENT}`;
  } else if (highlighted) {
    border = `1px solid ${ACCENT}`;
  }

  const opacity = highlight === "dim" ? 0.4 : 1;
  const boxShadow =
    highlight === "active" ? `0 0 0 1px ${ACCENT}, 0 0 12px rgba(125,180,255,0.35)` : undefined;

  return (
    <div
      className="topology-label"
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
        minWidth: 80,
        maxWidth: 200,
        padding: "8px 16px",
        background,
        border,
        borderRadius: 999,
        color: "#e8e8e8",
        boxSizing: "border-box",
        textAlign: "center",
        opacity,
        boxShadow,
        transition: "opacity 80ms ease, box-shadow 80ms ease, border-color 80ms ease",
      }}
    >
      <Handle type="target" position={Position.Top} style={centerHandleStyle} />
      <span
        style={{
          fontSize: 13,
          fontWeight: 600,
          lineHeight: 1.2,
          maxWidth: "100%",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
      {templateLabel !== null && (
        <span
          style={{
            fontSize: 11,
            lineHeight: 1.2,
            color: TEMPLATE_COLOR,
            maxWidth: "100%",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {templateLabel}
        </span>
      )}
      <Handle type="source" position={Position.Bottom} style={centerHandleStyle} />
    </div>
  );
}

/** Node type registry entry for the topology graph custom node. */
export const graphNodeTypes = {
  topologyGraphNode: GraphNodeComponent,
};
