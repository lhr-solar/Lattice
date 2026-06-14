import { createContext, useContext, type ReactNode } from "react";
import { useDesignAddActionsState } from "@/features/design/useDesignAddActions";

type DesignAddContextValue = ReturnType<typeof useDesignAddActionsState>;

const DesignAddContext = createContext<DesignAddContextValue | null>(null);

export function DesignAddProvider({ children }: { children: ReactNode }) {
  const value = useDesignAddActionsState();
  return <DesignAddContext.Provider value={value}>{children}</DesignAddContext.Provider>;
}

export function useDesignAddActions(): DesignAddContextValue {
  const ctx = useContext(DesignAddContext);
  if (!ctx) throw new Error("useDesignAddActions must be used within DesignAddProvider");
  return ctx;
}
