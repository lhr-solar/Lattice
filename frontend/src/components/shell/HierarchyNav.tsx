import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { fetchHierarchy, type HierarchyNode } from "@/api/hierarchy";
import { deleteConnector, deleteEnclosure, deletePcb } from "@/api/instances";
import { fetchVehicles } from "@/api/vehicles";
import { handleMutationError } from "@/lib/mutationErrors";
import { useAppStore } from "@/stores/appStore";
import type { ProjectionLevel } from "@/api/types";
import { ConfirmModal } from "@/components/ui/Modal";
import { ConnectorInstanceLabel, connectorNodeTitle } from "@/components/library/ConnectorInstanceLabel";
import { HierarchyIcon } from "@/components/shell/HierarchyIcons";
import {
  RenameInstanceModal,
  type RenameInstanceKind,
} from "@/features/design/RenameInstanceModal";
import { PinoutEditorModal } from "@/features/nets/PinoutEditorPanel";

function TreeNode({
  node,
  depth = 0,
  collapsedIds,
  onToggleCollapse,
  onSelect,
  selectedId,
  onRequestDelete,
  onRequestEdit,
}: {
  node: HierarchyNode;
  depth?: number;
  collapsedIds: Set<string>;
  onToggleCollapse: (id: string) => void;
  onSelect: (id: string, kind: string, level: ProjectionLevel) => void;
  selectedId: string | null;
  onRequestDelete: (node: HierarchyNode) => void;
  onRequestEdit: (node: HierarchyNode) => void;
}) {
  const levelMap: Record<string, ProjectionLevel> = {
    vehicle: "vehicle",
    enclosure: "enclosure",
    pcb: "enclosure",
    node: "node",
    connector: "connector",
    inlineConnector: "connector",
    panelMount: "connector",
  };
  const hasChildren = node.children.length > 0;
  const isVehicle = node.kind === "vehicle";
  const isCollapsed = !isVehicle && collapsedIds.has(node.id);
  const canDelete = !isVehicle;
  const canCollapse = hasChildren && !isVehicle;
  const canEdit =
    node.kind === "enclosure" ||
    node.kind === "node" ||
    node.kind === "pcb" ||
    node.kind === "connector" ||
    node.kind === "inlineConnector" ||
    node.kind === "panelMount";

  const hasTemplateLabel = Boolean(node.template_label);
  const isConnector =
    node.kind === "connector" || node.kind === "panelMount" || node.kind === "inlineConnector";
  const showStackedLabel =
    isConnector || node.kind === "enclosure" || node.kind === "node";
  const title = hasTemplateLabel || isConnector
    ? connectorNodeTitle(node.label, node.template_label)
    : node.label;
  const editTitle =
    node.kind === "enclosure" || node.kind === "node" || node.kind === "pcb"
      ? `Rename ${title}`
      : `Edit pinout for ${title}`;

  return (
    <li>
      <div
        className={clsx(
          "flex items-center gap-0.5 rounded-md pr-1 transition",
          selectedId === node.id
            ? "bg-tesla-accent/15 text-tesla-text"
            : "text-tesla-muted hover:bg-tesla-border/50 hover:text-tesla-text",
          node.kind === "vehicle" && "font-medium text-tesla-text",
        )}
      >
        {isVehicle ? (
          <span className="w-2 shrink-0" aria-hidden />
        ) : (
          <span
            style={{ width: `${depth * 12 + 4}px` }}
            className="shrink-0"
            aria-hidden
          />
        )}
        {canCollapse ? (
          <button
            type="button"
            aria-label={isCollapsed ? "Expand" : "Collapse"}
            onClick={(e) => {
              e.stopPropagation();
              onToggleCollapse(node.id);
            }}
            className="shrink-0 rounded p-0.5 text-tesla-muted transition hover:bg-tesla-border/50 hover:text-tesla-text"
          >
            <ChevronIcon expanded={!isCollapsed} />
          </button>
        ) : (
          !isVehicle && <span className="w-[18px] shrink-0" aria-hidden />
        )}
        <button
          type="button"
          onClick={() => {
            const level = levelMap[node.kind];
            if (level) onSelect(node.id, node.kind, level);
          }}
          className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 text-left text-sm"
          title={title}
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
        {canEdit ? (
          <button
            type="button"
            title={editTitle}
            className="shrink-0 rounded px-1 py-0.5 text-xs text-tesla-muted transition hover:bg-tesla-border hover:text-tesla-text"
            onClick={(e) => {
              e.stopPropagation();
              onRequestEdit(node);
            }}
          >
            <PencilIcon />
          </button>
        ) : (
          <span className="w-[22px] shrink-0" aria-hidden />
        )}
        {canDelete ? (
          <button
            type="button"
            title={`Delete ${title}`}
            className="shrink-0 rounded px-1.5 py-0.5 text-xs text-tesla-muted transition hover:bg-tesla-border hover:text-tesla-text"
            onClick={(e) => {
              e.stopPropagation();
              onRequestDelete(node);
            }}
          >
            🗑
          </button>
        ) : (
          <span className="w-[26px] shrink-0" aria-hidden />
        )}
      </div>
      {hasChildren && !isCollapsed && (
        <ul>
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              collapsedIds={collapsedIds}
              onToggleCollapse={onToggleCollapse}
              onSelect={onSelect}
              selectedId={selectedId}
              onRequestDelete={onRequestDelete}
              onRequestEdit={onRequestEdit}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function VehiclesList({
  vehicles,
  vehicleId,
  isLoading,
  onSelect,
  compact = false,
}: {
  vehicles: {
    id: string;
    name: string;
    current_revision_id: string | null;
    current_revision_number?: number | null;
    current_revision_label?: string | null;
  }[];
  vehicleId: string | null;
  isLoading: boolean;
  onSelect: (vehicleId: string, revisionId: string) => void;
  compact?: boolean;
}) {
  return (
    <ul className={clsx("overflow-y-auto border-b border-tesla-border", compact ? "max-h-28 p-1.5" : "max-h-36 p-2")}>
      {isLoading && <li className="px-2 py-1 text-sm text-tesla-muted">Loading…</li>}
      {vehicles.map((v) => {
        const revisionBadge =
          v.current_revision_number != null ? `R${v.current_revision_number}` : null;
        const revisionTooltip =
          revisionBadge && v.current_revision_label?.trim()
            ? `${revisionBadge} | ${v.current_revision_label.trim()}`
            : revisionBadge;

        return (
          <li key={v.id}>
            <button
              type="button"
              disabled={!v.current_revision_id}
              onClick={() => {
                if (v.current_revision_id) onSelect(v.id, v.current_revision_id);
              }}
              className={clsx(
                "flex w-full items-center gap-2 rounded-md text-left transition disabled:cursor-not-allowed disabled:opacity-40",
                compact ? "px-1.5 py-1 text-xs" : "px-2 py-2 text-sm",
                vehicleId === v.id
                  ? "bg-tesla-accent/15 text-tesla-text"
                  : "text-tesla-muted hover:bg-tesla-border/50 hover:text-tesla-text",
              )}
              title={revisionTooltip ? `${v.name} — ${revisionTooltip}` : v.name}
            >
              <span className="min-w-0 flex-1 truncate">{v.name}</span>
              {v.current_revision_id && revisionBadge ? (
                <span className="flex shrink-0 items-center gap-1.5">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full bg-tesla-accent"
                    title="Current revision"
                    aria-hidden
                  />
                  <span className="text-xs text-tesla-muted">{revisionBadge}</span>
                </span>
              ) : null}
            </button>
          </li>
        );
      })}
      {!isLoading && vehicles.length === 0 && (
        <li className="px-2 py-1 text-sm text-tesla-muted">No vehicles</li>
      )}
    </ul>
  );
}

function UtilitiesButtons({
  disabled,
  compact = false,
  vertical = false,
}: {
  disabled: boolean;
  compact?: boolean;
  vertical?: boolean;
}) {
  const setShowLibraryManager = useAppStore((s) => s.setShowLibraryManager);
  const setShowNetManager = useAppStore((s) => s.setShowNetManager);
  const openPinTemplatesManage = useAppStore((s) => s.openPinTemplatesManage);
  const setLibraryTab = useAppStore((s) => s.setLibraryTab);

  const items = [
    { label: compact ? "Nodes" : "Node Library", tab: "node" as const, action: () => { setLibraryTab("node"); setShowLibraryManager(true); } },
    { label: compact ? "Encls" : "Enclosure Library", tab: "enclosure" as const, action: () => { setLibraryTab("enclosure"); setShowLibraryManager(true); } },
    { label: compact ? "Nets" : "Net Manager", action: () => setShowNetManager(true) },
    { label: "Pin templates", action: () => openPinTemplatesManage() },
  ];

  const btnCls = compact
    ? "rounded border border-tesla-border px-1 py-1 text-center text-[10px] leading-tight text-tesla-muted transition hover:border-tesla-accent hover:text-tesla-text disabled:opacity-40"
    : "rounded border border-tesla-border px-2 py-1 text-center text-xs leading-tight text-tesla-muted transition hover:border-tesla-accent hover:text-tesla-text disabled:opacity-40";

  return (
    <div className={clsx("border-b border-tesla-border", compact ? "p-1.5" : "p-2")}>
      {!compact && (
        <p className="mb-2 px-2 text-xs uppercase tracking-wider text-tesla-muted">Utilities</p>
      )}
      <div className={clsx(vertical ? "flex flex-col gap-1" : "grid grid-cols-2 gap-1")}>
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            disabled={disabled}
            className={btnCls}
            onClick={item.action}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function defaultCollapsedIds(root: HierarchyNode): Set<string> {
  return new Set(root.children.map((child) => child.id));
}

function allCollapsibleIds(root: HierarchyNode): Set<string> {
  const ids = new Set<string>();
  for (const child of root.children) {
    collectCollapsibleIds(child, ids);
  }
  return ids;
}

function collectCollapsibleIds(node: HierarchyNode, ids: Set<string>) {
  if (node.children.length > 0) {
    ids.add(node.id);
    for (const child of node.children) {
      collectCollapsibleIds(child, ids);
    }
  }
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 16 16" width={14} height={14} aria-hidden fill="currentColor">
      <path d="M11.7 1.3a1 1 0 0 1 1.4 0l1.6 1.6a1 1 0 0 1 0 1.4L5.8 12.6 2.4 13l.4-3.4L11.7 1.3zM4.3 12.1l-.2 1.5 1.5-.2 7.1-7.1-1.3-1.3-7.1 7.1z" />
    </svg>
  );
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


export function HierarchyNav() {
  const queryClient = useQueryClient();
  const mode = useAppStore((s) => s.mode);
  const vehicleId = useAppStore((s) => s.selectedVehicleId);
  const revisionId = useAppStore((s) => s.selectedRevisionId);
  const selectedNodeId = useAppStore((s) => s.selectedNodeId);
  const selectVehicle = useAppStore((s) => s.selectVehicle);
  const setFocus = useAppStore((s) => s.setFocus);
  const setProjectionLevel = useAppStore((s) => s.setProjectionLevel);
  const searchQuery = useAppStore((s) => s.searchQuery).toLowerCase();
  const [deleteTopologyTarget, setDeleteTopologyTarget] = useState<HierarchyNode | null>(null);
  const [renameTarget, setRenameTarget] = useState<{
    id: string;
    kind: RenameInstanceKind;
  } | null>(null);
  const [pinoutConnectorId, setPinoutConnectorId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [collapseKey, setCollapseKey] = useState<string | null>(null);

  const isManufacturing = mode === "manufacturing";

  const { data: vehicles = [], isLoading } = useQuery({
    queryKey: ["vehicles"],
    queryFn: fetchVehicles,
  });

  const { data: hierarchy } = useQuery({
    queryKey: ["hierarchy", vehicleId, revisionId],
    queryFn: () => fetchHierarchy(vehicleId!, revisionId!),
    enabled: Boolean(vehicleId && revisionId && !isManufacturing),
  });

  const hierarchyKey = vehicleId && revisionId ? `${vehicleId}:${revisionId}` : null;

  useEffect(() => {
    if (!hierarchy?.root || !hierarchyKey || collapseKey === hierarchyKey) return;
    setCollapsedIds(defaultCollapsedIds(hierarchy.root));
    setCollapseKey(hierarchyKey);
  }, [hierarchy, hierarchyKey, collapseKey]);

  const toggleCollapse = useCallback((id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const collapseAll = useCallback(() => {
    if (!hierarchy?.root) return;
    setCollapsedIds(allCollapsibleIds(hierarchy.root));
  }, [hierarchy]);

  const expandAll = useCallback(() => {
    setCollapsedIds(new Set());
  }, []);

  const deleteTopologyMutation = useMutation({
    mutationFn: async (node: HierarchyNode) => {
      if (!vehicleId || !revisionId) throw new Error("No vehicle selected");
      if (node.kind === "enclosure") {
        await deleteEnclosure(vehicleId, revisionId, node.id);
        return;
      }
      if (node.kind === "node" || node.kind === "pcb") {
        await deletePcb(vehicleId, revisionId, node.id);
        return;
      }
      if (node.kind === "connector" || node.kind === "panelMount" || node.kind === "inlineConnector") {
        await deleteConnector(vehicleId, revisionId, node.id);
        return;
      }
      throw new Error(`Cannot delete ${node.kind}`);
    },
    onSuccess: (_, node) => {
      const root = hierarchy?.root ?? null;
      const deletedNode = root ? findNode(root, node.id) : null;
      if (selectedNodeId && deletedNode && subtreeContains(deletedNode, selectedNodeId)) {
        setFocus(null);
        setProjectionLevel("vehicle");
      }
      queryClient.invalidateQueries({ queryKey: ["hierarchy"] });
      queryClient.invalidateQueries({ queryKey: ["design-projection"] });
      queryClient.invalidateQueries({ queryKey: ["topology-summary"] });
      queryClient.invalidateQueries({ queryKey: ["pins"] });
      queryClient.invalidateQueries({ queryKey: ["nets"] });
      queryClient.invalidateQueries({ queryKey: ["connection-table"] });
      setDeleteTopologyTarget(null);
      setDeleteError(null);
    },
    onError: (error) => setDeleteError(handleMutationError(error, "Failed to delete.")),
  });

  function handleNodeEdit(node: HierarchyNode) {
    if (node.kind === "enclosure") {
      setRenameTarget({ id: node.id, kind: "enclosure" });
      return;
    }
    if (node.kind === "node" || node.kind === "pcb") {
      setRenameTarget({ id: node.id, kind: "node" });
      return;
    }
    if (
      node.kind === "connector" ||
      node.kind === "inlineConnector" ||
      node.kind === "panelMount"
    ) {
      setPinoutConnectorId(node.id);
    }
  }

  function handleNodeSelect(id: string, kind: string, level: ProjectionLevel) {
    if (kind === "vehicle") {
      setProjectionLevel("vehicle");
      setFocus(null);
      return;
    }
    setProjectionLevel(level);
    setFocus(id, kind);
  }

  function handleVehicleSelect(vid: string, rid: string) {
    selectVehicle(vid, rid);
    setFocus(null);
    setProjectionLevel("vehicle");
    setCollapseKey(null);
  }

  const filteredRoot = useMemo(
    () => (hierarchy?.root ? filterTree(hierarchy.root, searchQuery) : null),
    [hierarchy, searchQuery],
  );

  const searchExpandedIds = useMemo(() => {
    if (!searchQuery || !filteredRoot) return collapsedIds;
    return new Set<string>();
  }, [searchQuery, filteredRoot, collapsedIds]);

  if (isManufacturing) {
    return null;
  }

  return (
    <>
      <nav
        className={clsx(
          "flex w-64 shrink-0 flex-col overflow-hidden border-r border-tesla-border bg-tesla-surface",
        )}
      >
        <div className="border-b border-tesla-border p-3">
          <span className="text-xs font-medium uppercase tracking-wider text-tesla-muted">
            Vehicles
          </span>
          {deleteError && <p className="mt-2 text-xs text-amber-200">{deleteError}</p>}
        </div>
        <VehiclesList
          vehicles={vehicles}
          vehicleId={vehicleId}
          isLoading={isLoading}
          onSelect={handleVehicleSelect}
        />
        <UtilitiesButtons disabled={!vehicleId} />
        <div className="flex-1 overflow-y-auto p-2">
          <div className="mb-2 flex items-center justify-between gap-1 px-2">
            <span className="text-xs uppercase tracking-wider text-tesla-muted">Topology</span>
            {filteredRoot && filteredRoot.children.length > 0 && !searchQuery && (
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={expandAll}
                  className="rounded px-1.5 py-0.5 text-[10px] text-tesla-muted transition hover:bg-tesla-border/50 hover:text-tesla-text"
                  title="Expand all"
                >
                  Expand all
                </button>
                <button
                  type="button"
                  onClick={collapseAll}
                  className="rounded px-1.5 py-0.5 text-[10px] text-tesla-muted transition hover:bg-tesla-border/50 hover:text-tesla-text"
                  title="Collapse all"
                >
                  Collapse all
                </button>
              </div>
            )}
          </div>
          {!vehicleId && <p className="px-2 text-sm text-tesla-muted">Select a vehicle</p>}
          {filteredRoot && (
            <ul>
              <TreeNode
                node={filteredRoot}
                collapsedIds={searchExpandedIds}
                onToggleCollapse={toggleCollapse}
                onSelect={handleNodeSelect}
                selectedId={selectedNodeId}
                onRequestDelete={setDeleteTopologyTarget}
                onRequestEdit={handleNodeEdit}
              />
            </ul>
          )}
          {vehicleId && !filteredRoot?.children?.length && hierarchy && (
            <p className="px-2 text-sm text-tesla-muted">No instances — use Design actions</p>
          )}
        </div>
      </nav>
      <ConfirmModal
        open={Boolean(deleteTopologyTarget)}
        title="Delete from topology"
        message={
          deleteTopologyTarget
            ? `Delete "${deleteTopologyTarget.label}"? Connected wires and child instances will be removed.`
            : ""
        }
        confirmLabel={deleteTopologyMutation.isPending ? "Deleting..." : "Delete"}
        destructive
        disabled={deleteTopologyMutation.isPending}
        onCancel={() => setDeleteTopologyTarget(null)}
        onConfirm={() => {
          if (!deleteTopologyTarget) return;
          deleteTopologyMutation.mutate(deleteTopologyTarget);
        }}
      />
      <RenameInstanceModal
        open={renameTarget !== null}
        instanceId={renameTarget?.id ?? null}
        kind={renameTarget?.kind ?? null}
        onClose={() => setRenameTarget(null)}
      />
      {pinoutConnectorId && (
        <PinoutEditorModal
          open
          connectorId={pinoutConnectorId}
          onClose={() => setPinoutConnectorId(null)}
        />
      )}
    </>
  );
}

function filterTree(node: HierarchyNode, query: string): HierarchyNode | null {
  if (!query) return node;
  const labelMatch = node.label.toLowerCase().includes(query);
  const templateMatch = node.template_label?.toLowerCase().includes(query) ?? false;
  const children = node.children
    .map((c) => filterTree(c, query))
    .filter((c): c is HierarchyNode => c !== null);
  if (labelMatch || templateMatch || children.length) {
    return { ...node, children };
  }
  return null;
}

function findNode(node: HierarchyNode, id: string): HierarchyNode | null {
  if (node.id === id) return node;
  for (const child of node.children) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

function subtreeContains(node: HierarchyNode, targetId: string): boolean {
  if (node.id === targetId) return true;
  return node.children.some((child) => subtreeContains(child, targetId));
}
