import { useQuery } from "@tanstack/react-query";
import { fetchTopologySummary } from "@/api/topology";
import { DesignActions } from "@/features/design/DesignActions";
import { PublishRevisionSection } from "@/features/design/PublishRevisionSection";
import { PinPairingPanel } from "@/features/nets/PinPairingPanel";
import { PinoutEditorPanel } from "@/features/nets/PinoutEditorPanel";
import { PinShortPanel } from "@/features/nets/PinShortPanel";
import { useAppStore } from "@/stores/appStore";

export function PropertyPanel() {
  const mode = useAppStore((s) => s.mode);
  const vehicleId = useAppStore((s) => s.selectedVehicleId);
  const revisionId = useAppStore((s) => s.selectedRevisionId);
  const projectionLevel = useAppStore((s) => s.projectionLevel);
  const focusId = useAppStore((s) => s.selectedNodeId);
  const selectedNodeKind = useAppStore((s) => s.selectedNodeKind);
  const openConnectionTable = useAppStore((s) => s.openConnectionTable);

  const tableScope = (() => {
    if (!focusId) return null;
    if (selectedNodeKind === "node") return { kind: "node" as const, id: focusId };
    if (selectedNodeKind === "enclosure") return { kind: "enclosure" as const, id: focusId };
    if (
      selectedNodeKind === "connector" ||
      selectedNodeKind === "panelMount" ||
      selectedNodeKind === "group"
    )
      return { kind: "connector" as const, id: focusId };
    return null;
  })();

  const { data: summary } = useQuery({
    queryKey: ["topology-summary", vehicleId, revisionId],
    queryFn: () => fetchTopologySummary(vehicleId!, revisionId!),
    enabled: Boolean(vehicleId && revisionId),
  });

  return (
    <div className="panel-fade-in flex flex-1 flex-col overflow-hidden">
      <div className="border-b border-tesla-border p-3">
        <h2 className="text-sm font-medium">Properties</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        <dl className="mb-4 space-y-2 text-sm">
          <div>
            <dt className="text-tesla-muted">Mode</dt>
            <dd className="capitalize">{mode}</dd>
          </div>
          <div>
            <dt className="text-tesla-muted">Projection</dt>
            <dd className="capitalize">{projectionLevel}</dd>
          </div>
          {focusId && (
            <div>
              <dt className="text-tesla-muted">Selection</dt>
              <dd className="truncate font-mono text-xs">
                {selectedNodeKind}:{focusId.slice(0, 8)}…
              </dd>
            </div>
          )}
          {summary && (
            <div>
              <dt className="text-tesla-muted">Topology</dt>
              <dd className="text-xs text-tesla-muted">
                {summary.enclosure_count} enc · {summary.pcb_count} nodes ·{" "}
                {summary.edge_count} edges · {summary.net_count} nets
              </dd>
            </div>
          )}
        </dl>
        {mode === "design" && vehicleId && (
          <button
            type="button"
            onClick={() => openConnectionTable(tableScope ?? { kind: "all", id: null })}
            className="mb-4 w-full rounded-md border border-tesla-border px-3 py-2 text-sm text-tesla-muted transition hover:border-tesla-accent hover:text-tesla-text"
          >
            {tableScope ? "Open selection in connection table" : "Open connection table"}
          </button>
        )}
        {mode === "design" && <DesignActions />}
        {mode === "design" && <PinoutEditorPanel />}
        {mode === "design" && <PinPairingPanel />}
        {mode === "design" && <PinShortPanel />}
      </div>
      {mode === "design" && <PublishRevisionSection />}
    </div>
  );
}
