import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";

/** Edge that shows its label, and a delete (×) button when selected. */
export function DeletableEdge({
  id,
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
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  const onDelete = (data as { onDelete?: () => void } | undefined)?.onDelete;

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
      <EdgeLabelRenderer>
        <div
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: "all",
          }}
          className="nodrag nopan flex items-center gap-1"
        >
          {label && (
            <span className="rounded bg-tesla-bg/90 px-1 text-[9px] leading-tight text-tesla-muted">
              {label}
            </span>
          )}
          {selected && onDelete && (
            <button
              type="button"
              title="Delete"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="flex h-4 w-4 items-center justify-center rounded-full border border-tesla-accent bg-tesla-bg text-[10px] leading-none text-tesla-accent hover:bg-tesla-accent hover:text-white"
            >
              ×
            </button>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export const edgeTypes = { deletable: DeletableEdge };
