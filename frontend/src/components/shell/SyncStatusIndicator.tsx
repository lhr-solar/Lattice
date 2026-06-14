import { useAppStore } from "@/stores/appStore";
import { useRevisionSyncStore } from "@/stores/revisionSyncStore";

const LABELS = {
  connected: "Live sync",
  reconnecting: "Reconnecting…",
  polling: "Polling for updates",
} as const;

const COLORS = {
  connected: "bg-emerald-400",
  reconnecting: "bg-amber-400",
  polling: "bg-sky-400",
} as const;

export function SyncStatusIndicator() {
  const vehicleId = useAppStore((s) => s.selectedVehicleId);
  const revisionId = useAppStore((s) => s.selectedRevisionId);
  const syncStatus = useRevisionSyncStore((s) => s.syncStatus);

  const active = Boolean(vehicleId && revisionId);

  return (
    <span
      className="inline-flex min-w-[7.25rem] items-center gap-1.5 text-xs text-tesla-muted"
      title={active ? LABELS[syncStatus] : undefined}
      aria-hidden={!active}
    >
      {active ? (
        <>
          <span className={`h-2 w-2 shrink-0 rounded-full ${COLORS[syncStatus]}`} />
          <span className="whitespace-nowrap">{LABELS[syncStatus]}</span>
        </>
      ) : (
        <span className="invisible whitespace-nowrap">Live sync</span>
      )}
    </span>
  );
}
