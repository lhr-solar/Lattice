import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { ApiError } from "@/api/client";
import {
  createPinNameEntry,
  deletePinNameEntry,
  fetchPinNameLibrary,
  updatePinNameEntry,
  type PinNameEntry,
} from "@/api/pinNames";
import { useAppStore } from "@/stores/appStore";
import { ConfirmModal } from "@/components/ui/Modal";

export function PinNameLibraryModal() {
  const queryClient = useQueryClient();
  const vehicleId = useAppStore((s) => s.selectedVehicleId);
  const showPinNameLibrary = useAppStore((s) => s.showPinNameLibrary);
  const setShowPinNameLibrary = useAppStore((s) => s.setShowPinNameLibrary);

  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PinNameEntry | null>(null);

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["pin-name-library", vehicleId, search],
    queryFn: () => fetchPinNameLibrary(vehicleId!, search || undefined),
    enabled: Boolean(showPinNameLibrary && vehicleId),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["pin-name-library"] });

  const createMutation = useMutation({
    mutationFn: () =>
      createPinNameEntry(vehicleId!, {
        name: newName.trim(),
        description: newDescription.trim() || null,
      }),
    onSuccess: (entry) => {
      setNewName("");
      setNewDescription("");
      setMessage(null);
      setSelectedId(entry.id);
      setEditName(entry.name);
      setEditDescription(entry.description ?? "");
      invalidate();
    },
    onError: (error) => {
      setMessage(
        error instanceof ApiError ? `Could not add name (${error.status}).` : "Could not add name.",
      );
    },
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      updatePinNameEntry(vehicleId!, selectedId!, {
        name: editName.trim(),
        description: editDescription.trim() || null,
      }),
    onSuccess: () => {
      setMessage(null);
      invalidate();
    },
    onError: (error) => {
      setMessage(
        error instanceof ApiError ? `Could not save name (${error.status}).` : "Could not save name.",
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (entryId: string) => deletePinNameEntry(vehicleId!, entryId),
    onSuccess: () => {
      if (selectedId === deleteTarget?.id) {
        setSelectedId(null);
        setEditName("");
        setEditDescription("");
      }
      setDeleteTarget(null);
      invalidate();
    },
  });

  const sortedEntries = useMemo(
    () => [...entries].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
    [entries],
  );

  const selected = sortedEntries.find((e) => e.id === selectedId) ?? null;
  const canCreate = newName.trim().length > 0 && !createMutation.isPending;
  const canSave =
    Boolean(selected) &&
    editName.trim().length > 0 &&
    (editName.trim() !== selected?.name ||
      (editDescription.trim() || null) !== (selected?.description ?? null)) &&
    !updateMutation.isPending;

  if (!showPinNameLibrary) return null;

  return (
    <>
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 panel-fade-in">
        <div className="flex h-[min(640px,90vh)] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-tesla-border bg-tesla-surface shadow-2xl">
          <header className="flex items-center justify-between border-b border-tesla-border px-4 py-3">
            <div>
              <h2 className="text-lg font-semibold">Pin name library</h2>
              <p className="text-xs text-tesla-muted">
                Saved names for quick pick — pin instances store a copy, not a link
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowPinNameLibrary(false)}
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
                  placeholder="Search names…"
                  className="w-full rounded-md border border-tesla-border bg-tesla-bg px-3 py-1.5 text-sm outline-none focus:border-tesla-accent"
                />
                <div className="space-y-1">
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="New pin name"
                    className="w-full rounded-md border border-tesla-border bg-tesla-bg px-3 py-1.5 text-sm outline-none focus:border-tesla-accent"
                  />
                  <input
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="Optional note"
                    className="w-full rounded-md border border-tesla-border bg-tesla-bg px-3 py-1.5 text-sm outline-none focus:border-tesla-accent"
                  />
                  <button
                    type="button"
                    disabled={!canCreate}
                    onClick={() => createMutation.mutate()}
                    className="w-full rounded bg-tesla-accent px-3 py-1.5 text-sm text-white transition hover:bg-tesla-accent/90 disabled:opacity-40"
                  >
                    {createMutation.isPending ? "Adding…" : "Add to library"}
                  </button>
                </div>
              </div>
              <ul className="flex-1 overflow-y-auto p-2">
                {isLoading && <li className="p-2 text-sm text-tesla-muted">Loading…</li>}
                {sortedEntries.map((entry) => (
                  <li key={entry.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(entry.id);
                        setEditName(entry.name);
                        setEditDescription(entry.description ?? "");
                        setMessage(null);
                      }}
                      className={clsx(
                        "mb-1 w-full rounded-md px-3 py-2 text-left text-sm transition",
                        selectedId === entry.id
                          ? "bg-tesla-accent/15 text-tesla-text"
                          : "text-tesla-muted hover:bg-tesla-border/50 hover:text-tesla-text",
                      )}
                    >
                      <p className="truncate font-medium">{entry.name}</p>
                      {entry.description ? (
                        <p className="truncate text-xs text-tesla-muted">{entry.description}</p>
                      ) : null}
                    </button>
                  </li>
                ))}
                {!isLoading && sortedEntries.length === 0 && (
                  <li className="p-2 text-sm text-tesla-muted">No saved pin names yet</li>
                )}
              </ul>
            </div>

            <div className="flex w-1/2 flex-col p-4">
              {selected ? (
                <>
                  <h3 className="mb-3 text-sm font-medium">Edit entry</h3>
                  <label className="mb-3 block text-xs text-tesla-muted">
                    Name
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="mt-1 w-full rounded-md border border-tesla-border bg-tesla-bg px-3 py-1.5 text-sm outline-none focus:border-tesla-accent"
                    />
                  </label>
                  <label className="mb-4 block text-xs text-tesla-muted">
                    Note
                    <input
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      className="mt-1 w-full rounded-md border border-tesla-border bg-tesla-bg px-3 py-1.5 text-sm outline-none focus:border-tesla-accent"
                    />
                  </label>
                  <div className="mt-auto flex gap-2">
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(selected)}
                      className="rounded border border-tesla-border px-3 py-1.5 text-sm text-tesla-muted transition hover:border-red-500/60 hover:text-red-300"
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      disabled={!canSave}
                      onClick={() => updateMutation.mutate()}
                      className="rounded bg-tesla-accent px-3 py-1.5 text-sm text-white transition hover:bg-tesla-accent/90 disabled:opacity-40"
                    >
                      {updateMutation.isPending ? "Saving…" : "Save"}
                    </button>
                  </div>
                </>
              ) : (
                <p className="text-sm text-tesla-muted">Select a name to edit or add one on the left.</p>
              )}
            </div>
          </div>

          {message && (
            <footer className="border-t border-tesla-border px-4 py-2 text-xs text-tesla-muted">
              {message}
            </footer>
          )}
        </div>
      </div>
      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Delete pin name"
        message={
          deleteTarget
            ? `Remove "${deleteTarget.name}" from the library? Existing pin instances are not changed.`
            : ""
        }
        confirmLabel={deleteMutation.isPending ? "Deleting…" : "Delete"}
        destructive
        disabled={deleteMutation.isPending}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) return;
          deleteMutation.mutate(deleteTarget.id);
        }}
      />
    </>
  );
}
