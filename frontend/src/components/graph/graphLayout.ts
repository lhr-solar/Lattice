import type { DesignNodeDto } from "@/api/types";

/** Shared nested-layout constants (px). Keep in sync with node chrome styles. */
export const PIN_ROW_H = 20;
export const GROUP_HEADER_H = 28;
export const GROUP_BOTTOM_PAD = 8;
export const GROUP_WIDTH = 248;
export const GROUP_GAP = 10;
export const PIN_INNER_PAD = 8;
export const PIN_PORT_WIDTH = GROUP_WIDTH - PIN_INNER_PAD * 2;
export const PIN_PORT_H = PIN_ROW_H - 3;
export const CONTAINER_PAD_X = 14;
/** Single-line container title (e.g. Panel / Pigtail). */
export const CONTAINER_TITLE_H = 34;
/** Stacked nickname + template label on nodes and enclosures. */
export const CONTAINER_TITLE_STACKED_H = 52;
export const CONTAINER_PAD_BOTTOM = 14;
/** Space between container title bar and first connector group. */
export const CONTAINER_TITLE_GAP = 10;
export const CONTAINER_STACK_GAP = 48;

/** Flow-view placement for top-level containers. */
export const FLOW_ORIGIN_X = 96;
export const FLOW_ORIGIN_Y = 88;
/** Horizontal corridor between columns — room to route wires between boxes. */
export const FLOW_GAP_X = 140;
/** Vertical gap between stacked containers in the same column. */
export const FLOW_GAP_Y = 96;
/** Middle column starts slightly lower in 3+ column layouts for an asymmetric feel. */
export const FLOW_COLUMN_DROP = 36;

function flowColumnCount(itemCount: number): number {
  if (itemCount <= 1) return 1;
  if (itemCount <= 2) return 2;
  if (itemCount <= 5) return 2;
  if (itemCount <= 9) return 3;
  return 4;
}

export function containerFlowRank(container: DesignNodeDto): number {
  if (container.id.startsWith("enclosure-panel:")) return 0;
  if (container.id.startsWith("enclosure:")) return 1;
  if (container.id.startsWith("node:")) return 2;
  if (container.id.startsWith("inline:")) return 3;
  return 4;
}

export interface ContainerLayoutPlan {
  container: DesignNodeDto;
  containerWidth: number;
  containerHeight: number;
  position: { x: number; y: number };
}

/** Pack containers into a loose multi-column flow (shortest-column masonry). */
export function layoutContainerFlow<T extends ContainerLayoutPlan>(plans: T[]): void {
  if (plans.length === 0) return;

  const sorted = [...plans].sort((a, b) => {
    const rankDiff = containerFlowRank(a.container) - containerFlowRank(b.container);
    if (rankDiff !== 0) return rankDiff;
    return a.container.label.localeCompare(b.container.label);
  });

  const colWidth = Math.max(...sorted.map((p) => p.containerWidth));
  const colCount = flowColumnCount(sorted.length);

  const colHeights = Array.from({ length: colCount }, () => FLOW_ORIGIN_Y);
  if (colCount >= 3) {
    colHeights[1] += FLOW_COLUMN_DROP;
  }

  const colX = (index: number) => FLOW_ORIGIN_X + index * (colWidth + FLOW_GAP_X);

  for (const plan of sorted) {
    let col = 0;
    for (let i = 1; i < colCount; i++) {
      if (colHeights[i] < colHeights[col]) col = i;
    }
    plan.position = { x: colX(col), y: colHeights[col] };
    colHeights[col] += plan.containerHeight + FLOW_GAP_Y;
  }
}

/** @deprecated Use layoutContainerFlow. */
export function reflowContainerColumns<T extends ContainerLayoutPlan>(plans: T[]): void {
  layoutContainerFlow(plans);
}

export function containerTitleHeight(data: Record<string, unknown> | undefined): number {
  if (data?.hideTitle === true) return 0;
  if (typeof data?.templateLabel === "string") return CONTAINER_TITLE_STACKED_H;
  return CONTAINER_TITLE_H;
}

export function measureContainer(
  container: DesignNodeDto,
  groups: DesignNodeDto[],
  portsByParent: Map<string, DesignNodeDto[]>,
) {
  const containerData = container.data ?? undefined;
  const titleH = containerTitleHeight(containerData);
  let cy = titleH + (titleH > 0 ? CONTAINER_TITLE_GAP : 0);
  const groupLayouts = groups.map((group) => {
    const ports = portsByParent.get(group.id) ?? [];
    const height = GROUP_HEADER_H + Math.max(ports.length, 1) * PIN_ROW_H + GROUP_BOTTOM_PAD;
    const layout = { group, ports, y: cy, height };
    cy += height + GROUP_GAP;
    return layout;
  });
  const contentBottom = groups.length ? cy - GROUP_GAP : titleH + 24;
  const containerHeight = contentBottom + (titleH > 0 ? CONTAINER_PAD_BOTTOM : 0);
  const containerWidth = CONTAINER_PAD_X * 2 + GROUP_WIDTH;
  return { titleH, groupLayouts, containerWidth, containerHeight };
}
