import { useMutation, useQueryClient } from "@tanstack/react-query";
import { isRevisionPublishedError } from "@/api/client";
import { fetchRevisions, publishRevision } from "@/api/revisions";
import { invalidateAllRevisionData } from "@/lib/revisionInvalidation";
import { useAppStore } from "@/stores/appStore";

export function PublishRevisionSection() {
  const queryClient = useQueryClient();
  const vehicleId = useAppStore((s) => s.selectedVehicleId);
  const revisionId = useAppStore((s) => s.selectedRevisionId);
  const selectVehicle = useAppStore((s) => s.selectVehicle);

  const publish = useMutation({
    mutationFn: async () => {
      if (!vehicleId || !revisionId) return;
      return publishRevision(vehicleId, revisionId);
    },
    onSuccess: (result) => {
      if (!result || !vehicleId) return;
      selectVehicle(vehicleId, result.new_draft_revision.id);
      invalidateAllRevisionData(queryClient);
    },
    onError: async (error) => {
      if (!vehicleId || !isRevisionPublishedError(error)) return;
      const revisions = await queryClient.fetchQuery({
        queryKey: ["revisions", vehicleId],
        queryFn: () => fetchRevisions(vehicleId),
      });
      const draft = revisions.revisions.find((r) => !r.is_immutable);
      if (draft) {
        selectVehicle(vehicleId, draft.id);
        invalidateAllRevisionData(queryClient);
      }
    },
  });

  return (
    <div className="border-t border-tesla-border p-3">
      {publish.isError && isRevisionPublishedError(publish.error) && (
        <p className="mb-2 text-xs text-amber-200">
          This revision was already published. Switched to the current draft.
        </p>
      )}
      <button
        type="button"
        disabled={!vehicleId || !revisionId || publish.isPending}
        onClick={() => publish.mutate()}
        className="w-full rounded-md bg-tesla-accent px-2 py-2 text-xs text-white transition hover:bg-tesla-accent/90 disabled:opacity-40"
      >
        {publish.isPending ? "Publishing…" : "Publish revision"}
      </button>
    </div>
  );
}
