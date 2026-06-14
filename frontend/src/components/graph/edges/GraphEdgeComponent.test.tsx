// @vitest-environment jsdom
/**
 * Component (example) tests for the Topology Graph View custom edge
 * (`GraphEdgeComponent`). Part of task 10.3.
 *
 * Covers the edge-visual acceptance criteria:
 *   - Req 6.3 curved bezier line attaching to source/target center coordinates
 *   - Req 6.4 wire_count badge shown only when wire_count > 1 (absent at 1)
 *   - Req 6.5 dark-mode accent edge color #7db4ff
 *
 * `BaseEdge` and `EdgeLabelRenderer` rely on ReactFlow's internal store/portal
 * which is unavailable when rendering a custom edge in isolation, so we replace
 * them with inert DOM stand-ins that expose the path and label content. The
 * *real* `getBezierPath` is kept (it is a pure geometry function), so the path
 * we assert against is the exact curve the component produces in the canvas.
 *
 * Framework: Vitest + @testing-library/react.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

vi.mock("@xyflow/react", async (importActual) => {
  const actual = await importActual<typeof import("@xyflow/react")>();
  return {
    ...actual,
    // Render the computed bezier `path` and its style so the test can inspect
    // the real geometry produced by the kept `getBezierPath`.
    BaseEdge: (props: { path: string; style?: React.CSSProperties }) => (
      <svg>
        <path data-testid="edge-path" d={props.path} style={props.style} />
      </svg>
    ),
    // Portal-less stand-in: just render the badge children inline.
    EdgeLabelRenderer: (props: { children?: React.ReactNode }) => (
      <div data-testid="edge-label-layer">{props.children}</div>
    ),
  };
});

import { GraphEdgeComponent, type GraphEdgeData } from "./GraphEdgeComponent";
import { Position, type EdgeProps } from "@xyflow/react";

afterEach(() => cleanup());

function normalize(prop: string, value: string): string {
  const probe = document.createElement("div");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (probe.style as any)[prop] = value;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (probe.style as any)[prop];
}

function renderEdge(
  data: Partial<GraphEdgeData>,
  coords?: Partial<EdgeProps>,
): void {
  const props = {
    id: "tg-edge:a:b",
    source: "a",
    target: "b",
    sourceX: 0,
    sourceY: 0,
    targetX: 100,
    targetY: 80,
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
    data: { wireCount: 1, highlight: "none", ...data },
    ...coords,
  } as unknown as EdgeProps;
  render(<GraphEdgeComponent {...props} />);
}

// --- Req 6.3 / 6.5: bezier path + accent color -----------------------------

describe("GraphEdgeComponent path (Req 6.3, 6.5)", () => {
  it("renders a cubic bezier path anchored at the provided source coordinates", () => {
    renderEdge({}, { sourceX: 10, sourceY: 20, targetX: 200, targetY: 140 });
    const path = screen.getByTestId("edge-path");
    const d = path.getAttribute("d") ?? "";
    // getBezierPath emits "M{sourceX},{sourceY} C..." — a cubic ("C") curve
    // whose endpoint is the source node's (center-handle) coordinate.
    expect(d.startsWith("M10,20")).toBe(true);
    expect(d).toContain("C");
  });

  it("strokes the edge with the dark-mode accent color #7db4ff", () => {
    renderEdge({});
    const path = screen.getByTestId("edge-path");
    expect(path.style.stroke).toBe(normalize("color", "#7db4ff"));
  });
});

// --- Req 6.4: wire_count badge ---------------------------------------------

describe("GraphEdgeComponent wire_count badge (Req 6.4)", () => {
  it("shows the wire_count badge when wire_count > 1", () => {
    renderEdge({ wireCount: 5 });
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("renders no badge when wire_count is exactly 1", () => {
    renderEdge({ wireCount: 1 });
    expect(screen.queryByTestId("edge-label-layer")).not.toBeInTheDocument();
    expect(screen.queryByText("1")).not.toBeInTheDocument();
  });

  it("shows the exact count for higher wire counts", () => {
    renderEdge({ wireCount: 42 });
    expect(screen.getByText("42")).toBeInTheDocument();
  });
});
