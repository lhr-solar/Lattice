import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SessionState {
  displayName: string | null;
  sessionId: string | null;
  setSession: (displayName: string, sessionId: string) => void;
  clearSession: () => void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      displayName: null,
      sessionId: null,
      setSession: (displayName, sessionId) => {
        localStorage.setItem("crimpassist_user", displayName);
        set({ displayName, sessionId });
      },
      clearSession: () => {
        localStorage.removeItem("crimpassist_user");
        set({ displayName: null, sessionId: null });
      },
    }),
    { name: "crimpassist-session" },
  ),
);
