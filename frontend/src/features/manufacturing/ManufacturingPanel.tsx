import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import {
  addContinuityCheck,
  createManufacturingRecord,
  fetchManufacturingProjection,
  markBuilt,
  syncHarnessGroups,
  type HarnessGroup,
  type ManufacturingRecord,
} from "@/api/manufacturing";
import { useAppStore } from "@/stores/appStore";

export function ManufacturingPanel() {
  const queryClient = useQueryClient();
  const vehicleId = useAppStore((s) => s.selectedVehicleId);
  const revisionId = useAppStore((s) => s.selectedRevisionId);

  const { data, isLoading } = useQuery({
    queryKey: ["manufacturing", vehicleId, revisionId],
    queryFn: () => fetchManufacturingProjection(vehicleId!, revisionId!),
    enabled: Boolean(vehicleId && revisionId),
  });

  const syncMutation = useMutation({
    mutationFn: () => syncHarnessGroups(vehicleId!, revisionId!),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["manufacturing", vehicleId, revisionId] }),
  });

  if (!vehicleId || !revisionId) return null;

  return (
    <div className="panel-fade-in absolute bottom-4 left-4 right-4 max-h-56 overflow-hidden rounded-lg border border-tesla-border bg-tesla-surface/95 backdrop-blur">
      <div className="flex items-center justify-between border-b border-tesla-border px-4 py-2">
        <h3 className="text-sm font-medium">Manufacturing harnesses</h3>
        <button
          type="button"
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
          className="rounded-md border border-tesla-border px-2 py-1 text-xs transition hover:border-tesla-accent"
        >
          {syncMutation.isPending ? "Syncing…" : "Sync groups"}
        </button>
      </div>
      <div className="grid max-h-40 grid-cols-2 gap-4 overflow-y-auto p-4 text-sm">
        <HarnessTable
          title="Internal"
          groups={data?.internal_groups ?? []}
          records={data?.records ?? []}
          vehicleId={vehicleId}
          revisionId={revisionId}
          isLoading={isLoading}
        />
        <HarnessTable
          title="External"
          groups={data?.external_groups ?? []}
          records={data?.records ?? []}
          vehicleId={vehicleId}
          revisionId={revisionId}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}

function HarnessTable({
  title,
  groups,
  records,
  vehicleId,
  revisionId,
  isLoading,
}: {
  title: string;
  groups: HarnessGroup[];
  records: ManufacturingRecord[];
  vehicleId: string;
  revisionId: string;
  isLoading: boolean;
}) {
  const queryClient = useQueryClient();

  const createRecord = useMutation({
    mutationFn: (groupId: string) => createManufacturingRecord(vehicleId, revisionId, groupId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["manufacturing", vehicleId, revisionId] }),
  });

  const built = useMutation({
    mutationFn: (recordId: string) => markBuilt(vehicleId, revisionId, recordId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["manufacturing", vehicleId, revisionId] }),
  });

  const continuity = useMutation({
    mutationFn: ({ recordId, passed }: { recordId: string; passed: boolean }) =>
      addContinuityCheck(vehicleId, revisionId, recordId, passed),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["manufacturing", vehicleId, revisionId] }),
  });

  if (isLoading) {
    return (
      <div>
        <p className="mb-2 text-xs uppercase text-tesla-muted">{title}</p>
        <p className="text-tesla-muted">Loading…</p>
      </div>
    );
  }

  if (!groups.length) {
    return (
      <div>
        <p className="mb-2 text-xs uppercase text-tesla-muted">{title}</p>
        <p className="text-tesla-muted">No harness groups — sync after wiring edges</p>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-2 text-xs uppercase text-tesla-muted">{title}</p>
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="text-tesla-muted">
            <th className="pb-1 pr-2">Harness</th>
            <th className="pb-1 pr-2">Wires</th>
            <th className="pb-1">Actions</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => {
            const record = records.find((r) => r.harness_group_id === g.id);
            return (
              <tr key={g.id} className="border-t border-tesla-border/50">
                <td className="py-1.5 pr-2">{g.name}</td>
                <td className="py-1.5 pr-2 text-tesla-muted">{g.edge_ids.length}</td>
                <td className="py-1.5">
                  <div className="flex flex-wrap gap-1">
                    {!record && (
                      <MiniButton
                        label="Track"
                        onClick={() => createRecord.mutate(g.id)}
                      />
                    )}
                    {record && record.status !== "built" && (
                      <MiniButton label="Built" onClick={() => built.mutate(record.id)} />
                    )}
                    {record && !record.continuity_checked_at && (
                      <>
                        <MiniButton
                          label="✓"
                          onClick={() =>
                            continuity.mutate({ recordId: record.id, passed: true })
                          }
                        />
                        <MiniButton
                          label="✗"
                          variant="warn"
                          onClick={() =>
                            continuity.mutate({ recordId: record.id, passed: false })
                          }
                        />
                      </>
                    )}
                    {record?.continuity_checked_at && (
                      <span
                        className={clsx(
                          "text-xs",
                          record.continuity_checked_by ? "text-tesla-success" : "",
                        )}
                      >
                        Checked
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MiniButton({
  label,
  onClick,
  variant = "default",
}: {
  label: string;
  onClick: () => void;
  variant?: "default" | "warn";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "rounded px-1.5 py-0.5 transition",
        variant === "warn"
          ? "border border-tesla-warning/50 text-tesla-warning hover:bg-tesla-warning/10"
          : "border border-tesla-border hover:border-tesla-accent",
      )}
    >
      {label}
    </button>
  );
}
