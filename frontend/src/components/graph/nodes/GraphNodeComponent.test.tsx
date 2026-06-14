// @vitest-environment jsdom
/**
 * Component (example) tests for the Topology Graph View custom node
 * (`GraphNodeComponent`). Part of task 10.3.
 *
 * Covers the node-visual acceptance criteria:
 *   - Req 6.1 enclosure vs PCB background colors
 *   - Req 6.2 label at 13px, template_label at 11px / #8899aa (and omitted when null)
 *   - Req 6.5 dark-mode colors (default border #2a2a2a, accent #7db4ff)
 *   - Req 6.7 selection border applies when selected, clears otherwise
 *
 * ReactFlow's `<Handle>` requires a live flow store/node context that is not
 * available when rendering a custom node in isolation. Since these assertions
 * target *our* node's own DOM/styles (not ReactFlow's handle internals), we
 * replace `Handle` with an inert stub. The component otherwise renders exactly
 * as it does inside the canvas.
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
    // Inert stand-in: the hidden center handle is ReactFlow plumbing, not part
    // of the visual contract under test here.
    Handle: (props: { type?: string }) => (
      <div data-testid="rf-handle" data-handle-type={props.type} />
    ),
  };
});

import { GraphNodeComponent, type GraphNodeData } from "./GraphNodeComponent";
import type { NodeProps } from "@xyflow/react";

afterEach(() => cleanup());

// --- helpers --------------------------------------------------------------

/**
 * Normalize a CSS value the same way jsdom does when React assigns it, so hex
 * literals in the component can be compared without worrying about the
 * rgb()/hex serialization jsdom applies.
 */
function normalize(prop: string, value: string): string {
  const probe = document.createElement("div");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (probe.style as any)[prop] = value;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (probe.style as any)[prop];
}

function renderNode(
  data: Partial<GraphNodeData>,
  selected = false,
): HTMLElement {
  const props = {
    id: "tg-node:1",
    data: {
      entity_kind: "enclosure_instance",
      label: "Node",
      template_label: null,
      highlight: "none",
      ...data,
    },
    selected,
  } as unknown as NodeProps;
  const { container } = render(<GraphNodeComponent {...props} />);
  return container.firstElementChild as HTMLElement;
}

// --- Req 6.1: type-distinguishing background colors ------------------------

describe("GraphNodeComponent backgrounds (Req 6.1)", () => {
  it("renders an enclosure node with background #1e2a3a", () => {
    const pill = renderNode({ entity_kind: "enclosure_instance" });
    expect(pill.style.background).toBe(normalize("background", "#1e2a3a"));
  });

  it("renders a PCB node with the distinct background #1a2e1a", () => {
    const pill = renderNode({ entity_kind: "pcb_instance" });
    expect(pill.style.background).toBe(normalize("background", "#1a2e1a"));
  });

  it("gives enclosure and PCB nodes different backgrounds", () => {
    const enclosure = renderNode({ entity_kind: "enclosure_instance" });
    cleanup();
    const pcb = renderNode({ entity_kind: "pcb_instance" });
    expect(pcb.style.background).not.toBe(
      normalize("background", "#1e2a3a"),
    );
  });
});

// --- Req 6.2: label + template_label text and sizes ------------------------

describe("GraphNodeComponent labels (Req 6.2)", () => {
  it("shows the label as primary text at 13px", () => {
    renderNode({ label: "BCM Front" });
    const label = screen.getByText("BCM Front");
    expect(label.style.fontSize).toBe("13px");
  });

  it("shows a non-null template_label as 11px secondary text in #8899aa", () => {
    renderNode({ label: "BCM Front", template_label: "Body Control Module" });
    const tmpl = screen.getByText("Body Control Module");
    expect(tmpl.style.fontSize).toBe("11px");
    expect(tmpl.style.color).toBe(normalize("color", "#8899aa"));
  });

  it("omits the template_label element entirely when it is null", () => {
    renderNode({ label: "Standalone PCB", template_label: null });
    expect(screen.getByText("Standalone PCB")).toBeInTheDocument();
    // No second text line is rendered when there is no template label.
    expect(
      screen.getByText("Standalone PCB").parentElement?.querySelectorAll("span")
        .length,
    ).toBe(1);
  });
});

// --- Req 6.5 / 6.7: dark-mode colors + selection border --------------------

describe("GraphNodeComponent border + selection (Req 6.5, 6.7)", () => {
  it("uses the dark-mode default border #2a2a2a when unselected", () => {
    const pill = renderNode({ highlight: "none" }, false);
    expect(pill.style.border).toBe(normalize("border", "1px solid #2a2a2a"));
  });

  it("applies a 2px solid #7db4ff selection border when selected (Req 6.7)", () => {
    const pill = renderNode({ highlight: "none" }, true);
    expect(pill.style.border).toBe(normalize("border", "2px solid #7db4ff"));
  });

  it("clears the selection border back to the default when not selected", () => {
    const pill = renderNode({ highlight: "none" }, false);
    expect(pill.style.border).not.toBe(
      normalize("border", "2px solid #7db4ff"),
    );
    expect(pill.style.border).toBe(normalize("border", "1px solid #2a2a2a"));
  });

  it("accents the border for a hovered/neighbor node (Req 6.6 styling)", () => {
    const pill = renderNode({ highlight: "active" }, false);
    expect(pill.style.border).toBe(normalize("border", "1px solid #7db4ff"));
  });
});
