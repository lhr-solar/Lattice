import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import {
  fetchVehicleRevisionTimeline,
  revertVehicleRevision,
  type AdminRevisionTimelineItem,
} from "@/api/admin";
import { ApiError } from "@/api/client";
import { ConfirmModal, ModalOverlay } from "@/components/ui/Modal";

const PAGE_SIZE = 20;

interface AdminRevisionHistoryModalProps {
  open: boolean;
  vehicleId: string;
  vehicleName: string;
  onClose: () => void;
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function statusLabel(revision: AdminRevisionTimelineItem): string {
  if (revision.is_immutable) return "Published";
  return revision.status === "released" ? "Released" : "Draft";
}

function parentSourceTime(revision: AdminRevisionTimelineItem): string | null {
  const iso = revision.parent_snapshot_taken_at ?? revision.parent_created_at;
  return iso ? formatTimestamp(iso) : null;
}

function RevisionTimelineCard({
  revision,
  onRevert,
}: {
  revision: AdminRevisionTimelineItem;
  onRevert: (revision: AdminRevisionTimelineItem) => void;
}) {
  const copiedFromTime = parentSourceTime(revision);

  return (
    <div
      className={clsx(
        "rounded-md border px-3 py-2",
        revision.is_current
          ? "border-tesla-accent/50 bg-tesla-accent/10"
          : "border-tesla-border bg-tesla-bg",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-tesla-text">R{revision.revision_number}</span>
            <span
              className={clsx(
                "rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide",
                revision.is_immutable
                  ? "bg-emerald-500/15 text-emerald-300"
                  : "bg-tesla-border/60 text-tesla-muted",
              )}
            >
              {statusLabel(revision)}
            </span>
            {revision.is_current && (
              <span className="rounded bg-tesla-accent/20 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-tesla-accent">
                Current
              </span>
            )}
          </div>
          {revision.label && <p className="mt-1 text-sm text-tesla-text">{revision.label}</p>}
        </div>
        {!revision.is_current && (
          <button
            type="button"
            onClick={() => onRevert(revision)}
            className="shrink-0 rounded border border-tesla-border px-2 py-1 text-xs text-tesla-muted transition hover:border-tesla-accent hover:text-tesla-text"
          >
            Revert to this
          </button>
        )}
      </div>

      <dl className="mt-2 grid gap-1 text-xs text-tesla-muted sm:grid-cols-2">
        <div>
          <dt className="text-[10px] uppercase tracking-wide">Revision ID</dt>
          <dd className="font-mono text-[11px] text-tesla-text">{revision.id}</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wide">Created</dt>
          <dd>
            {formatTimestamp(revision.created_at)}
            {revision.created_by ? ` · ${revision.created_by}` : ""}
          </dd>
        </div>
        {revision.snapshot_taken_at && (
          <div>
            <dt className="text-[10px] uppercase tracking-wide">Published</dt>
            <dd>{formatTimestamp(revision.snapshot_taken_at)}</dd>
          </div>
        )}
        {revision.parent_revision_id && (
          <div className="sm:col-span-2">
            <dt className="text-[10px] uppercase tracking-wide">Copied from</dt>
            <dd>
              R{revision.parent_revision_number ?? "?"}
              {copiedFromTime ? ` · ${copiedFromTime}` : ""}
              <span className="mt-0.5 block font-mono text-[11px] text-tesla-text">
                {revision.parent_revision_id}
              </span>
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}

export function AdminRevisionHistoryModal({
  open,
  vehicleId,
  vehicleName,
  onClose,
}: AdminRevisionHistoryModalProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [revertTarget, setRevertTarget] = useState<AdminRevisionTimelineItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search, open]);

  useEffect(() => {
    if (!open) {
      setSearch("");
      setDebouncedSearch("");
      setError(null);
      setSuccess(null);
      setRevertTarget(null);
    }
  }, [open]);

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: ["admin-revision-timeline", vehicleId, debouncedSearch],
    queryFn: ({ pageParam = 0 }) =>
      fetchVehicleRevisionTimeline(vehicleId, {
        search: debouncedSearch || undefined,
        offset: pageParam,
        limit: PAGE_SIZE,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) =>
      lastPage.has_more ? lastPage.offset + lastPage.revisions.length : undefined,
    enabled: open && Boolean(vehicleId),
    staleTime: 0,
  });

  const revisions = useMemo(
    () => data?.pages.flatMap((page) => page.revisions) ?? [],
    [data],
  );
  const total = data?.pages[0]?.total ?? 0;

  const revertMutation = useMutation({
    mutationFn: (revisionId: string) => revertVehicleRevision(vehicleId, revisionId),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["admin-revision-timeline", vehicleId] });
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      queryClient.invalidateQueries({ queryKey: ["revisions", vehicleId] });
      setRevertTarget(null);
      setError(null);
      setSuccess(
        `Created R${result.new_revision.revision_number} as a copy of R${result.source_revision.revision_number}. Vehicle head updated.`,
      );
    },
    onError: (err) => {
      setSuccess(null);
      setError(err instanceof ApiError ? err.message : "Failed to revert revision");
    },
  });

