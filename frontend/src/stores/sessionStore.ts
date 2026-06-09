import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SessionState {
  username: string | null;
  isAdmin: boolean;
  isAuthenticated: boolean;
  setUser: (username: string, isAdmin: boolean) => void;
  clearSession: () => void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      username: null,
      isAdmin: false,
      isAuthenticated: false,
      setUser: (username, isAdmin) => set({ username, isAdmin, isAuthenticated: true }),
      clearSession: () => set({ username: null, isAdmin: false, isAuthenticated: false }),
    }),
    { name: "lattice-session" },
  ),
);
