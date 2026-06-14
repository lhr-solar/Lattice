import clsx from "clsx";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { isRevisionPublishedError } from "@/api/client";
import { fetchRevisions, publishRevision } from "@/api/revisions";
import { fetchVehicles } from "@/api/vehicles";
import { nextRevisionNumber, resolveActiveRevision } from "@/lib/activeRevision";
import { invalidateAllRevisionData } from "@/lib/revisionInvalidation";
import { useAppStore } from "@/stores/appStore";
import { Modal } from "@/components/ui/Modal";

function formatRevisionLabel(number: number, label?: string | null): string {
  const trimmed = label?.trim();
  return trimmed ? `R${number} | ${trimmed}` : `R${number}`;
}

export function PublishRevisionButton({ className }: { className?: string }) {
  const queryClient = useQueryClient();
  const vehicleId = useAppStore((s) => s.selectedVehicleId);
  const revisionId = useAppStore((s) => s.selectedRevisionId);
  const selectVehicle = useAppStore((s) => s.selectVehicle);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [label, setLabel] = useState("");

  const { data: vehicles = [] } = useQuery({
    queryKey: ["vehicles"],
    queryFn: fetchVehicles,
    enabled: Boolean(vehicleId),
  });

  const { data: revisionsData } = useQuery({
    queryKey: ["revisions", vehicleId],
    queryFn: () => fetchRevisions(vehicleId!),
    enabled: Boolean(vehicleId),
  });

  const vehicle = vehicles.find((v) => v.id === vehicleId);
  const activeRevision = useMemo(
    () => resolveActiveRevision(revisionsData?.revisions, vehicle, revisionId),
    [revisionsData?.revisions, vehicle, revisionId],
  );
  const activeRevisionId = activeRevision?.id ?? null;
  const revisionNumber =
    activeRevision?.revision_number ?? vehicle?.current_revision_number ?? null;
  const nextNumber =
    nextRevisionNumber(revisionsData?.revisions) ??
    (revisionNumber != null ? revisionNumber + 1 : null);
  const currentLabel = activeRevision?.label?.trim() || vehicle?.current_revision_label?.trim() || null;
  const trimmedLabel = label.trim();
  const modalFromLabel =
    revisionNumber != null ? formatRevisionLabel(revisionNumber, currentLabel) : null;
  const modalToLabel =
    revisionNumber != null && trimmedLabel
      ? formatRevisionLabel(revisionNumber, trimmedLabel)
      : null;

  const publish = useMutation({
    mutationFn: async (releaseLabel: string) => {
      if (!vehicleId || !activeRevisionId) return;
      return publishRevision(vehicleId, activeRevisionId, releaseLabel);
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
    setLabel("");
    setConfirmOpen(true);
  }

  return (
    <>
      <button
        type="button"
        disabled={!vehicleId || !activeRevisionId || publish.isPending}
        onClick={openConfirm}
        className={clsx(
          "relative inline-flex h-7 items-center justify-center whitespace-nowrap rounded-md bg-tesla-accent px-3 text-xs text-white transition hover:bg-tesla-accent/90 disabled:opacity-40",
          className,
        )}
      >
        <span className="invisible inline-flex items-center gap-2" aria-hidden>
          <span>Publish revision</span>
          {revisionNumber != null && nextNumber != null ? (
            <span className="flex items-center gap-1">
              <span className="rounded border border-white/40 px-1.5 py-px">R{revisionNumber}</span>
              <span>→</span>
              <span className="rounded border border-white/40 px-1.5 py-px">R{nextNumber}</span>
            </span>
          ) : null}
        </span>
        <span
          className={clsx(
            "absolute inset-0 flex items-center justify-center gap-2 px-3",
            publish.isPending ? "opacity-100" : "opacity-0",
          )}
        >
          Publishing…
        </span>
        <span
          className={clsx(
            "absolute inset-0 flex items-center justify-center gap-2 px-3",
            publish.isPending ? "opacity-0" : "opacity-100",
          )}
        >
          <span>Publish revision</span>
          {revisionNumber != null && nextNumber != null ? (
            <span className="flex shrink-0 items-center gap-1">
              <span className="rounded border border-white/40 bg-white/10 px-1.5 py-px font-medium leading-snug shadow-sm">
                R{revisionNumber}
              </span>
              <span className="text-white/80">→</span>
              <span className="rounded border border-white/40 bg-white/10 px-1.5 py-px font-medium leading-snug shadow-sm">
                R{nextNumber}
              </span>
            </span>
          ) : null}
        </span>
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
              disabled={!vehicleId || !activeRevisionId || !trimmedLabel || publish.isPending}
              onClick={() => publish.mutate(trimmedLabel)}
              className="rounded bg-tesla-accent px-3 py-1.5 text-sm text-white transition hover:bg-tesla-accent/90 disabled:opacity-40"
            >
              {publish.isPending ? "Publishing…" : "Publish"}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          {modalFromLabel && modalToLabel ? (
            <div className="flex min-w-0 items-center gap-2 text-sm text-tesla-text">
              <span className="min-w-0 truncate">{modalFromLabel}</span>
              <span className="shrink-0 text-tesla-muted">→</span>
              <span className="min-w-0 truncate">{modalToLabel}</span>
            </div>
          ) : modalFromLabel ? (
            <p className="text-sm text-tesla-muted">{modalFromLabel}</p>
          ) : null}
          <p className="text-sm text-tesla-muted">
            Publishing locks this revision as an immutable snapshot and creates a new draft
            for continued work. This cannot be undone.
          </p>
          <label className="flex flex-col gap-1 text-xs text-tesla-muted">
            Revision name
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Enter a release description"
              required
              className="rounded-md border border-tesla-border bg-tesla-bg px-3 py-1.5 text-sm text-tesla-text outline-none focus:border-tesla-accent"
              autoFocus
            />
          </label>
          <p className="text-xs text-tesla-muted">Required. Shown in the revision timeline.</p>
        </div>
      </Modal>
    </>
  );
}
