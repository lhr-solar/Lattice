import clsx from "clsx";
import { useSessionStore } from "@/stores/sessionStore";
import { useAppStore } from "@/stores/appStore";

export function TopBar() {
  const displayName = useSessionStore((s) => s.displayName);
  const clearSession = useSessionStore((s) => s.clearSession);
  const searchQuery = useAppStore((s) => s.searchQuery);
  const setSearchQuery = useAppStore((s) => s.setSearchQuery);
  const wireMode = useAppStore((s) => s.wireMode);
  const setWireMode = useAppStore((s) => s.setWireMode);
  const setShowNetManager = useAppStore((s) => s.setShowNetManager);
  const setShowLibraryManager = useAppStore((s) => s.setShowLibraryManager);
  const setLibraryTab = useAppStore((s) => s.setLibraryTab);
  const mode = useAppStore((s) => s.mode);

  return (
    <header className="flex h-12 items-center gap-4 border-b border-tesla-border bg-tesla-surface px-4">
      <span className="font-semibold tracking-tight text-tesla-accent">Lattice</span>
      {mode === "design" && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setWireMode(!wireMode)}
            className={clsx(
              "rounded-md px-2 py-1 text-xs transition",
              wireMode
                ? "bg-tesla-accent text-white"
                : "border border-tesla-border text-tesla-muted hover:text-tesla-text",
            )}
          >
            Wire
          </button>
          <button
            type="button"
            onClick={() => setShowNetManager(true)}
            className="rounded-md border border-tesla-border px-2 py-1 text-xs text-tesla-muted transition hover:border-tesla-accent hover:text-tesla-text"
          >
            Nets
          </button>
          <button
            type="button"
            onClick={() => {
              setLibraryTab("connector");
              setShowLibraryManager(true);
            }}
            className="rounded-md border border-tesla-border px-2 py-1 text-xs text-tesla-muted transition hover:border-tesla-accent hover:text-tesla-text"
          >
            Connector Library
          </button>
        </div>
      )}
      <input
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Search graph entities…"
        className="max-w-md flex-1 rounded-md border border-tesla-border bg-tesla-bg px-3 py-1.5 text-sm outline-none transition focus:border-tesla-accent"
      />
      <div className="ml-auto flex items-center gap-3 text-sm text-tesla-muted">
        <span>{displayName}</span>
        <button
          type="button"
          onClick={clearSession}
          className="rounded px-2 py-1 transition hover:bg-tesla-border hover:text-tesla-text"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
