import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import clsx from "clsx";
import { fetchHierarchy, type HierarchyNode } from "@/api/hierarchy";
import { deleteConnector, deleteEnclosure, deletePcb } from "@/api/instances";
import { fetchVehicles } from "@/api/vehicles";
import { useAppStore } from "@/stores/appStore";
import type { ProjectionLevel } from "@/api/types";
import { ConfirmModal } from "@/components/ui/Modal";
import { ConnectorInstanceLabel, connectorNodeTitle } from "@/components/library/ConnectorInstanceLabel";

function TreeNode({
  node,
  depth = 0,
  onSelect,
  selectedId,
  onRequestDelete,
}: {
  node: HierarchyNode;
  depth?: number;
  onSelect: (id: string, kind: string, level: ProjectionLevel) => void;
  selectedId: string | null;
  onRequestDelete: (node: HierarchyNode) => void;
}) {
  const levelMap: Record<string, ProjectionLevel> = {
    vehicle: "vehicle",
    enclosure: "enclosure",
    pcb: "enclosure",
    node: "node",
    connector: "connector",
    panelMount: "connector",
  };
  const hasChildren = node.children.length > 0;
  const canDelete = node.kind !== "vehicle" && node.kind !== "inlineGroup";

  const hasTemplateLabel = Boolean(node.template_label);
  const isConnector = node.kind === "connector" || node.kind === "panelMount";
  const showStackedLabel =
    isConnector || node.kind === "enclosure" || node.kind === "node";
  const title = hasTemplateLabel || isConnector
    ? connectorNodeTitle(node.label, node.template_label)
    : node.label;

  return (
    <li>
      <div
        className={clsx(
          "flex items-center gap-1 rounded-md pr-1 transition",
          selectedId === node.id
            ? "bg-tesla-accent/15 text-tesla-text"
            : "text-tesla-muted hover:bg-tesla-border/50 hover:text-tesla-text",
          node.kind === "vehicle" && "font-medium text-tesla-text",
        )}
      >
        <button
          type="button"
          onClick={() => {
            const level = levelMap[node.kind];
            if (level) onSelect(node.id, node.kind, level);
          }}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
          className={clsx(
            "min-w-0 flex-1 py-1.5 text-left text-sm",
            showStackedLabel ? "flex items-center gap-1" : "truncate",
          )}
          title={title}
        >
          <span className="mr-1 shrink-0 opacity-60">{iconFor(node.kind)}</span>
          {showStackedLabel ? (
            <ConnectorInstanceLabel
              label={node.label}
              templateLabel={node.template_label}
              stacked
              className="min-w-0 flex-1"
            />
          ) : (
            node.label
          )}
        </button>
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
      {hasChildren && (
        <ul>
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              onSelect={onSelect}
              selectedId={selectedId}
              onRequestDelete={onRequestDelete}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function iconFor(kind: string) {
  switch (kind) {
    case "inlineGroup":
      return "⎯";
    case "enclosure":
      return "▣";
    case "pcb":
    case "node":
      return "▤";
    case "panelMount":
      return "◎";
    case "connector":
      return "◉";
    default:
      return "•";
  }
}

export function HierarchyNav() {
  const queryClient = useQueryClient();
  const vehicleId = useAppStore((s) => s.selectedVehicleId);
  const revisionId = useAppStore((s) => s.selectedRevisionId);
  const selectedNodeId = useAppStore((s) => s.selectedNodeId);
  const selectVehicle = useAppStore((s) => s.selectVehicle);
  const setFocus = useAppStore((s) => s.setFocus);
  const setProjectionLevel = useAppStore((s) => s.setProjectionLevel);
  const setShowLibraryManager = useAppStore((s) => s.setShowLibraryManager);
  const setShowNetManager = useAppStore((s) => s.setShowNetManager);
  const setShowPinNameLibrary = useAppStore((s) => s.setShowPinNameLibrary);
  const setLibraryTab = useAppStore((s) => s.setLibraryTab);
  const searchQuery = useAppStore((s) => s.searchQuery).toLowerCase();
  const [deleteTopologyTarget, setDeleteTopologyTarget] = useState<HierarchyNode | null>(null);

  const { data: vehicles = [], isLoading } = useQuery({
    queryKey: ["vehicles"],
    queryFn: fetchVehicles,
  });

  const { data: hierarchy } = useQuery({
    queryKey: ["hierarchy", vehicleId, revisionId],
    queryFn: () => fetchHierarchy(vehicleId!, revisionId!),
    enabled: Boolean(vehicleId && revisionId),
  });

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
      if (node.kind === "connector" || node.kind === "panelMount") {
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
    },
  });

  function handleNodeSelect(id: string, kind: string, level: ProjectionLevel) {
    if (kind === "vehicle") {
      setProjectionLevel("vehicle");
      setFocus(null);
      return;
    }
    setProjectionLevel(level);
    setFocus(id, kind);
  }

  const filteredRoot = hierarchy?.root
    ? filterTree(hierarchy.root, searchQuery)
    : null;

  return (
    <>
      <nav className="panel-fade-in flex w-64 flex-col border-r border-tesla-border bg-tesla-surface">
        <div className="border-b border-tesla-border p-3">
          <span className="text-xs font-medium uppercase tracking-wider text-tesla-muted">
            Vehicles
          </span>
        </div>
        <ul className="max-h-36 overflow-y-auto border-b border-tesla-border p-2">
          {isLoading && <li className="px-2 py-1 text-sm text-tesla-muted">Loading…</li>}
          {vehicles.map((v) => (
            <li key={v.id}>
              <button
                type="button"
                onClick={() => {
                  if (v.current_revision_id) {
                    selectVehicle(v.id, v.current_revision_id);
                    setFocus(null);
                    setProjectionLevel("vehicle");
                  }
                }}
                className={clsx(
                  "w-full rounded-md px-2 py-2 text-left text-sm transition",
                  vehicleId === v.id
                    ? "bg-tesla-accent/15 text-tesla-text"
                    : "text-tesla-muted hover:bg-tesla-border/50 hover:text-tesla-text",
                )}
                title={v.name}
              >
                <span className="block truncate">{v.name}</span>
              </button>
            </li>
          ))}
          {!isLoading && vehicles.length === 0 && (
            <li className="px-2 py-1 text-sm text-tesla-muted">No vehicles</li>
          )}
        </ul>
        <div className="border-b border-tesla-border p-2">
          <p className="mb-2 px-2 text-xs uppercase tracking-wider text-tesla-muted">Utilities</p>
          <div className="grid grid-cols-2 gap-1">
            <button
              type="button"
              disabled={!vehicleId}
              className="rounded border border-tesla-border px-2 py-1 text-center text-xs leading-tight text-tesla-muted transition hover:border-tesla-accent hover:text-tesla-text disabled:opacity-40"
              onClick={() => {
                setLibraryTab("node");
                setShowLibraryManager(true);
              }}
            >
              Node Library
            </button>
            <button
              type="button"
              disabled={!vehicleId}
              className="rounded border border-tesla-border px-2 py-1 text-center text-xs leading-tight text-tesla-muted transition hover:border-tesla-accent hover:text-tesla-text disabled:opacity-40"
              onClick={() => {
                setLibraryTab("enclosure");
                setShowLibraryManager(true);
              }}
            >
              Enclosure Library
            </button>
            <button
              type="button"
              disabled={!vehicleId}
              className="rounded border border-tesla-border px-2 py-1 text-center text-xs leading-tight text-tesla-muted transition hover:border-tesla-accent hover:text-tesla-text disabled:opacity-40"
              onClick={() => setShowNetManager(true)}
            >
              Net Manager
            </button>
            <button
              type="button"
              disabled={!vehicleId}
              className="rounded border border-tesla-border px-2 py-1 text-center text-xs leading-tight text-tesla-muted transition hover:border-tesla-accent hover:text-tesla-text disabled:opacity-40"
              onClick={() => setShowPinNameLibrary(true)}
            >
              Pin Name Library
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          <p className="mb-2 px-2 text-xs uppercase tracking-wider text-tesla-muted">
            Topology
          </p>
          {!vehicleId && (
            <p className="px-2 text-sm text-tesla-muted">Select a vehicle</p>
          )}
          {filteredRoot && (
            <ul>
              <TreeNode
                node={filteredRoot}
                onSelect={handleNodeSelect}
                selectedId={selectedNodeId}
                onRequestDelete={setDeleteTopologyTarget}
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
    </>
  );
}

function filterTree(node: HierarchyNode, query: string): HierarchyNode | null {
  if (!query) return node;
  const labelMatch = node.label.toLowerCase().includes(query);
  const children = node.children
    .map((c) => filterTree(c, query))
    .filter((c): c is HierarchyNode => c !== null);
  if (labelMatch || children.length) {
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
