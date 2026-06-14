import { useQueryClient } from "@tanstack/react-query";
import { invalidateAllRevisionData } from "@/lib/revisionInvalidation";
import { useRevisionSyncStore } from "@/stores/revisionSyncStore";

interface StaleRevisionBannerProps {
  className?: string;
}

export function StaleRevisionBanner({ className = "" }: StaleRevisionBannerProps) {
  const queryClient = useQueryClient();
  const staleRevision = useRevisionSyncStore((s) => s.staleRevision);
  const staleChangedBy = useRevisionSyncStore((s) => s.staleChangedBy);
  const clearStale = useRevisionSyncStore((s) => s.clearStale);

  if (!staleRevision) return null;

  const who = staleChangedBy ? `${staleChangedBy}` : "Someone";

  return (
    <div
      className={`flex items-center justify-between gap-2 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-100 ${className}`}
    >
      <span>Design updated by {who}. Refresh to see the latest.</span>
      <button
        type="button"
        onClick={() => {
          clearStale();
          invalidateAllRevisionData(queryClient);
        }}
        className="rounded border border-amber-500/50 px-2 py-0.5 transition hover:bg-amber-500/20"
      >
        Refresh
      </button>
    </div>
  );
}
