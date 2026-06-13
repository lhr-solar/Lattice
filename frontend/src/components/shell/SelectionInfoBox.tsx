import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchHierarchy, type HierarchyNode } from "@/api/hierarchy";
import { fetchTopologySummary } from "@/api/topology";
import { ConnectorInstanceLabel } from "@/components/library/ConnectorInstanceLabel";
import { HierarchyIcon } from "@/components/shell/HierarchyIcons";
import { useAppStore } from "@/stores/appStore";

function findHierarchyNode(node: HierarchyNode, id: string): HierarchyNode | null {
  if (node.id === id) return node;
  for (const child of node.children) {
    const found = findHierarchyNode(child, id);
    if (found) return found;
  }
  return null;
}

export function SelectionInfoBox() {
  const vehicleId = useAppStore((s) => s.selectedVehicleId);
  const revisionId = useAppStore((s) => s.selectedRevisionId);
  const projectionLevel = useAppStore((s) => s.projectionLevel);
  const focusId = useAppStore((s) => s.selectedNodeId);
  const selectedNodeKind = useAppStore((s) => s.selectedNodeKind);

  const { data: summary } = useQuery({
    queryKey: ["topology-summary", vehicleId, revisionId],
    queryFn: () => fetchTopologySummary(vehicleId!, revisionId!),
    enabled: Boolean(vehicleId && revisionId),
  });

  const { data: hierarchy } = useQuery({
    queryKey: ["hierarchy", vehicleId, revisionId],
    queryFn: () => fetchHierarchy(vehicleId!, revisionId!),
    enabled: Boolean(vehicleId && revisionId && focusId),
  });

  const selectedNode = useMemo(() => {
    if (!focusId || !hierarchy?.root) return null;
    return findHierarchyNode(hierarchy.root, focusId);
  }, [focusId, hierarchy]);

  if (!vehicleId) return null;

  return (
    <div className="pointer-events-none min-w-[168px] max-w-[220px] rounded-md border border-tesla-border bg-tesla-bg/90 px-2.5 py-2 text-xs shadow-sm backdrop-blur">
      <p className="text-[10px] capitalize text-tesla-muted">{projectionLevel}</p>

      {focusId && selectedNodeKind && selectedNode && (
        <div className="mt-1.5 flex items-start gap-1.5 border-t border-tesla-border/50 pt-1.5">
          <HierarchyIcon kind={selectedNodeKind} className="mt-0.5 shrink-0 opacity-50" />
          <ConnectorInstanceLabel
            label={selectedNode.label}
            templateLabel={selectedNode.template_label}
            stacked
            className="min-w-0 flex-1 text-tesla-text"
          />
        </div>
      )}

      {focusId && selectedNodeKind && (
        <p className="mt-1 truncate font-mono text-[10px] text-tesla-muted/60">
          {selectedNodeKind}:{focusId}
        </p>
      )}

      {summary && (
        <p className="mt-1.5 border-t border-tesla-border/50 pt-1.5 text-[10px] text-tesla-muted">
          {summary.enclosure_count} enc · {summary.pcb_count} nodes · {summary.edge_count} edges ·{" "}
          {summary.net_count} nets
        </p>
      )}
    </div>
  );
}