  function handleScroll(event: React.UIEvent<HTMLDivElement>) {
    const el = event.currentTarget;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 96;
    if (nearBottom && hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }

  if (!open) return null;

  return (
    <ModalOverlay
      open={open}
      onClose={onClose}
      layer="manager"
      ariaLabel={`Revision history for ${vehicleName}`}
      panelClassName="max-w-2xl"
    >
      <header className="relative border-b border-tesla-border px-4 py-3">
        <h2 className="pr-8 text-base font-semibold text-tesla-text">
          Revision history — {vehicleName}
        </h2>
        <p className="mt-0.5 text-xs text-tesla-muted">
          Newest first. Scroll for older revisions. Revert creates a new draft copy.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-lg leading-none text-tesla-muted transition hover:bg-tesla-border hover:text-tesla-text"
          aria-label="Close"
        >
          ×
        </button>
      </header>

      <div className="border-b border-tesla-border px-4 py-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search label, author, revision #, or ID…"
          className="w-full rounded-md border border-tesla-border bg-tesla-bg px-3 py-1.5 text-sm text-tesla-text outline-none focus:border-tesla-accent"
        />
        {total > 0 && (
          <p className="mt-2 text-xs text-tesla-muted">
            Showing {revisions.length} of {total} revision{total === 1 ? "" : "s"}
          </p>
        )}
      </div>

      <div
        className="max-h-[min(32rem,60vh)] overflow-y-auto px-4 py-3"
        onScroll={handleScroll}
      >
        {error && <p className="mb-3 text-sm text-red-400">{error}</p>}
        {success && <p className="mb-3 text-sm text-emerald-400">{success}</p>}

        {isLoading && <p className="text-sm text-tesla-muted">Loading revisions…</p>}

        {!isLoading && revisions.length === 0 && (
          <p className="text-sm text-tesla-muted">
            {debouncedSearch ? "No revisions match your search." : "No revisions for this vehicle."}
          </p>
        )}

        {!isLoading && revisions.length > 0 && (
          <ol className="relative space-y-3 border-l border-tesla-border pl-4">
            {revisions.map((revision) => (
              <li key={revision.id} className="relative">
                <span
                  className={clsx(
                    "absolute -left-[1.3125rem] top-3 h-2.5 w-2.5 rounded-full border-2",
                    revision.is_current
                      ? "border-tesla-accent bg-tesla-accent"
                      : "border-tesla-border bg-tesla-surface",
                  )}
                  aria-hidden
                />
                <RevisionTimelineCard revision={revision} onRevert={setRevertTarget} />
              </li>
            ))}
          </ol>
        )}

        {isFetchingNextPage && (
          <p className="mt-3 text-center text-xs text-tesla-muted">Loading more…</p>
        )}
      </div>

      <ConfirmModal
        open={Boolean(revertTarget)}
        title={
          revertTarget ? `Revert to R${revertTarget.revision_number}?` : "Revert revision"
        }
        message={
          revertTarget
            ? `Create a new draft revision copied from R${revertTarget.revision_number} (${formatTimestamp(revertTarget.created_at)})? The vehicle will switch to the new revision. Previous drafts remain in the timeline.`
            : ""
        }
        confirmLabel={revertMutation.isPending ? "Reverting…" : "Revert"}
        disabled={revertMutation.isPending}
        onCancel={() => setRevertTarget(null)}
        onConfirm={() => {
          if (!revertTarget) return;
          revertMutation.mutate(revertTarget.id);
        }}
      />
    </ModalOverlay>
  );
}
