import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import type { HierarchyNode } from "@/api/hierarchy";
import type { NetPinInfo } from "@/api/nets";
import { ConnectorInstanceLabel } from "@/components/library/ConnectorInstanceLabel";
import { HierarchyIcon } from "@/components/shell/HierarchyIcons";

const CONNECTOR_NODE_KINDS = new Set(["connector", "panelMount", "inlineConnector"]);

export function isConnectorHierarchyNode(node: HierarchyNode): boolean {
  return CONNECTOR_NODE_KINDS.has(node.kind);
}

export function buildAvailableConnectorIds(
  allPins: NetPinInfo[],
  excludeConnectorId: string,
): Set<string> {
  const ids = new Set<string>();
  for (const pin of allPins) {
    if (pin.connector_instance_id !== excludeConnectorId) {
      ids.add(pin.connector_instance_id);
    }
  }
  return ids;
}

/** Keep hierarchy branches that lead to at least one selectable connector. */
export function filterHierarchyForDestinationPicker(
  node: HierarchyNode,
  availableConnectorIds: Set<string>,
): HierarchyNode | null {
  if (isConnectorHierarchyNode(node)) {
    return availableConnectorIds.has(node.id) ? { ...node, children: [] } : null;
  }
  const children = node.children
    .map((child) => filterHierarchyForDestinationPicker(child, availableConnectorIds))
    .filter((child): child is HierarchyNode => child !== null);
  if (node.kind === "vehicle") {
    return { ...node, children };
  }
  if (children.length === 0) return null;
  return { ...node, children };
}

function collectExpandableIds(node: HierarchyNode, ids: Set<string> = new Set()): Set<string> {
  if (!isConnectorHierarchyNode(node) && node.children.length > 0) {
    ids.add(node.id);
    for (const child of node.children) {
      collectExpandableIds(child, ids);
    }
  }
  return ids;
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={14}
      height={14}
      aria-hidden
      className={clsx("transition-transform", expanded && "rotate-90")}
    >
      <path
        fill="currentColor"
        d="M6.2 3.8a.6.6 0 0 1 .9 0l4.2 4.2a.6.6 0 0 1 0 .9l-4.2 4.2a.6.6 0 0 1-.9-.9L9.9 8 6.2 4.7a.6.6 0 0 1 0-.9Z"
      />
    </svg>
  );
}

