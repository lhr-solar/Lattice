import { logout } from "@/api/auth";
import { SyncStatusIndicator } from "@/components/shell/SyncStatusIndicator";
import { useSessionStore } from "@/stores/sessionStore";
import { useAppStore } from "@/stores/appStore";

interface TopBarProps {
  onOpenAdmin?: () => void;
}

export function TopBar({ onOpenAdmin }: TopBarProps) {
  const username = useSessionStore((s) => s.username);
  const isAdmin = useSessionStore((s) => s.isAdmin);
  const clearSession = useSessionStore((s) => s.clearSession);
  const searchQuery = useAppStore((s) => s.searchQuery);
  const setSearchQuery = useAppStore((s) => s.setSearchQuery);
  const setShowLibraryManager = useAppStore((s) => s.setShowLibraryManager);
  const setShowHelpModal = useAppStore((s) => s.setShowHelpModal);
  const setLibraryTab = useAppStore((s) => s.setLibraryTab);
  const mode = useAppStore((s) => s.mode);

  async function handleSignOut() {
    try {
      await logout();
    } catch {
      // clear local state regardless
    }
    clearSession();
  }

  return (
    <header className="flex h-12 items-center gap-4 border-b border-tesla-border bg-tesla-surface px-4">
      <span className="font-logo select-none bg-gradient-to-r from-tesla-accent to-[#7db4ff] bg-clip-text text-[1.03rem] font-bold uppercase tracking-[0.08em] text-transparent antialiased">
        Lattice
      </span>
      {mode === "design" && (
        <div className="flex gap-2">
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
          <button
            type="button"
            onClick={() => setShowHelpModal(true)}
            className="rounded-md border border-tesla-border px-2 py-1 text-xs text-tesla-muted transition hover:border-tesla-accent hover:text-tesla-text"
          >
            Help
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
        <SyncStatusIndicator />
        {isAdmin && onOpenAdmin && (
          <button
            type="button"
            onClick={onOpenAdmin}
            className="rounded px-2 py-1 transition hover:bg-tesla-border hover:text-tesla-text"
          >
            Admin
          </button>
        )}
        <span>{username}</span>
        <button
          type="button"
          onClick={handleSignOut}
          className="rounded px-2 py-1 transition hover:bg-tesla-border hover:text-tesla-text"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
