import { SegmentedControl, type SegmentOption } from "@/components/ui/SegmentedControl";
import { useAppStore, type GraphSubMode } from "@/stores/appStore";

const OPTIONS: SegmentOption<GraphSubMode>[] = [
  { value: "canvas", label: "Canvas" },
  { value: "graph", label: "Graph" },
];

/**
 * Two-state segmented control that switches Design_Mode between the detailed
 * wiring canvas (`"canvas"`) and the high-level topology graph (`"graph"`).
 *
 * Reads/writes `graphSubMode` from the Zustand appStore. Rendered only while
 * `mode === "design"` (the toggle is hidden in manufacturing mode, Req 1.6).
 *
 * Requirements: 1.1, 1.6
 */
export function CanvasGraphToggle() {
  const mode = useAppStore((s) => s.mode);
  const graphSubMode = useAppStore((s) => s.graphSubMode);
  const setGraphSubMode = useAppStore((s) => s.setGraphSubMode);

  if (mode !== "design") return null;

  return (
    <SegmentedControl
      value={graphSubMode}
      onChange={setGraphSubMode}
      options={OPTIONS}
      ariaLabel="Design view mode"
    />
  );
}
