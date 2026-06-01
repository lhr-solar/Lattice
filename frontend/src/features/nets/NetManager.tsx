import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import {
  createNet,
  deleteNet,
  fetchNet,
  fetchNets,
  updateNet,
  type NetSummary,
} from "@/api/nets";
import { useAppStore } from "@/stores/appStore";
import { ConfirmModal } from "@/components/ui/Modal";

type FilterTab = "all" | "named" | "auto";

export function NetManager() {
  const queryClient = useQueryClient();
  const vehicleId = useAppStore((s) => s.selectedVehicleId);
  const revisionId = useAppStore((s) => s.selectedRevisionId);
  const showNetManager = useAppStore((s) => s.showNetManager);
  const setShowNetManager = useAppStore((s) => s.setShowNetManager);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterTab>("all");
  const [selectedNetId, setSelectedNetId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [newNetName, setNewNetName] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const autoNamedOnly = filter === "auto" ? true : filter === "named" ? false : undefined;

  const { data: nets = [], isLoading } = useQuery({
    queryKey: ["nets", vehicleId, revisionId, search, filter],
    queryFn: () =>
      fetchNets(vehicleId!, revisionId!, {
        search: search || undefined,
        auto_named_only: autoNamedOnly,
      }),
    enabled: Boolean(showNetManager && vehicleId && revisionId),
  });

  const { data: netDetail } = useQuery({
    queryKey: ["net-detail", vehicleId, revisionId, selectedNetId],
    queryFn: () => fetchNet(vehicleId!, revisionId!, selectedNetId!),
    enabled: Boolean(selectedNetId && vehicleId && revisionId),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["nets"] });
    queryClient.invalidateQueries({ queryKey: ["net-detail"] });
    queryClient.invalidateQueries({ queryKey: ["pins"] });
    queryClient.invalidateQueries({ queryKey: ["design-projection"] });
    queryClient.invalidateQueries({ queryKey: ["topology-summary"] });
  };

  const createMutation = useMutation({
    mutationFn: (name: string) => createNet(vehicleId!, revisionId!, { name }),
    onSuccess: (net) => {
      setNewNetName("");
      setSelectedNetId(net.id);
      setEditName(net.name);
      invalidate();
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => updateNet(vehicleId!, revisionId!, selectedNetId!, { name: editName }),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteNet(vehicleId!, revisionId!, selectedNetId!),
    onSuccess: (result) => {
      setSelectedNetId(null);
      invalidate();
      if (result.created_auto_nets.length) {
        setFilter("auto");
      }
    },
  });

  const sortedNets = useMemo(
    () => [...nets].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
    [nets],
  );

  if (!showNetManager) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 panel-fade-in">
      <div className="flex h-[min(640px,90vh)] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-tesla-border bg-tesla-surface shadow-2xl">
        <header className="flex items-center justify-between border-b border-tesla-border px-4 py-3">
          <div>
            <h2 className="text-lg font-semibold">Net manager</h2>
            <p className="text-xs text-tesla-muted">
              Logical nets — auto names use origin.conn.pin → dest.conn.pin
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowNetManager(false)}
            className="rounded px-2 py-1 text-tesla-muted transition hover:bg-tesla-border hover:text-tesla-text"
          >
            ✕
          </button>
        </header>

        <div className="flex min-h-0 flex-1">
          <div className="flex w-1/2 flex-col border-r border-tesla-border">
            <div className="space-y-2 border-b border-tesla-border p-3">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search nets…"
                className="w-full rounded-md border border-tesla-border bg-tesla-bg px-3 py-1.5 text-sm outline-none focus:border-tesla-accent"
              />
              <div className="flex gap-1">
                {(["all", "named", "auto"] as FilterTab[]).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setFilter(tab)}
                    className={clsx(
                      "rounded px-2 py-1 text-xs capitalize transition",
                      filter === tab
                        ? "bg-tesla-accent text-white"
                        : "text-tesla-muted hover:bg-tesla-border",
                    )}
                  >
                    {tab}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={newNetName}
                  onChange={(e) => setNewNetName(e.target.value)}
                  placeholder="New net name (e.g. CAN1_H)"
                  className="min-w-0 flex-1 rounded-md border border-tesla-border bg-tesla-bg px-2 py-1 text-sm"
                />
                <button
                  type="button"
                  disabled={!newNetName.trim() || createMutation.isPending}
                  onClick={() => createMutation.mutate(newNetName.trim())}
                  className="rounded-md bg-tesla-accent px-3 py-1 text-sm text-white disabled:opacity-40"
                >
                  Create
                </button>
              </div>
            </div>
            <ul className="flex-1 overflow-y-auto p-2">
              {isLoading && <li className="p-2 text-sm text-tesla-muted">Loading…</li>}
              {sortedNets.map((net) => (
                <NetListItem
                  key={net.id}
                  net={net}
                  selected={selectedNetId === net.id}
                  onSelect={() => {
                    setSelectedNetId(net.id);
                    setEditName(net.name);
                  }}
                />
              ))}
              {!isLoading && sortedNets.length === 0 && (
                <li className="p-2 text-sm text-tesla-muted">No nets match</li>
              )}
            </ul>
          </div>

          <div className="flex w-1/2 flex-col p-4">
            {!selectedNetId && (
              <p className="text-sm text-tesla-muted">Select a net to edit or delete</p>
            )}
            {selectedNetId && netDetail && (
              <>
                <label className="text-xs text-tesla-muted">Name</label>
                <div className="mb-3 flex gap-2">
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="min-w-0 flex-1 rounded-md border border-tesla-border bg-tesla-bg px-2 py-1.5 text-sm"
                  />
                  <button
                    type="button"
                    disabled={updateMutation.isPending || editName === netDetail.name}
                    onClick={() => updateMutation.mutate()}
                    className="rounded border border-tesla-border px-2 py-1 text-sm hover:border-tesla-accent"
                  >
                    Save
                  </button>
                </div>
                <p className="mb-2 text-xs text-tesla-muted">
                  {netDetail.is_auto_named ? "Auto-named" : netDetail.signal_kind} ·{" "}
                  {netDetail.pin_count} pin(s) · {netDetail.edge_ids.length} wire(s)
                </p>
                <ul className="mb-4 max-h-40 flex-1 overflow-y-auto rounded border border-tesla-border p-2 text-sm">
                  {netDetail.pins.length === 0 && (
                    <li className="text-tesla-muted">No pins on this net</li>
                  )}
                  {netDetail.pins.map((p) => (
                    <li key={p.pin_id} className="border-b border-tesla-border/40 py-1 last:border-0">
                      <span className="text-tesla-muted">{p.connector_label}</span> · {p.pin_name}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  disabled={deleteMutation.isPending}
                  onClick={() => setShowDeleteConfirm(true)}
                  className="rounded-md border border-tesla-accent/50 px-3 py-1.5 text-sm text-tesla-accent transition hover:bg-tesla-accent/10"
                >
                  {deleteMutation.isPending ? "Deleting..." : "Delete net"}
                </button>
                {deleteMutation.data && (
                  <p className="mt-2 text-xs text-tesla-muted">
                    Created: {deleteMutation.data.created_auto_nets.join(", ")}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
      <ConfirmModal
        open={showDeleteConfirm}
        title="Delete net"
        message={
          netDetail
            ? `Delete net "${netDetail.name}"? Pins will get auto-derived names (conn.pin or origin -> dest).`
            : "Delete selected net?"
        }
        confirmLabel={deleteMutation.isPending ? "Deleting..." : "Delete"}
        destructive
        disabled={deleteMutation.isPending}
        onCancel={() => setShowDeleteConfirm(false)}
        onConfirm={() => {
          deleteMutation.mutate(undefined, {
            onSuccess: () => setShowDeleteConfirm(false),
          });
        }}
      />
    </div>
  );
}

function NetListItem({
  net,
  selected,
  onSelect,
}: {
  net: NetSummary;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={clsx(
          "mb-0.5 flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm transition",
          selected ? "bg-tesla-accent/15" : "hover:bg-tesla-border/50",
        )}
      >
        <span className={net.is_auto_named ? "text-tesla-muted" : ""}>{net.name}</span>
        <span className="text-xs text-tesla-muted">{net.pin_count}</span>
      </button>
    </li>
  );
}
