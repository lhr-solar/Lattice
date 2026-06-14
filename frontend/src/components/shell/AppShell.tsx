import { HierarchyNav } from "@/components/shell/HierarchyNav";
import { HelpModal } from "@/components/shell/HelpModal";
import { FloatingToolbar } from "@/components/shell/FloatingToolbar";
import { CanvasGraphToggle } from "@/components/shell/CanvasGraphToggle";
import { TopBar } from "@/components/shell/TopBar";
import { TopologyCanvas } from "@/components/graph/TopologyCanvas";
import { GraphView } from "@/components/graph/GraphView";
import { ManufacturingPanel } from "@/features/manufacturing/ManufacturingPanel";
import { NetManager } from "@/features/nets/NetManager";
import { PinTemplatesModal } from "@/features/pins/PinTemplatesModal";
import { ConnectionTable } from "@/features/connections/ConnectionTable";
import { LibraryBuilders } from "@/features/library/LibraryBuilders";
import { DesignAddProvider } from "@/features/design/DesignAddContext";
import { DesignAddModals } from "@/features/design/DesignAddModals";
import { useAutoSelectVehicle } from "@/hooks/useAutoSelectVehicle";
import { useSyncVehicleRevision } from "@/hooks/useSyncVehicleRevision";
import { useRevisionSync } from "@/hooks/useRevisionSync";
import { useAppStore } from "@/stores/appStore";

interface AppShellProps {
  onOpenAdmin?: () => void;
}

export function AppShell({ onOpenAdmin }: AppShellProps) {
  const mode = useAppStore((s) => s.mode);
  const graphSubMode = useAppStore((s) => s.graphSubMode);
  useAutoSelectVehicle();
  useSyncVehicleRevision();
  useRevisionSync();

  const showGraph = mode === "design" && graphSubMode === "graph";

  return (
    <DesignAddProvider>
      <div className="flex h-screen flex-col">
        <HelpModal />
        <NetManager />
        <PinTemplatesModal />
        <ConnectionTable />
        <LibraryBuilders />
        <DesignAddModals />
        <TopBar onOpenAdmin={onOpenAdmin} />
        <div className="relative flex min-h-0 flex-1">
          <HierarchyNav />
          <main className="relative min-h-0 flex-1 overflow-hidden">
            {showGraph ? <GraphView /> : <TopologyCanvas />}
            {mode === "manufacturing" && <ManufacturingPanel />}
            <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2">
              <div className="pointer-events-auto">
                <CanvasGraphToggle />
              </div>
            </div>
            <FloatingToolbar />
          </main>
        </div>
      </div>
    </DesignAddProvider>
  );
}
