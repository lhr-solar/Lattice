import { create } from "zustand";

interface PresenceState {
  connectedUserIds: string[];
  connectedCount: number;
  hasSnapshot: boolean;
  setSnapshot: (connectedUserIds: string[], connectedCount: number) => void;
  reset: () => void;
}

export const usePresenceStore = create<PresenceState>((set) => ({
  connectedUserIds: [],
  connectedCount: 0,
  hasSnapshot: false,
  setSnapshot: (connectedUserIds, connectedCount) =>
    set({ connectedUserIds, connectedCount, hasSnapshot: true }),
  reset: () => set({ connectedUserIds: [], connectedCount: 0, hasSnapshot: false }),
}));

export function isUserOnline(userId: string): boolean {
  return usePresenceStore.getState().connectedUserIds.includes(userId);
}