function TreeNodeRow({
  node,
  depth,
  expandedIds,
  onToggleExpand,
  selectedConnectorId,
  onSelectConnector,
}: {
  node: HierarchyNode;
  depth: number;
  expandedIds: Set<string>;
  onToggleExpand: (id: string) => void;
  selectedConnectorId: string;
  onSelectConnector: (connectorId: string) => void;
}) {
  const isConnector = isConnectorHierarchyNode(node);
  const hasChildren = node.children.length > 0;
  const isExpanded = expandedIds.has(node.id);
  const isSelected = isConnector && selectedConnectorId === node.id;
  const showStackedLabel =
    isConnector || node.kind === "enclosure" || node.kind === "node";

  return (
    <li>
      <div
        className={clsx(
          "flex items-center gap-0.5 rounded-md pr-1",
          isSelected ? "bg-tesla-accent/15 text-tesla-text" : "text-tesla-muted",
        )}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            aria-label={isExpanded ? "Collapse" : "Expand"}
            onClick={() => onToggleExpand(node.id)}
            className="shrink-0 rounded p-0.5 text-tesla-muted transition hover:bg-tesla-border/50 hover:text-tesla-text"
          >
            <ChevronIcon expanded={isExpanded} />
          </button>
        ) : (
          <span className="w-[18px] shrink-0" aria-hidden />
        )}
        <button
          type="button"
          disabled={!isConnector}
          onClick={() => {
            if (isConnector) onSelectConnector(node.id);
          }}
          className={clsx(
            "flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left text-sm transition",
            isConnector
              ? "hover:text-tesla-text"
              : "cursor-default font-medium text-tesla-text",
            node.kind === "vehicle" && "font-medium",
          )}
        >
          <HierarchyIcon kind={node.kind} className="shrink-0 opacity-70" />
          {showStackedLabel ? (
            <ConnectorInstanceLabel
              label={node.label}
              templateLabel={node.template_label}
              stacked
              className="min-w-0 flex-1"
            />
          ) : (
            <span className="truncate">{node.label}</span>
          )}
        </button>
      </div>
      {hasChildren && isExpanded && (
        <ul>
          {node.children.map((child) => (
            <TreeNodeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              expandedIds={expandedIds}
              onToggleExpand={onToggleExpand}
              selectedConnectorId={selectedConnectorId}
              onSelectConnector={onSelectConnector}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function TopologyDestinationPicker({
  hierarchyRoot,
  allPins,
  excludeConnectorId,
  selectedConnectorId,
  onSelectConnector,
  existingTargetPinIds,
  onSelectPin,
  connectPending = false,
}: {
  hierarchyRoot: HierarchyNode | null | undefined;
  allPins: NetPinInfo[];
  excludeConnectorId: string;
  selectedConnectorId: string;
  onSelectConnector: (connectorId: string) => void;
  existingTargetPinIds: Set<string>;
  onSelectPin: (pinId: string) => void;
  connectPending?: boolean;
}) {
  const filteredRoot = useMemo(() => {
    if (!hierarchyRoot) return null;
    const available = buildAvailableConnectorIds(allPins, excludeConnectorId);
    return filterHierarchyForDestinationPicker(hierarchyRoot, available);
  }, [allPins, excludeConnectorId, hierarchyRoot]);

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [initializedKey, setInitializedKey] = useState<string | null>(null);

  useEffect(() => {
    if (filteredRoot && filteredRoot.id !== initializedKey) {
      setExpandedIds(collectExpandableIds(filteredRoot));
      setInitializedKey(filteredRoot.id);
    }
  }, [filteredRoot, initializedKey]);

  const pinsByConnector = useMemo(() => {
    const map = new Map<string, NetPinInfo[]>();
    for (const pin of allPins) {
      if (pin.connector_instance_id === excludeConnectorId) continue;
      const list = map.get(pin.connector_instance_id) ?? [];
      list.push(pin);
      map.set(pin.connector_instance_id, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.pin_number - b.pin_number);
    }
    return map;
  }, [allPins, excludeConnectorId]);

  const targetPins = selectedConnectorId ? (pinsByConnector.get(selectedConnectorId) ?? []) : [];

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (!hierarchyRoot) {
    return <p className="text-xs text-tesla-muted">Loading vehicle topology…</p>;
  }

  if (!filteredRoot || filteredRoot.children.length === 0) {
    return <p className="text-xs text-tesla-muted">No other connectors in this revision.</p>;
  }

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div>
        <p className="mb-1 text-[11px] uppercase tracking-wide text-tesla-muted">
          Target location
        </p>
        <div className="max-h-52 overflow-y-auto rounded border border-tesla-border bg-tesla-bg/40 p-1">
          <ul>
            <TreeNodeRow
              node={filteredRoot}
              depth={0}
              expandedIds={expandedIds}
              onToggleExpand={toggleExpand}
              selectedConnectorId={selectedConnectorId}
              onSelectConnector={onSelectConnector}
            />
          </ul>
        </div>
      </div>

      {selectedConnectorId ? (
        <div>
          <p className="mb-1 text-[11px] uppercase tracking-wide text-tesla-muted">Target pin</p>
          <ul className="max-h-40 overflow-y-auto rounded border border-tesla-border bg-tesla-bg/40">
            {targetPins.map((pin) => {
              const already = existingTargetPinIds.has(pin.pin_id);
              return (
                <li key={pin.pin_id}>
                  <button
                    type="button"
                    disabled={already || connectPending}
                    onClick={() => onSelectPin(pin.pin_id)}
                    className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-sm transition hover:bg-tesla-border/40 disabled:opacity-40"
                  >
                    <span>
                      #{pin.pin_number} {pin.pin_name}
                    </span>
                    <span className="text-xs text-tesla-muted">
                      {already ? "linked" : (pin.primary_net_name ?? "")}
                    </span>
                  </button>
                </li>
              );
            })}
            {targetPins.length === 0 && (
              <li className="px-2 py-1 text-xs text-tesla-muted">No pins</li>
            )}
          </ul>
        </div>
      ) : (
        <p className="text-xs text-tesla-muted">Select a connector in the tree above.</p>
      )}
    </div>
  );
}
