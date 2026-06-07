import { create } from "zustand";
import type { ProjectionLevel } from "@/api/types";

export type AppMode = "design" | "manufacturing";
export type LibraryTab = "connector" | "pcb" | "enclosure";

interface AppState {
  mode: AppMode;
  selectedVehicleId: string | null;
  selectedRevisionId: string | null;
  projectionLevel: ProjectionLevel;
  focusId: string | null;
  selectedNodeId: string | null;
  selectedNodeKind: string | null;
  wireMode: boolean;
  pairingPinAId: string | null;
  showNetManager: boolean;
  showLibraryManager: boolean;
  libraryTab: LibraryTab;
  searchQuery: string;
  setMode: (mode: AppMode) => void;
  selectVehicle: (vehicleId: string | null, revisionId: string | null) => void;
  setProjectionLevel: (level: ProjectionLevel) => void;
  setFocus: (focusId: string | null, kind?: string | null) => void;
  setSelectedNode: (id: string | null, kind?: string | null) => void;
  setWireMode: (enabled: boolean) => void;
  setPairingPinA: (pinId: string | null) => void;
  setShowNetManager: (show: boolean) => void;
  setShowLibraryManager: (show: boolean) => void;
  setLibraryTab: (tab: LibraryTab) => void;
  clearPairing: () => void;
  setSearchQuery: (query: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  mode: "design",
  selectedVehicleId: null,
  selectedRevisionId: null,
  projectionLevel: "vehicle",
  focusId: null,
  selectedNodeId: null,
  selectedNodeKind: null,
  wireMode: false,
  pairingPinAId: null,
  showNetManager: false,
  showLibraryManager: false,
  libraryTab: "connector",
  searchQuery: "",
  setMode: (mode) => set({ mode }),
  selectVehicle: (vehicleId, revisionId) =>
    set({
      selectedVehicleId: vehicleId,
      selectedRevisionId: revisionId,
      focusId: null,
      selectedNodeId: null,
      selectedNodeKind: null,
      projectionLevel: "vehicle",
    }),
  setProjectionLevel: (projectionLevel) => set({ projectionLevel }),
  setFocus: (focusId, kind = null) => set({ focusId, selectedNodeId: focusId, selectedNodeKind: kind }),
  setSelectedNode: (id, kind = null) => set({ selectedNodeId: id, selectedNodeKind: kind }),
  setWireMode: (wireMode) =>
    set(wireMode ? { wireMode } : { wireMode: false, pairingPinAId: null }),
  setPairingPinA: (pairingPinAId) => set({ pairingPinAId }),
  setShowNetManager: (showNetManager) => set({ showNetManager }),
  setShowLibraryManager: (showLibraryManager) => set({ showLibraryManager }),
  setLibraryTab: (libraryTab) => set({ libraryTab }),
  clearPairing: () => set({ pairingPinAId: null }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
}));
