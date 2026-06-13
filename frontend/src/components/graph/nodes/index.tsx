import { Handle, Position, type NodeProps } from "@xyflow/react";
import { ConnectorInstanceLabel } from "@/components/library/ConnectorInstanceLabel";
import { containerTitleHeight, GROUP_HEADER_H } from "../graphLayout";

const CONTAINER_BG = "#141414";
const CONTAINER_BORDER = "#2a2a2a";
const GROUP_BG = "#101010";
const PIN_BG = "#1b1b1b";
const PIN_BORDER = "#2a2a2a";
const MUTED = "#9ca3af";
const ACCENT = "#7db4ff";

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

/** Titled outer box for a vehicle item, node, or enclosure panel group. */
export function ContainerNode({ data }: NodeProps) {
  const label = asString(data?.label);
  const templateLabel =
    typeof data?.templateLabel === "string" ? data.templateLabel : null;
  const hideTitle = data?.hideTitle === true;
  const titleHeight = containerTitleHeight(data as Record<string, unknown> | undefined);
  if (hideTitle) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "transparent",
          boxSizing: "border-box",
          pointerEvents: "none",
        }}
      />
    );
  }
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: CONTAINER_BG,
        border: `1px solid ${CONTAINER_BORDER}`,
        borderRadius: 8,
        color: "#e8e8e8",
        boxSizing: "border-box",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          boxSizing: "border-box",
          height: titleHeight,
          minHeight: titleHeight,
          padding: "7px 12px",
          fontSize: 12,
          fontWeight: 600,
          borderBottom: `1px solid ${CONTAINER_BORDER}`,
          overflow: "hidden",
          pointerEvents: "all",
          cursor: "grab",
        }}
      >
        <ConnectorInstanceLabel
          label={label}
          templateLabel={templateLabel}
          stacked={Boolean(templateLabel)}
        />
      </div>
    </div>
  );
}

/** Bordered sub-box grouping the pins of a single connector. Dotted for pigtails. */
export function ConnectorGroupNode({ data }: NodeProps) {
  const label = asString(data?.label);
  const templateLabel =
    typeof data?.templateLabel === "string" ? data.templateLabel : null;
  const slotKey = typeof data?.slotKey === "string" ? data.slotKey : null;
  const dotted = data?.groupBorder === "dotted" || data?.isPigtail === true;
  const isPanelMount = data?.isPanelMount === true;
  const isPigtail = data?.isPigtail === true;
  const isInline = data?.isInline === true;
  const tag = isPigtail ? "pigtail" : isPanelMount ? "panel" : isInline ? "inline" : null;
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: GROUP_BG,
        border: dotted ? `1px dotted ${MUTED}` : `1px solid #374151`,
        borderRadius: 6,
        color: "#e8e8e8",
        boxSizing: "border-box",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          boxSizing: "border-box",
          height: GROUP_HEADER_H,
          minHeight: GROUP_HEADER_H,
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "3px 8px",
          fontSize: 11,
          fontWeight: 600,
          whiteSpace: "nowrap",
          overflow: "hidden",
        }}
      >
        {slotKey && (
          <span
            style={{
              flexShrink: 0,
              borderRadius: 3,
              background: "#2a2a2a",
              padding: "1px 5px",
              fontFamily: "monospace",
              fontSize: 10,
              fontWeight: 500,
              color: "#e8e8e8",
            }}
          >
            {slotKey}
          </span>
        )}
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            minWidth: 0,
            flex: "1 1 auto",
          }}
        >
          <ConnectorInstanceLabel label={label} templateLabel={templateLabel} />
        </span>
        {tag && (
          <span style={{ marginLeft: "auto", fontSize: 9, fontWeight: 400, color: MUTED }}>{tag}</span>
        )}
      </div>
    </div>
  );
}

/** Compact pin row: number, name, net. Right-edge handle for wiring. */
export function PinPortNode({ data }: NodeProps) {
  const pinNumber = data?.pinNumber ?? asString(data?.label);
  const pinName = asString(data?.pinName);
  const netName = asString(data?.netName, "UNASSIGNED");
  const unassigned = netName === "UNASSIGNED" || netName === "";
  const showName = pinName && pinName !== String(pinNumber);
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "0 10px 0 6px",
        fontSize: 10,
        background: PIN_BG,
        border: `1px solid ${PIN_BORDER}`,
        borderRadius: 4,
        color: "#e8e8e8",
        boxSizing: "border-box",
        pointerEvents: "all",
      }}
    >
      <span style={{ fontFamily: "monospace", color: MUTED, flexShrink: 0 }}>{String(pinNumber)}</span>
      {showName && (
        <span
          style={{
            flex: "1 1 auto",
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {pinName}
        </span>
      )}
      <span
        style={{
          marginLeft: showName ? 0 : "auto",
          maxWidth: "55%",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          color: unassigned ? "#6b7280" : ACCENT,
          flexShrink: 0,
        }}
        title={netName}
      >
        {unassigned ? "—" : netName}
      </span>
      <Handle
        type="target"
        position={Position.Right}
        style={{ width: 8, height: 8, background: MUTED, border: "none" }}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{ width: 8, height: 8, background: MUTED, border: "none" }}
      />
    </div>
  );
}

/** Connector-level pin box (net assignment view, no wiring). */
export function ConnectorPinBoxNode({ data }: NodeProps) {
  const pinNumber = data?.pinNumber ?? "";
  const pinName = asString(data?.pinName);
  const netName = asString(data?.netName, "UNASSIGNED");
  const unassigned = netName === "UNASSIGNED" || netName === "";
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        gap: 2,
        padding: "8px 10px",
        fontSize: 11,
        background: PIN_BG,
        border: `1px solid ${PIN_BORDER}`,
        borderRadius: 6,
        color: "#e8e8e8",
        boxSizing: "border-box",
      }}
    >
      <span style={{ fontFamily: "monospace", color: MUTED }}>
        #{String(pinNumber)} {pinName}
      </span>
      <span style={{ color: unassigned ? "#6b7280" : ACCENT }}>{unassigned ? "— unassigned" : netName}</span>
    </div>
  );
}

export function PinNode({ data }: NodeProps) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        padding: "8px 12px",
        fontSize: 12,
        background: CONTAINER_BG,
        border: `1px solid ${CONTAINER_BORDER}`,
        borderRadius: 6,
        color: "#e8e8e8",
        boxSizing: "border-box",
      }}
    >
      {asString(data?.label)}
    </div>
  );
}

export const nodeTypes = {
  vehicleItem: ContainerNode,
  nodeItem: ContainerNode,
  enclosurePanelItem: ContainerNode,
  connectorGroup: ConnectorGroupNode,
  pinPort: PinPortNode,
  connectorPinBox: ConnectorPinBoxNode,
  pin: PinNode,
};

export const CONTAINER_KINDS = new Set(["vehicleItem", "nodeItem", "enclosurePanelItem"]);
