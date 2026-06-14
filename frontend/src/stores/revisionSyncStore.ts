import { create } from "zustand";

export type SyncStatus = "connected" | "reconnecting" | "polling";

interface RevisionSyncState {
  editSequence: number;
  staleRevision: boolean;
  staleChangedBy: string | null;
  dirtyFormCount: number;
  ownSaveInFlight: number;
  syncStatus: SyncStatus;
  setEditSequence: (sequence: number) => void;
  markStale: (changedBy: string | null) => void;
  clearStale: () => void;
  setDirtyForm: (dirty: boolean) => void;
  beginOwnSave: () => void;
  endOwnSave: () => void;
  setSyncStatus: (status: SyncStatus) => void;
  reset: () => void;
}

export const useRevisionSyncStore = create<RevisionSyncState>((set) => ({
  editSequence: 0,
  staleRevision: false,
  staleChangedBy: null,
  dirtyFormCount: 0,
  ownSaveInFlight: 0,
  syncStatus: "reconnecting",
  setEditSequence: (sequence) => set({ editSequence: sequence }),
  markStale: (changedBy) => set({ staleRevision: true, staleChangedBy: changedBy }),
  clearStale: () => set({ staleRevision: false, staleChangedBy: null }),
  setDirtyForm: (dirty) =>
    set((state) => ({
      dirtyFormCount: Math.max(0, state.dirtyFormCount + (dirty ? 1 : -1)),
    })),
  beginOwnSave: () => set((state) => ({ ownSaveInFlight: state.ownSaveInFlight + 1 })),
  endOwnSave: () =>
    set((state) => ({ ownSaveInFlight: Math.max(0, state.ownSaveInFlight - 1) })),
  setSyncStatus: (syncStatus) => set({ syncStatus }),
  reset: () =>
    set({
      editSequence: 0,
      staleRevision: false,
      staleChangedBy: null,
      dirtyFormCount: 0,
      ownSaveInFlight: 0,
      syncStatus: "reconnecting",
    }),
}));
