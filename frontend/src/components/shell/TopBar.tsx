import clsx from "clsx";
import { useState } from "react";
import { logout } from "@/api/auth";
import { latticeMarkLogo } from "@/assets/logos";
import { SyncStatusIndicator } from "@/components/shell/SyncStatusIndicator";
import { HelpButton } from "@/components/shell/HelpButton";
import { ConfirmModal } from "@/components/ui/Modal";
import { GearIcon } from "@/components/ui/GearIcon";
import { ModeSwitch } from "@/components/ui/ModeSwitch";
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
  const setLibraryTab = useAppStore((s) => s.setLibraryTab);
  const mode = useAppStore((s) => s.mode);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);

  async function handleSignOut() {
    try {
      await logout();
    } catch {
      // clear local state regardless
    }
    clearSession();
  }

  return (
    <header className="flex h-12 items-center gap-3 border-b border-tesla-border bg-tesla-surface px-4">
      <div className="flex shrink-0 items-center">
        <div className="flex items-center gap-2">
          <img
            src={latticeMarkLogo}
            alt=""
            aria-hidden
            className="h-7 w-7 rounded-sm object-contain"
          />
          <span className="font-logo select-none bg-gradient-to-r from-tesla-accent to-[#7db4ff] bg-clip-text text-[1.03rem] font-bold uppercase tracking-[0.08em] text-transparent antialiased">
            Lattice
          </span>
        </div>
        <div
          className={clsx(
            "topbar-library-collapse overflow-hidden transition-all duration-300 ease-in-out",
            mode === "design"
              ? "ml-3 max-w-[8.75rem] opacity-100"
              : "ml-0 max-w-0 opacity-0 pointer-events-none",
          )}
        >
          <button
            type="button"
            onClick={() => {
              setLibraryTab("connector");
              setShowLibraryManager(true);
            }}
            className="whitespace-nowrap rounded-md border border-tesla-border px-2 py-1 text-xs text-tesla-muted transition-colors hover:border-tesla-accent hover:text-tesla-text"
            tabIndex={mode === "design" ? 0 : -1}
            aria-hidden={mode !== "design"}
          >
            Connector Library
          </button>
        </div>
      </div>

      <div className="topbar-search-expand flex min-w-0 flex-1 items-center gap-3 transition-all duration-300 ease-in-out">
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search graph entities…"
          className="topbar-search-expand min-w-0 flex-1 rounded-md border border-tesla-border bg-tesla-bg px-3 py-1.5 text-sm outline-none transition-all duration-300 ease-in-out focus:border-tesla-accent"
        />
        <ModeSwitch />
      </div>

      <div className="flex shrink-0 items-center gap-3 text-sm text-tesla-muted">
        {isAdmin && onOpenAdmin && (
          <button
            type="button"
            onClick={onOpenAdmin}
            className="flex items-center gap-1.5 whitespace-nowrap rounded-md border border-orange-500/60 px-2 py-1 text-xs font-medium text-orange-300 transition hover:border-orange-400 hover:bg-orange-500/10 hover:text-orange-200"
          >
            <GearIcon size="sm" />
            Admin Settings
          </button>
        )}
        <HelpButton />
        <SyncStatusIndicator />
        <span className="whitespace-nowrap">{username}</span>
        <button
          type="button"
          onClick={() => setShowSignOutConfirm(true)}
          className="whitespace-nowrap rounded px-2 py-1 text-red-400 transition hover:bg-red-600 hover:text-white"
        >
          Sign out
        </button>
      </div>
      <ConfirmModal
        open={showSignOutConfirm}
        title="Sign out"
        message="Sign out of Lattice? You will need to log in again to continue."
        confirmLabel="Sign out"
        destructive
        onCancel={() => setShowSignOutConfirm(false)}
        onConfirm={() => {
          setShowSignOutConfirm(false);
          void handleSignOut();
        }}
      />
    </header>
  );
}
