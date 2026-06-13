import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  useReactFlow,
  type EdgeProps,
} from "@xyflow/react";
import { useEffect, useState } from "react";
import clsx from "clsx";

type Point = { x: number; y: number };

const WIRE_HIT_WIDTH = 8;
const COLOR_HOVER = "#7dd3fc";
const COLOR_SELECTED = "#f97316";

/** Edge that shows its label and delete (×) button only when selected via click. */
export function DeletableEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  style,
  data,
  label,
  selected,
}: EdgeProps) {
  const [anchor, setAnchor] = useState<Point | null>(null);
  const [hovered, setHovered] = useState(false);
  const { screenToFlowPosition, flowToScreenPosition } = useReactFlow();
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  const edgeData = data as { onDelete?: () => void; onSelect?: () => void } | undefined;
  const onDelete = edgeData?.onDelete;
  const onSelect = edgeData?.onSelect;
  const fallback = { x: labelX, y: labelY };
  const ui = anchor ?? fallback;
  const deleteAbove = flowToScreenPosition(ui).y > 40;
  const baseStroke = (style?.stroke as string | undefined) ?? "#6b6b6b";
  const baseWidth = (style?.strokeWidth as number | undefined) ?? 1.5;
  const strokeColor = selected ? COLOR_SELECTED : hovered ? COLOR_HOVER : baseStroke;
  const strokeWidth = selected ? 2.5 : hovered ? 2 : baseWidth;

  useEffect(() => {
    if (!selected) setAnchor(null);
  }, [selected]);

  function pointFromEvent(clientX: number, clientY: number): Point {
    return screenToFlowPosition({ x: clientX, y: clientY });
  }

  return (
    <>
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        interactionWidth={0}
        style={{
          ...style,
          stroke: strokeColor,
          strokeWidth,
          transition: "stroke 120ms ease, stroke-width 120ms ease",
        }}
      />
      {/* Narrow hit target — captures click position along the wire */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={WIRE_HIT_WIDTH}
        className="deletable-edge-hit"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={(e) => {
          e.stopPropagation();
          setAnchor(pointFromEvent(e.clientX, e.clientY));
          onSelect?.();
        }}
      />
      {selected && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${ui.x}px, ${ui.y}px)`,
              pointerEvents: "all",
              zIndex: 1000,
            }}
            className="nodrag nopan"
          >
            {label ? (
              <span className="block max-w-48 rounded border border-tesla-border bg-tesla-bg px-1.5 py-0.5 text-[10px] leading-tight text-tesla-text shadow-sm">
                <span className="truncate">{label}</span>
              </span>
            ) : null}

            {onDelete && (
              <button
                type="button"
                title="Remove wire"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className={clsx(
                  "absolute left-1/2 flex h-5 w-5 -translate-x-1/2 cursor-pointer items-center justify-center rounded-full border border-red-500/80 bg-tesla-bg text-[11px] leading-none text-red-400 shadow-md transition hover:border-red-500 hover:bg-red-500 hover:text-white",
                  deleteAbove ? "-top-1 -translate-y-full" : "-bottom-1 translate-y-full",
                )}
              >
                ×
              </button>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const edgeTypes = { deletable: DeletableEdge };
