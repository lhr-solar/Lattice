import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { ApiError } from "@/api/client";
import { fetchConnectorTemplates } from "@/api/connectorTemplates";
import {
  createPinNameEntry,
  deletePinNameEntry,
  fetchPinNameLibrary,
  updatePinNameEntry,
  type PinNameEntry,
} from "@/api/pinNames";
import {
  createPinTemplate,
  deletePinTemplate,
  updatePinTemplate,
  type PinTemplate,
  type PinTemplateCreate,
} from "@/api/pinTemplates";
import { PinTemplateBuilderModal, pinTemplateSubtitle } from "@/features/library/PinTemplateBuilder";
import {
  fetchPinTemplateLibrary,
  fetchPinTemplatesForConnector,
  pinTemplateLibraryQueryKey,
  pinTemplatesForConnectorQueryKey,
} from "@/lib/pinTemplateQueries";
import { useAppStore } from "@/stores/appStore";
import { ConfirmModal, ModalOverlay } from "@/components/ui/Modal";

type Tab = "names" | "templates";

export function PinTemplatesModal() {
  const queryClient = useQueryClient();
  const vehicleId = useAppStore((s) => s.selectedVehicleId);
  const showPinTemplates = useAppStore((s) => s.showPinTemplates);
  const pinTemplatesMode = useAppStore((s) => s.pinTemplatesMode);
  const pinTemplatePickConnectorId = useAppStore((s) => s.pinTemplatePickConnectorId);
  const closePinTemplates = useAppStore((s) => s.closePinTemplates);
  const pickPinTemplate = useAppStore((s) => s.pickPinTemplate);
  const openPinTemplatesManage = useAppStore((s) => s.openPinTemplatesManage);
  const pinTemplatesInitialTab = useAppStore((s) => s.pinTemplatesInitialTab);

  const isPickMode = pinTemplatesMode === "pick" && Boolean(pinTemplatePickConnectorId);

  const [activeTab, setActiveTab] = useState<Tab>("templates");

  useEffect(() => {
    if (showPinTemplates && !isPickMode) setActiveTab(pinTemplatesInitialTab);
  }, [showPinTemplates, isPickMode, pinTemplatesInitialTab]);

  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [selectedNameId, setSelectedNameId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [deleteNameTarget, setDeleteNameTarget] = useState<PinNameEntry | null>(null);

  const [templateSearch, setTemplateSearch] = useState("");
  const [templateBuilderMode, setTemplateBuilderMode] = useState<null | "add" | "edit">(null);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [deleteTemplateTarget, setDeleteTemplateTarget] = useState<PinTemplate | null>(null);

  useEffect(() => {
    if (!showPinTemplates) return;
    setTemplateSearch("");
  }, [showPinTemplates, pinTemplatesMode, pinTemplatePickConnectorId]);

  const { data: nameEntries = [], isLoading: namesLoading } = useQuery({
    queryKey: ["pin-name-library", vehicleId, search],
    queryFn: () => fetchPinNameLibrary(vehicleId!, search || undefined),
    enabled: Boolean(showPinTemplates && vehicleId),
  });

  const { data: pinTemplates = [], isLoading: templatesLoading } = useQuery({
    queryKey: vehicleId
      ? isPickMode && pinTemplatePickConnectorId
        ? pinTemplatesForConnectorQueryKey(vehicleId, pinTemplatePickConnectorId)
        : pinTemplateLibraryQueryKey(vehicleId)
      : ["pin-template-library", "none"],
    queryFn: () =>
      isPickMode && pinTemplatePickConnectorId
        ? fetchPinTemplatesForConnector(vehicleId!, pinTemplatePickConnectorId)
        : fetchPinTemplateLibrary(vehicleId!),
    enabled: Boolean(showPinTemplates && vehicleId),
  });

  const { data: connectorTemplates = [] } = useQuery({
    queryKey: ["connector-templates"],
    queryFn: fetchConnectorTemplates,
    enabled: showPinTemplates,
  });

  const invalidateNames = () =>
    queryClient.invalidateQueries({ queryKey: ["pin-name-library"] });
  const invalidateTemplates = () => {
    queryClient.invalidateQueries({ queryKey: ["pin-template-library"] });
    queryClient.invalidateQueries({ queryKey: ["pin-templates-for-connector"] });
  };

  const createNameMutation = useMutation({
    mutationFn: () =>
      createPinNameEntry(vehicleId!, {
        name: newName.trim(),
        description: newDescription.trim() || null,
      }),
    onSuccess: (entry) => {
      setNewName("");
      setNewDescription("");
      setMessage(null);
      setSelectedNameId(entry.id);
      setEditName(entry.name);
      setEditDescription(entry.description ?? "");
      invalidateNames();
    },
    onError: (error) => {
      setMessage(
        error instanceof ApiError ? `Could not add name (${error.status}).` : "Could not add name.",
      );
    },
  });

  const updateNameMutation = useMutation({
    mutationFn: () =>
      updatePinNameEntry(vehicleId!, selectedNameId!, {
        name: editName.trim(),
        description: editDescription.trim() || null,
      }),
    onSuccess: () => {
      setMessage(null);
      invalidateNames();
    },
    onError: (error) => {
      setMessage(
        error instanceof ApiError ? `Could not save name (${error.status}).` : "Could not save name.",
      );
    },
  });

  const deleteNameMutation = useMutation({
    mutationFn: (entryId: string) => deletePinNameEntry(vehicleId!, entryId),
    onSuccess: () => {
      if (selectedNameId === deleteNameTarget?.id) {
        setSelectedNameId(null);
        setEditName("");
        setEditDescription("");
      }
      setDeleteNameTarget(null);
      invalidateNames();
    },
  });

  const templateCreate = useMutation({
    mutationFn: (payload: PinTemplateCreate) => createPinTemplate(vehicleId!, payload),
    onSuccess: () => {
      invalidateTemplates();
      setTemplateBuilderMode(null);
      setEditingTemplateId(null);
    },
  });

  const templateUpdate = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: PinTemplateCreate }) =>
      updatePinTemplate(vehicleId!, id, payload),
    onSuccess: () => {
      invalidateTemplates();
      setTemplateBuilderMode(null);
      setEditingTemplateId(null);
    },
  });

  const templateDelete = useMutation({
    mutationFn: (id: string) => deletePinTemplate(vehicleId!, id),
    onSuccess: () => {
      setDeleteTemplateTarget(null);
      invalidateTemplates();
    },
  });

  const sortedNames = useMemo(
    () => [...nameEntries].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
    [nameEntries],
  );

  const filteredTemplates = useMemo(
    () =>
      pinTemplates.filter((t) => {
        const haystack = `${t.name} ${pinTemplateSubtitle(t, connectorTemplates)}`.toLowerCase();
        return haystack.includes(templateSearch.toLowerCase());
      }),
    [pinTemplates, connectorTemplates, templateSearch],
  );

  const pickModeConnectorName = useMemo(() => {
    if (!pinTemplatePickConnectorId) return null;
    return connectorTemplates.find((c) => c.id === pinTemplatePickConnectorId)?.name ?? null;
  }, [connectorTemplates, pinTemplatePickConnectorId]);

  const selectedName = sortedNames.find((e) => e.id === selectedNameId) ?? null;
  const editingTemplate = pinTemplates.find((t) => t.id === editingTemplateId) ?? null;

  const canCreateName = newName.trim().length > 0 && !createNameMutation.isPending;
  const canSaveName =
    Boolean(selectedName) &&
    editName.trim().length > 0 &&
    (editName.trim() !== selectedName?.name ||
      (editDescription.trim() || null) !== (selectedName?.description ?? null)) &&
    !updateNameMutation.isPending;

  if (!showPinTemplates) return null;

  return (
    <>
      <ModalOverlay
        onClose={() => closePinTemplates()}
        layer="manager"
        ariaLabel={isPickMode ? "Select pin template" : "Pin templates"}
        panelClassName="flex h-[min(720px,92vh)] max-w-4xl flex-col overflow-hidden"
      >
          <header className="flex items-center justify-between border-b border-tesla-border px-4 py-3">
            <div>
              <h2 className="text-lg font-semibold">
                {isPickMode ? "Select pin template" : "Pin templates"}
              </h2>
              <p className="text-xs text-tesla-muted">
                {isPickMode
                  ? pickModeConnectorName
                    ? `Templates for ${pickModeConnectorName}`
                    : "Choose a template to apply to this connector"
                  : "Saved pin names for quick pick, and reusable connector pin templates"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => closePinTemplates()}
              className="rounded px-2 py-1 text-tesla-muted transition hover:bg-tesla-border hover:text-tesla-text"
            >
              ✕
            </button>
          </header>

          {!isPickMode && (
          <div className="flex gap-2 border-b border-tesla-border px-4 py-2">
            {(["templates", "names"] as Tab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={clsx(
                  "rounded px-2 py-1 text-xs",
                  activeTab === tab
                    ? "bg-tesla-accent text-white"
                    : "border border-tesla-border text-tesla-muted",
                )}
              >
                {tab === "templates" ? "Templates" : "Saved names"}
              </button>
            ))}
          </div>
          )}

          {!vehicleId ? (
            <p className="p-4 text-sm text-tesla-muted">Select a vehicle to manage pin templates.</p>
          ) : isPickMode ? (
            <div className="flex min-h-0 flex-1 flex-col p-4">
              <input
                value={templateSearch}
                onChange={(e) => setTemplateSearch(e.target.value)}
                placeholder="Search templates…"
                className="mb-3 w-full rounded border border-tesla-border bg-tesla-bg px-3 py-1.5 text-sm outline-none focus:border-tesla-accent"
                autoFocus
              />
              <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto">
                {templatesLoading && <li className="text-sm text-tesla-muted">Loading…</li>}
                {!templatesLoading &&
                  filteredTemplates.map((template) => (
                    <li key={template.id}>
                      <button
                        type="button"
                        onClick={() => pickPinTemplate(template)}
                        className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded border border-tesla-border px-3 py-2 text-left transition hover:border-tesla-accent"
                      >
                        <div>
                          <p className="text-sm text-tesla-text">{template.name}</p>
                          <p className="text-xs text-tesla-muted">
                            {pinTemplateSubtitle(template, connectorTemplates)}
                          </p>
                        </div>
                        <span className="rounded bg-tesla-accent px-2 py-1 text-xs text-white">Select</span>
                      </button>
                    </li>
                  ))}
                {!templatesLoading && filteredTemplates.length === 0 && (
                  <li className="text-sm text-tesla-muted">
                    No pin templates apply to this connector.
                  </li>
                )}
              </ul>
              <footer className="mt-3 flex justify-between border-t border-tesla-border pt-3">
                <button
                  type="button"
                  className="text-xs text-tesla-muted transition hover:text-tesla-text"
                  onClick={() => openPinTemplatesManage()}
                >
                  Manage templates…
                </button>
                <button
                  type="button"
                  className="rounded border border-tesla-border px-3 py-1.5 text-sm text-tesla-muted"
                  onClick={() => closePinTemplates()}
                >
                  Cancel
                </button>
              </footer>
            </div>
          ) : activeTab === "names" ? (
            <div className="flex min-h-0 flex-1">
              <div className="flex w-1/2 flex-col border-r border-tesla-border">
                <div className="space-y-2 border-b border-tesla-border p-3">
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search saved names…"
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
                      disabled={!canCreateName}
                      onClick={() => createNameMutation.mutate()}
                      className="w-full rounded bg-tesla-accent px-3 py-1.5 text-sm text-white transition hover:bg-tesla-accent/90 disabled:opacity-40"
                    >
                      {createNameMutation.isPending ? "Adding…" : "Add saved name"}
                    </button>
                  </div>
                </div>
                <ul className="flex-1 overflow-y-auto p-2">
                  {namesLoading && <li className="p-2 text-sm text-tesla-muted">Loading…</li>}
                  {sortedNames.map((entry) => (
                    <li key={entry.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedNameId(entry.id);
                          setEditName(entry.name);
                          setEditDescription(entry.description ?? "");
                          setMessage(null);
                        }}
                        className={clsx(
                          "mb-1 w-full rounded-md px-3 py-2 text-left text-sm transition",
                          selectedNameId === entry.id
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
                  {!namesLoading && sortedNames.length === 0 && (
                    <li className="p-2 text-sm text-tesla-muted">No saved pin names yet</li>
                  )}
                </ul>
              </div>
              <div className="flex w-1/2 flex-col p-4">
                {selectedName ? (
                  <>
                    <h3 className="mb-3 text-sm font-medium">Edit saved name</h3>
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
                        onClick={() => setDeleteNameTarget(selectedName)}
                        className="rounded border border-tesla-border px-3 py-1.5 text-sm text-tesla-muted transition hover:border-red-500/60 hover:text-red-300"
                      >
                        Delete
                      </button>
                      <button
                        type="button"
                        disabled={!canSaveName}
                        onClick={() => updateNameMutation.mutate()}
                        className="rounded bg-tesla-accent px-3 py-1.5 text-sm text-white transition hover:bg-tesla-accent/90 disabled:opacity-40"
                      >
                        {updateNameMutation.isPending ? "Saving…" : "Save"}
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-tesla-muted">Select a name to edit or add one on the left.</p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col p-4">
              <div className="mb-3 flex items-center gap-2">
                <input
                  value={templateSearch}
                  onChange={(e) => setTemplateSearch(e.target.value)}
                  placeholder="Search templates…"
                  className="min-w-0 flex-1 rounded border border-tesla-border bg-tesla-bg px-3 py-1.5 text-sm outline-none focus:border-tesla-accent"
                />
                <button
                  type="button"
                  className="shrink-0 rounded border border-tesla-border px-2 py-1 text-xs"
                  onClick={() => {
                    setTemplateBuilderMode("add");
                    setEditingTemplateId(null);
                  }}
                >
                  + Add template
                </button>
              </div>
              <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto">
                {filteredTemplates.map((template) => (
                  <li
                    key={template.id}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded border border-tesla-border px-3 py-2"
                  >
                    <div>
                      <p className="text-sm text-tesla-text">{template.name}</p>
                      <p className="text-xs text-tesla-muted">
                        {pinTemplateSubtitle(template, connectorTemplates)}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        className="rounded border border-tesla-border px-2 py-1 text-sm text-tesla-muted"
                        onClick={() => {
                          setEditingTemplateId(template.id);
                          setTemplateBuilderMode("edit");
                        }}
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        className="rounded border border-red-500/50 px-2 py-1 text-sm text-red-300"
                        onClick={() => setDeleteTemplateTarget(template)}
                      >
                        🗑
                      </button>
                    </div>
                  </li>
                ))}
                {filteredTemplates.length === 0 && (
                  <li className="text-sm text-tesla-muted">No templates yet.</li>
                )}
              </ul>
            </div>
          )}

          {message && (
            <footer className="border-t border-tesla-border px-4 py-2 text-xs text-tesla-muted">
              {message}
            </footer>
          )}
      </ModalOverlay>

      <PinTemplateBuilderModal
        open={templateBuilderMode !== null}
        mode={templateBuilderMode === "edit" ? "edit" : "add"}
        initial={editingTemplate}
        connectors={connectorTemplates}
        onClose={() => {
          setTemplateBuilderMode(null);
          setEditingTemplateId(null);
        }}
        onSubmit={(payload) =>
          templateBuilderMode === "edit" && editingTemplateId
            ? templateUpdate.mutate({ id: editingTemplateId, payload })
            : templateCreate.mutate(payload)
        }
        pending={templateCreate.isPending || templateUpdate.isPending}
      />

      <ConfirmModal
        open={Boolean(deleteNameTarget)}
        title="Delete saved name"
        message={
          deleteNameTarget
            ? `Remove "${deleteNameTarget.name}" from pin templates? Existing pin instances are not changed.`
            : ""
        }
        confirmLabel={deleteNameMutation.isPending ? "Deleting…" : "Delete"}
        destructive
        disabled={deleteNameMutation.isPending}
        onCancel={() => setDeleteNameTarget(null)}
        onConfirm={() => {
          if (!deleteNameTarget) return;
          deleteNameMutation.mutate(deleteNameTarget.id);
        }}
      />
      <ConfirmModal
        open={Boolean(deleteTemplateTarget)}
        title="Delete template"
        message={
          deleteTemplateTarget
            ? `Delete template "${deleteTemplateTarget.name}"? Connector instances are not linked to templates.`
            : ""
        }
        confirmLabel={templateDelete.isPending ? "Deleting…" : "Delete"}
        destructive
        disabled={templateDelete.isPending}
        onCancel={() => setDeleteTemplateTarget(null)}
        onConfirm={() => {
          if (!deleteTemplateTarget) return;
          templateDelete.mutate(deleteTemplateTarget.id);
        }}
      />
    </>
  );
}
