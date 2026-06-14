import { useState } from "react";
import { useAppStore } from "@/stores/appStore";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { WireTableView } from "./WireTableView";
import { ConnectorBomView } from "./ConnectorBomView";
import { VehicleRevisionSelector } from "./VehicleRevisionSelector";

export function ManufacturingPanel() {
  const vehicleId = useAppStore((s) => s.selectedVehicleId);
  const revisionId = useAppStore((s) => s.selectedRevisionId);

  const [subView, setSubView] = useState<"wire-table" | "connector-bom">("wire-table");
  const [staleCount, setStaleCount] = useState(0);

  if (!vehicleId || !revisionId) return null;

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-tesla-bg/95 backdrop-blur">
      <header className="flex shrink-0 items-center justify-between border-b border-tesla-border px-4 py-3">
        <div className="flex items-center gap-8">
          <div className="w-80 shrink-0">
            <h2 className="text-lg font-bold text-tesla-text">
              {subView === "wire-table" ? "Harness Table" : "Connector BOM"}
            </h2>
            <p className="text-xs text-tesla-muted">
              {subView === "wire-table"
                ? "One row per wire. Check off manufactured and continuity."
                : "Aggregated connector counts by template and manufacturer."}
            </p>
          </div>

          <SegmentedControl
            ariaLabel="Manufacturing sub-view"
            value={subView}
            onChange={(v) => setSubView(v as any)}
            className="w-72"
            options={[
              { value: "wire-table", label: "Harness Table" },
              { value: "connector-bom", label: "Connector BOM" },
            ]}
          />
        </div>
        <div className="flex items-center gap-4">
          {subView === "wire-table" && staleCount > 0 && (
            <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs text-amber-300">
              {staleCount} wire{staleCount === 1 ? "" : "s"} marked before the latest topology change
            </span>
          )}
          <VehicleRevisionSelector />
        </div>
      </header>

      {subView === "wire-table" ? (
        <WireTableView staleCount={staleCount} setStaleCount={setStaleCount} />
      ) : (
        <ConnectorBomView />
      )}
    </div>
  );
}
