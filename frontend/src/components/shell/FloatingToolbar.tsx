import clsx from "clsx";
import { useAppStore } from "@/stores/appStore";
import { connectionScopeForLevel } from "@/lib/connectionScope";
import { useDesignAddActions } from "@/features/design/DesignAddContext";
import { PublishRevisionButton } from "@/features/design/PublishRevisionButton";

const TOOLBAR_BTN =
  "inline-flex h-7 shrink-0 items-center justify-center whitespace-nowrap rounded-md border border-tesla-border px-2.5 text-xs transition disabled:opacity-40";

function ToolbarDivider() {
  return <div className="mx-1 h-7 w-px shrink-0 bg-tesla-border" aria-hidden />;
}

function OpenTableIcon() {
  return (
    <svg aria-hidden className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 13h10V3H7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 3h4v4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13 3L7 9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ToolbarButton({
  label,
  onClick,
  disabled,
  title,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={clsx(TOOLBAR_BTN, "text-tesla-text hover:border-tesla-accent")}
    >
      {label}
    </button>
  );
}

export function FloatingToolbar() {
  const mode = useAppStore((s) => s.mode);
  const vehicleId = useAppStore((s) => s.selectedVehicleId);
  const revisionId = useAppStore((s) => s.selectedRevisionId);
  const level = useAppStore((s) => s.projectionLevel);
  const focusId = useAppStore((s) => s.focusId);
  const selectedNodeKind = useAppStore((s) => s.selectedNodeKind);
  const openConnectionTable = useAppStore((s) => s.openConnectionTable);
  const wireMode = useAppStore((s) => s.wireMode);
  const setWireMode = useAppStore((s) => s.setWireMode);

  const { openAddModal, targetLabel } = useDesignAddActions();

  if (mode !== "design") return null;

  const disabled = !vehicleId || !revisionId;
  const scope = connectionScopeForLevel(level, focusId, selectedNodeKind);

  return (
    <div className="pointer-events-none absolute bottom-4 left-1/2 z-30 -translate-x-1/2">
      <div className="pointer-events-auto flex items-center gap-1 whitespace-nowrap rounded-xl border border-tesla-border bg-tesla-surface/95 px-3 py-2 shadow-lg backdrop-blur">
        <ToolbarButton
          label="+ Enclosure"
          title={`Add enclosure to ${targetLabel}`}
          disabled={disabled}
          onClick={() => openAddModal("enclosure")}
        />
        <ToolbarButton
          label="+ Node"
          title={`Add node to ${targetLabel}`}
          disabled={disabled}
          onClick={() => openAddModal("node")}
        />
        <ToolbarButton
          label="+ Inline"
          title={`Add inline to ${targetLabel}`}
          disabled={disabled}
          onClick={() => openAddModal("inline")}
        />

        <ToolbarDivider />

        <button
          type="button"
          disabled={disabled}
          onClick={() => openConnectionTable(scope)}
          className={clsx(
            TOOLBAR_BTN,
            "gap-1.5 text-tesla-muted hover:border-tesla-accent hover:text-tesla-text",
          )}
        >
          Open table
          <OpenTableIcon />
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setWireMode(!wireMode)}
          className={clsx(
            TOOLBAR_BTN,
            "relative w-28",
            wireMode
              ? "border-emerald-600 bg-emerald-600 text-white hover:border-emerald-700 hover:bg-emerald-700"
              : "text-tesla-muted hover:border-tesla-accent hover:text-tesla-text",
          )}
        >
          <span className={clsx(wireMode ? "opacity-100" : "opacity-0")}>Wiring active</span>
          <span
            className={clsx(
              "absolute inset-0 flex items-center justify-center",
              wireMode ? "opacity-0" : "opacity-100",
            )}
          >
            Wire
          </span>
        </button>

        <ToolbarDivider />

        <PublishRevisionButton className="!h-7 shrink-0 !py-0" />
      </div>
    </div>
  );
}
