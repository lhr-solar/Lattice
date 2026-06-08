import { useMutation, useQueryClient } from "@tanstack/react-query";
import { publishRevision } from "@/api/revisions";
import { useAppStore } from "@/stores/appStore";

export function PublishRevisionSection() {
  const queryClient = useQueryClient();
  const vehicleId = useAppStore((s) => s.selectedVehicleId);
  const revisionId = useAppStore((s) => s.selectedRevisionId);
  const selectVehicle = useAppStore((s) => s.selectVehicle);

  const publish = useMutation({
    mutationFn: async () => {
      if (!vehicleId || !revisionId) return;
      const result = await publishRevision(vehicleId, revisionId);
      selectVehicle(vehicleId, result.new_draft_revision.id);
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      queryClient.invalidateQueries({ queryKey: ["revisions", vehicleId] });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hierarchy"] });
      queryClient.invalidateQueries({ queryKey: ["design-projection"] });
      queryClient.invalidateQueries({ queryKey: ["topology-summary"] });
    },
  });

  return (
    <div className="border-t border-tesla-border p-3">
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
