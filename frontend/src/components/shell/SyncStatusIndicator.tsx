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

  if (!vehicleId || !revisionId) return null;

  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-tesla-muted"
      title={LABELS[syncStatus]}
    >
      <span className={`h-2 w-2 rounded-full ${COLORS[syncStatus]}`} />
      {LABELS[syncStatus]}
    </span>
  );
}
