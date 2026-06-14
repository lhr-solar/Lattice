import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SessionState {
  userId: string | null;
  username: string | null;
  isAdmin: boolean;
  isAuthenticated: boolean;
  setUser: (userId: string, username: string, isAdmin: boolean) => void;
  clearSession: () => void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      userId: null,
      username: null,
      isAdmin: false,
      isAuthenticated: false,
      setUser: (userId, username, isAdmin) =>
        set({ userId, username, isAdmin, isAuthenticated: true }),
      clearSession: () =>
        set({ userId: null, username: null, isAdmin: false, isAuthenticated: false }),
    }),
    { name: "lattice-session" },
  ),
);
