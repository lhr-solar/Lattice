import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { isRevisionPublishedError } from "@/api/client";
import { fetchRevisions, publishRevision } from "@/api/revisions";
import { invalidateAllRevisionData } from "@/lib/revisionInvalidation";
import { useAppStore } from "@/stores/appStore";
import { Modal } from "@/components/ui/Modal";

export function PublishRevisionSection() {
  const queryClient = useQueryClient();
  const vehicleId = useAppStore((s) => s.selectedVehicleId);
  const revisionId = useAppStore((s) => s.selectedRevisionId);
  const selectVehicle = useAppStore((s) => s.selectVehicle);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [label, setLabel] = useState("");

  const { data: revisionsData } = useQuery({
    queryKey: ["revisions", vehicleId],
    queryFn: () => fetchRevisions(vehicleId!),
    enabled: Boolean(vehicleId && confirmOpen),
  });

  const currentRevision = revisionsData?.revisions.find((r) => r.id === revisionId);
  const defaultLabel = currentRevision
    ? `R${currentRevision.revision_number}`
    : "Release";

  const publish = useMutation({
    mutationFn: async (releaseLabel: string) => {
      if (!vehicleId || !revisionId) return;
      return publishRevision(vehicleId, revisionId, releaseLabel);
    },
    onSuccess: (result) => {
      if (!result || !vehicleId) return;
      setConfirmOpen(false);
      setLabel("");
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
        setConfirmOpen(false);
        setLabel("");
        selectVehicle(vehicleId, draft.id);
        invalidateAllRevisionData(queryClient);
      }
    },
  });

  function openConfirm() {
    setLabel(currentRevision?.label?.trim() || defaultLabel);
    setConfirmOpen(true);
  }

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
        onClick={openConfirm}
        className="w-full rounded-md bg-tesla-accent px-2 py-2 text-xs text-white transition hover:bg-tesla-accent/90 disabled:opacity-40"
      >
        Publish revision
      </button>

      <Modal
        open={confirmOpen}
        title="Publish revision"
        onClose={() => {
          if (publish.isPending) return;
          setConfirmOpen(false);
          setLabel("");
        }}
        layer="stacked"
        footer={
          <>
            <button
              type="button"
              disabled={publish.isPending}
              onClick={() => {
                setConfirmOpen(false);
                setLabel("");
              }}
              className="rounded border border-tesla-border px-3 py-1.5 text-sm text-tesla-muted transition hover:border-tesla-accent hover:text-tesla-text disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!vehicleId || !revisionId || publish.isPending}
              onClick={() => publish.mutate(label.trim() || defaultLabel)}
              className="rounded bg-tesla-accent px-3 py-1.5 text-sm text-white transition hover:bg-tesla-accent/90 disabled:opacity-40"
            >
              {publish.isPending ? "Publishing…" : "Publish"}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <p>
            Publishing locks this revision as an immutable snapshot and creates a new draft
            for continued work. This cannot be undone.
          </p>
          <label className="flex flex-col gap-1 text-xs text-tesla-muted">
            Revision name
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={defaultLabel}
              className="rounded-md border border-tesla-border bg-tesla-bg px-3 py-1.5 text-sm text-tesla-text outline-none focus:border-tesla-accent"
              autoFocus
            />
          </label>
          <p className="text-xs text-tesla-muted">
            Shown in the revision timeline. Defaults to {defaultLabel} if left blank.
          </p>
        </div>
      </Modal>
    </div>
  );
}
