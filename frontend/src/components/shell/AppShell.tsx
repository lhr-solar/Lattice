import { HierarchyNav } from "@/components/shell/HierarchyNav";
import { ModeToggle } from "@/components/shell/ModeToggle";
import { PropertyPanel } from "@/components/shell/PropertyPanel";
import { TopBar } from "@/components/shell/TopBar";
import { TopologyCanvas } from "@/components/graph/TopologyCanvas";
import { ManufacturingPanel } from "@/features/manufacturing/ManufacturingPanel";
import { NetManager } from "@/features/nets/NetManager";
import { useAppStore } from "@/stores/appStore";

export function AppShell() {
  const mode = useAppStore((s) => s.mode);

  return (
    <div className="flex h-screen flex-col">
      <NetManager />
      <TopBar />
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
