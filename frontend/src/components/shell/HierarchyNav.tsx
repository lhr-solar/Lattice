import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import clsx from "clsx";
import { fetchHierarchy, type HierarchyNode } from "@/api/hierarchy";
import { deleteConnector, deleteEnclosure, deletePcb } from "@/api/instances";
import { fetchVehicles, createVehicle, deleteVehicle, updateVehicleName } from "@/api/vehicles";
import { useAppStore } from "@/stores/appStore";
import type { ProjectionLevel } from "@/api/types";
import { ConfirmModal, PromptModal } from "@/components/ui/Modal";

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
          className="min-w-0 flex-1 truncate py-1.5 text-left text-sm"
          title={node.label}
        >
          <span className="mr-1 opacity-60">{iconFor(node.kind)}</span>
          {node.label}
        </button>
        {canDelete ? (
          <button
            type="button"
            title={`Delete ${node.label}`}
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
  const [renameTarget, setRenameTarget] = useState<{ id: string; currentName: string } | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
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

  const createMutation = useMutation({
    mutationFn: () => createVehicle(`Vehicle ${vehicles.length + 1}`),
    onSuccess: (vehicle) => {
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      if (vehicle.current_revision_id) {
        selectVehicle(vehicle.id, vehicle.current_revision_id);
      }
    },
  });

  const renameMutation = useMutation({
    mutationFn: ({ vehicleId, name }: { vehicleId: string; name: string }) =>
      updateVehicleName(vehicleId, name),
    onSuccess: (vehicle) => {
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      if (vehicleId === vehicle.id && vehicle.current_revision_id) {
        selectVehicle(vehicle.id, vehicle.current_revision_id);
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (vehicleIdToDelete: string) => deleteVehicle(vehicleIdToDelete),
    onSuccess: (_, vehicleIdToDelete) => {
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      if (vehicleId === vehicleIdToDelete) {
        selectVehicle(null, null);
        setFocus(null);
        setProjectionLevel("vehicle");
      }
    },
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

  const canSubmitRename =
    Boolean(renameTarget) &&
    renameValue.trim().length > 0 &&
    renameValue.trim() !== renameTarget?.currentName &&
    !renameMutation.isPending;

  return (
    <>
      <nav className="panel-fade-in flex w-64 flex-col border-r border-tesla-border bg-tesla-surface">
        <div className="flex items-center justify-between border-b border-tesla-border p-3">
          <span className="text-xs font-medium uppercase tracking-wider text-tesla-muted">
            Vehicles
          </span>
          <button
            type="button"
            onClick={() => createMutation.mutate()}
            className="rounded px-2 py-0.5 text-lg leading-none text-tesla-accent transition hover:bg-tesla-border"
            title="New vehicle"
          >
            +
          </button>
        </div>
        <ul className="max-h-36 overflow-y-auto border-b border-tesla-border p-2">
          {isLoading && <li className="px-2 py-1 text-sm text-tesla-muted">Loading…</li>}
          {vehicles.map((v) => (
            <li key={v.id}>
              <div
                className={clsx(
                  "flex items-center gap-1 rounded-md px-2 py-2 text-sm transition",
                  vehicleId === v.id
                    ? "bg-tesla-accent/15 text-tesla-text"
                    : "text-tesla-muted hover:bg-tesla-border/50 hover:text-tesla-text",
                )}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (v.current_revision_id) {
                      selectVehicle(v.id, v.current_revision_id);
                      setFocus(null);
                      setProjectionLevel("vehicle");
                    }
                  }}
                  className="min-w-0 flex-1 truncate text-left"
                  title={v.name}
                >
                  {v.name}
                </button>
                <button
                  type="button"
                  title="Edit name"
                  className="rounded px-1.5 py-0.5 text-xs text-tesla-muted transition hover:bg-tesla-border hover:text-tesla-text"
                  onClick={(e) => {
                    e.stopPropagation();
                    setRenameTarget({ id: v.id, currentName: v.name });
                    setRenameValue(v.name);
                  }}
                >
                  ✎
                </button>
                <button
                  type="button"
                  title="Delete vehicle"
                  className="rounded px-1.5 py-0.5 text-xs text-tesla-muted transition hover:bg-tesla-border hover:text-tesla-text"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteTarget({ id: v.id, name: v.name });
                  }}
                >
                  🗑
                </button>
              </div>
            </li>
          ))}
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
      <PromptModal
        open={Boolean(renameTarget)}
        title="Rename vehicle"
        message="Enter a new vehicle name."
        value={renameValue}
        submitLabel={renameMutation.isPending ? "Saving..." : "Save"}
        disabled={!canSubmitRename}
        onChange={setRenameValue}
        onCancel={() => {
          setRenameTarget(null);
          setRenameValue("");
        }}
        onSubmit={() => {
          if (!renameTarget) return;
          const trimmed = renameValue.trim();
          if (!trimmed || trimmed === renameTarget.currentName) return;
          renameMutation.mutate(
            { vehicleId: renameTarget.id, name: trimmed },
            {
              onSuccess: () => {
                setRenameTarget(null);
                setRenameValue("");
              },
            },
          );
        }}
      />
      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Delete vehicle"
        message={
          deleteTarget
            ? `Delete vehicle "${deleteTarget.name}"? This removes its revisions and instances.`
            : ""
        }
        confirmLabel={deleteMutation.isPending ? "Deleting..." : "Delete"}
        destructive
        disabled={deleteMutation.isPending}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) return;
          deleteMutation.mutate(deleteTarget.id, {
            onSuccess: () => setDeleteTarget(null),
          });
        }}
      />
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
