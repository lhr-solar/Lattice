import { HierarchyNav } from "@/components/shell/HierarchyNav";
import { HelpModal } from "@/components/shell/HelpModal";
import { ModeToggle } from "@/components/shell/ModeToggle";
import { PropertyPanel } from "@/components/shell/PropertyPanel";
import { TopBar } from "@/components/shell/TopBar";
import { TopologyCanvas } from "@/components/graph/TopologyCanvas";
import { ManufacturingPanel } from "@/features/manufacturing/ManufacturingPanel";
import { NetManager } from "@/features/nets/NetManager";
import { PinNameLibraryModal } from "@/features/pins/PinNameLibraryModal";
import { ConnectionTable } from "@/features/connections/ConnectionTable";
import { LibraryBuilders } from "@/features/library/LibraryBuilders";
import { useAutoSelectVehicle } from "@/hooks/useAutoSelectVehicle";
import { useRevisionSync } from "@/hooks/useRevisionSync";
import { useAppStore } from "@/stores/appStore";

interface AppShellProps {
  onOpenAdmin?: () => void;
}

export function AppShell({ onOpenAdmin }: AppShellProps) {
  const mode = useAppStore((s) => s.mode);
  useAutoSelectVehicle();
  useRevisionSync();

  return (
    <div className="flex h-screen flex-col">
      <HelpModal />
      <NetManager />
      <PinNameLibraryModal />
      <ConnectionTable />
      <LibraryBuilders />
      <TopBar onOpenAdmin={onOpenAdmin} />
      <div className="flex min-h-0 flex-1">
        <HierarchyNav />
        <main className="relative min-w-0 flex-1">
          <TopologyCanvas />
          {mode === "manufacturing" && <ManufacturingPanel />}
        </main>
        <aside className="flex w-72 flex-col border-l border-tesla-border bg-tesla-surface">
          <ModeToggle />
          <PropertyPanel />
        </aside>
      </div>
    </div>
  );
}
