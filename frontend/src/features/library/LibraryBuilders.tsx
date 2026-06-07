import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createConnectorTemplate,
  deleteConnectorTemplate,
  fetchConnectorTemplates,
  updateConnectorTemplate,
} from "@/api/connectorTemplates";
import { fetchVehicles } from "@/api/vehicles";
import {
  createEnclosureTemplate,
  createPcbTemplate,
  deleteEnclosureTemplate,
  deletePcbTemplate,
  fetchEnclosureTemplates,
  fetchPcbTemplates,
  updateEnclosureTemplate,
  updatePcbTemplate,
} from "@/api/templates";
import { ApiError } from "@/api/client";
import { clearLibraries } from "@/api/devTools";
import { useAppStore } from "@/stores/appStore";
import { ConfirmModal, Modal } from "@/components/ui/Modal";

type Tab = "connector" | "pcb" | "enclosure";
type DeletionTarget =
  | { id: string; kind: "connector"; label: string }
  | { id: string; kind: "pcb"; label: string }
  | { id: string; kind: "enclosure"; label: string };

export function LibraryBuilders() {
  const vehicleId = useAppStore((s) => s.selectedVehicleId);
  const showLibraryManager = useAppStore((s) => s.showLibraryManager);
  const setShowLibraryManager = useAppStore((s) => s.setShowLibraryManager);
  const libraryTab = useAppStore((s) => s.libraryTab);
  const setLibraryTab = useAppStore((s) => s.setLibraryTab);
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>(libraryTab);
  const [builderMode, setBuilderMode] = useState<null | "add" | "edit">(null);
  const [editingConnectorId, setEditingConnectorId] = useState<string | null>(null);
  const [editingPcbId, setEditingPcbId] = useState<string | null>(null);
  const [editingEnclosureId, setEditingEnclosureId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<DeletionTarget | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showClearAllConfirm, setShowClearAllConfirm] = useState(false);
  const [clearAllError, setClearAllError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const { data: connectorTemplates = [] } = useQuery({
    queryKey: ["connector-templates"],
    queryFn: fetchConnectorTemplates,
  });
  const { data: vehicles = [] } = useQuery({
    queryKey: ["vehicles"],
    queryFn: fetchVehicles,
  });
  const { data: pcbTemplates = [] } = useQuery({
    queryKey: ["pcb-templates", vehicleId],
    queryFn: () => fetchPcbTemplates(vehicleId!),
    enabled: Boolean(vehicleId),
  });
  const { data: enclosureTemplates = [] } = useQuery({
    queryKey: ["enclosure-templates", vehicleId],
    queryFn: () => fetchEnclosureTemplates(vehicleId!),
    enabled: Boolean(vehicleId),
  });

  const connectorCreate = useMutation({
    mutationFn: createConnectorTemplate,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["connector-templates"] }),
  });
  const pcbCreate = useMutation({
    mutationFn: (payload: Parameters<typeof createPcbTemplate>[1]) =>
      createPcbTemplate(vehicleId!, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pcb-templates", vehicleId] }),
  });
  const enclosureCreate = useMutation({
    mutationFn: (payload: Parameters<typeof createEnclosureTemplate>[1]) =>
      createEnclosureTemplate(vehicleId!, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["enclosure-templates", vehicleId] }),
  });
  const connectorUpdate = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Parameters<typeof createConnectorTemplate>[0] }) =>
      updateConnectorTemplate(id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["connector-templates"] }),
  });
  const pcbUpdate = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Parameters<typeof createPcbTemplate>[1] }) =>
      updatePcbTemplate(vehicleId!, id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pcb-templates", vehicleId] }),
  });
  const enclosureUpdate = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: Parameters<typeof createEnclosureTemplate>[1];
    }) => updateEnclosureTemplate(vehicleId!, id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["enclosure-templates", vehicleId] }),
  });
  const connectorDelete = useMutation({
    mutationFn: (id: string) => deleteConnectorTemplate(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["connector-templates"] }),
  });
  const pcbDelete = useMutation({
    mutationFn: (id: string) => deletePcbTemplate(vehicleId!, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pcb-templates", vehicleId] }),
  });
  const enclosureDelete = useMutation({
    mutationFn: (id: string) => deleteEnclosureTemplate(vehicleId!, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["enclosure-templates", vehicleId] }),
  });
  const clearAllMutation = useMutation({
    mutationFn: clearLibraries,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["connector-templates"] }),
        queryClient.invalidateQueries({ queryKey: ["pcb-templates"] }),
        queryClient.invalidateQueries({ queryKey: ["enclosure-templates"] }),
      ]);
    },
  });

  const connectorEditing = connectorTemplates.find((c) => c.id === editingConnectorId) ?? null;
  const pcbEditing = pcbTemplates.find((p) => p.id === editingPcbId) ?? null;
  const enclosureEditing = enclosureTemplates.find((e) => e.id === editingEnclosureId) ?? null;
  const selectedVehicleName =
    vehicles.find((v) => v.id === vehicleId)?.name ??
    (vehicleId ? `${vehicleId.slice(0, 8)}…` : "No vehicle selected");
  const deletePending = connectorDelete.isPending || pcbDelete.isPending || enclosureDelete.isPending;
  const isDevMode = import.meta.env.DEV;

  useEffect(() => {
    if (!showLibraryManager) return;
    setActiveTab(libraryTab);
  }, [libraryTab, showLibraryManager]);

  useEffect(() => {
    setLibraryTab(activeTab);
  }, [activeTab, setLibraryTab]);

  return (
    <>
      <Modal
        open={showLibraryManager}
        onClose={() => setShowLibraryManager(false)}
        title="Library Manager"
        panelClassName="max-w-[min(96vw,1300px)] h-[min(92vh,920px)] flex flex-col"
        footer={
          <button
            type="button"
            className="rounded border border-tesla-border px-3 py-1 text-sm"
            onClick={() => setShowLibraryManager(false)}
          >
            Close
          </button>
        }
      >
        <div className="flex min-h-0 flex-1 flex-col space-y-3">
          <div className="flex items-center gap-2">
            {(["connector", "pcb", "enclosure"] as Tab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`rounded px-2 py-1 text-xs ${
                  activeTab === tab
                    ? "bg-tesla-accent text-white"
                    : "border border-tesla-border text-tesla-muted"
                }`}
              >
                {tab === "pcb" ? "PCB" : tab === "connector" ? "Connector" : "Enclosure"}
              </button>
            ))}
            <button
              type="button"
              className="ml-auto rounded border border-tesla-border px-2 py-1 text-xs"
              onClick={() => {
                setBuilderMode("add");
                setEditingConnectorId(null);
                setEditingPcbId(null);
                setEditingEnclosureId(null);
              }}
              disabled={(activeTab === "pcb" || activeTab === "enclosure") && !vehicleId}
            >
              + Add
            </button>
            {isDevMode && (
              <button
                type="button"
                className="rounded border border-red-500/50 px-2 py-1 text-xs text-red-300"
                onClick={() => {
                  setClearAllError(null);
                  setShowClearAllConfirm(true);
                }}
              >
                Clear All Libraries (Dev)
              </button>
            )}
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search library items..."
            className="rounded border border-tesla-border bg-tesla-bg px-3 py-1.5 text-sm text-tesla-text outline-none focus:border-tesla-accent"
          />
          {activeTab === "connector" && (
            <LibraryList
              items={connectorTemplates
                .map((c) => ({
                  id: c.id,
                  title: c.name,
                  subtitle: `${c.pin_count} pins${c.key_code ? ` · key ${c.key_code}` : ""}`,
                }))
                .filter((item) =>
                  `${item.title} ${item.subtitle}`.toLowerCase().includes(search.toLowerCase()),
                )}
              onDelete={(id) => {
                const item = connectorTemplates.find((c) => c.id === id);
                if (!item) return;
                setDeleteError(null);
                setDeleting({ id, kind: "connector", label: item.name });
              }}
              onEdit={(id) => {
                setActiveTab("connector");
                setEditingConnectorId(id);
                setEditingPcbId(null);
                setEditingEnclosureId(null);
                setBuilderMode("edit");
              }}
            />
          )}
          {activeTab === "pcb" && (
            <>
              <p className="rounded border border-tesla-border px-2 py-1 text-xs text-tesla-muted">
                Editing PCB library for vehicle:{" "}
                <span className="font-medium text-tesla-text">{selectedVehicleName}</span>
              </p>
              <LibraryList
                items={pcbTemplates
                  .map((p) => ({
                    id: p.id,
                    title: p.name,
                    subtitle: `${p.slots.length} connector slots`,
                  }))
                  .filter((item) =>
                    `${item.title} ${item.subtitle}`.toLowerCase().includes(search.toLowerCase()),
                  )}
                onDelete={(id) => {
                  const item = pcbTemplates.find((p) => p.id === id);
                  if (!item) return;
                  setDeleteError(null);
                  setDeleting({ id, kind: "pcb", label: item.name });
                }}
                onEdit={(id) => {
                  setActiveTab("pcb");
                  setEditingPcbId(id);
                  setEditingConnectorId(null);
                  setEditingEnclosureId(null);
                  setBuilderMode("edit");
                }}
              />
            </>
          )}
          {activeTab === "enclosure" && (
            <>
              <p className="rounded border border-tesla-border px-2 py-1 text-xs text-tesla-muted">
                Editing Enclosure library for vehicle:{" "}
                <span className="font-medium text-tesla-text">{selectedVehicleName}</span>
              </p>
              <LibraryList
                items={enclosureTemplates
                  .map((e) => ({
                    id: e.id,
                    title: e.name,
                    subtitle: `${e.slots.length} panel connectors · ${e.pcb_slots?.length ?? 0} pcbs`,
                  }))
                  .filter((item) =>
                    `${item.title} ${item.subtitle}`.toLowerCase().includes(search.toLowerCase()),
                  )}
                onDelete={(id) => {
                  const item = enclosureTemplates.find((e) => e.id === id);
                  if (!item) return;
                  setDeleteError(null);
                  setDeleting({ id, kind: "enclosure", label: item.name });
                }}
                onEdit={(id) => {
                  setActiveTab("enclosure");
                  setEditingEnclosureId(id);
                  setEditingConnectorId(null);
                  setEditingPcbId(null);
                  setBuilderMode("edit");
                }}
              />
            </>
          )}
        </div>
      </Modal>
      <ConnectorBuilderModal
        open={showLibraryManager && activeTab === "connector" && builderMode !== null}
        mode={builderMode === "edit" ? "edit" : "add"}
        initial={connectorEditing}
        onClose={() => {
          setBuilderMode(null);
          setEditingConnectorId(null);
        }}
        onSubmit={(payload) =>
          builderMode === "edit" && editingConnectorId
            ? connectorUpdate.mutate(
                { id: editingConnectorId, payload },
                { onSuccess: () => setBuilderMode(null) },
              )
            : connectorCreate.mutate(payload, { onSuccess: () => setBuilderMode(null) })
        }
        pending={connectorCreate.isPending || connectorUpdate.isPending}
      />
      <PcbBuilderModal
        open={showLibraryManager && activeTab === "pcb" && builderMode !== null}
        mode={builderMode === "edit" ? "edit" : "add"}
        initial={pcbEditing}
        onClose={() => {
          setBuilderMode(null);
          setEditingPcbId(null);
        }}
        connectors={connectorTemplates}
        onSubmit={(payload) =>
          builderMode === "edit" && editingPcbId
            ? pcbUpdate.mutate({ id: editingPcbId, payload }, { onSuccess: () => setBuilderMode(null) })
            : pcbCreate.mutate(payload, { onSuccess: () => setBuilderMode(null) })
        }
        pending={pcbCreate.isPending || pcbUpdate.isPending}
      />
      <EnclosureBuilderModal
        open={showLibraryManager && activeTab === "enclosure" && builderMode !== null}
        mode={builderMode === "edit" ? "edit" : "add"}
        initial={enclosureEditing}
        onClose={() => {
          setBuilderMode(null);
          setEditingEnclosureId(null);
        }}
        connectors={connectorTemplates}
        pcbs={pcbTemplates}
        onSubmit={(payload) =>
          builderMode === "edit" && editingEnclosureId
            ? enclosureUpdate.mutate(
                { id: editingEnclosureId, payload },
                { onSuccess: () => setBuilderMode(null) },
              )
            : enclosureCreate.mutate(payload, { onSuccess: () => setBuilderMode(null) })
        }
        pending={enclosureCreate.isPending || enclosureUpdate.isPending}
      />
      <ConfirmModal
        open={Boolean(deleting)}
        title="Delete library item"
        message={
          deleting
            ? `${`Delete ${deleting.kind} "${deleting.label}"?`}${
                deleteError ? `\n\n${deleteError}` : ""
              }`
            : ""
        }
        confirmLabel={deletePending ? "Deleting..." : "Delete"}
        destructive
        disabled={deletePending}
        onCancel={() => {
          setDeleting(null);
          setDeleteError(null);
        }}
        onConfirm={() => {
          if (!deleting) return;
          if (deleting.kind === "connector") {
            connectorDelete.mutate(deleting.id, {
              onSuccess: () => {
                setDeleting(null);
                setDeleteError(null);
              },
              onError: (error) => setDeleteError(getApiErrorMessage(error)),
            });
            return;
          }
          if (deleting.kind === "pcb") {
            pcbDelete.mutate(deleting.id, {
              onSuccess: () => {
                setDeleting(null);
                setDeleteError(null);
              },
              onError: (error) => setDeleteError(getApiErrorMessage(error)),
            });
            return;
          }
          enclosureDelete.mutate(deleting.id, {
            onSuccess: () => {
              setDeleting(null);
              setDeleteError(null);
            },
            onError: (error) => setDeleteError(getApiErrorMessage(error)),
          });
        }}
      />
      <ConfirmModal
        open={showClearAllConfirm}
        title="Clear all libraries (dev)"
        message={`Delete all connector, PCB, and enclosure library entries? This is for local development only.${
          clearAllError ? `\n\n${clearAllError}` : ""
        }`}
        confirmLabel={clearAllMutation.isPending ? "Clearing..." : "Clear all"}
        destructive
        disabled={clearAllMutation.isPending}
        onCancel={() => {
          setShowClearAllConfirm(false);
          setClearAllError(null);
        }}
        onConfirm={() =>
          clearAllMutation.mutate(undefined, {
            onSuccess: () => {
              setShowClearAllConfirm(false);
              setClearAllError(null);
            },
            onError: (error) => setClearAllError(getApiErrorMessage(error)),
          })
        }
      />
    </>
  );
}

function LibraryList({
  items,
  onDelete,
  onEdit,
}: {
  items: Array<{ id: string; title: string; subtitle: string }>;
  onDelete: (id: string) => void;
  onEdit: (id: string) => void;
}) {
  if (!items.length) {
    return <p className="text-sm text-tesla-muted">No items yet.</p>;
  }
  return (
    <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto">
      {items.map((item) => (
        <li
          key={item.id}
          className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded border border-tesla-border px-3 py-2"
        >
          <div>
            <p className="text-sm text-tesla-text">{item.title}</p>
            <p className="text-xs text-tesla-muted">{item.subtitle}</p>
          </div>
          <div className="flex items-center justify-end gap-1">
            <button
              type="button"
              className="rounded border border-tesla-border px-2 py-1 text-sm text-tesla-muted"
              onClick={() => onEdit(item.id)}
              title="Edit"
              aria-label="Edit"
            >
              ✎
            </button>
            <button
              type="button"
              className="rounded border border-red-500/50 px-2 py-1 text-sm text-red-300"
              onClick={() => onDelete(item.id)}
              title="Delete"
              aria-label="Delete"
            >
              🗑
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function ConnectorBuilderModal({
  open,
  mode,
  initial,
  onClose,
  onSubmit,
  pending,
}: {
  open: boolean;
  mode: "add" | "edit";
  initial: Awaited<ReturnType<typeof fetchConnectorTemplates>>[number] | null;
  onClose: () => void;
  onSubmit: (payload: Parameters<typeof createConnectorTemplate>[0]) => void;
  pending: boolean;
}) {
  const [name, setName] = useState("");
  const [pinCount, setPinCount] = useState(2);
  const [manufacturer, setManufacturer] = useState("");
  const [malePn, setMalePn] = useState("");
  const [femalePn, setFemalePn] = useState("");
  const [maleCrimpPn, setMaleCrimpPn] = useState("");
  const [femaleCrimpPn, setFemaleCrimpPn] = useState("");
  const [maleImage, setMaleImage] = useState("");
  const [femaleImage, setFemaleImage] = useState("");
  const [keyCode, setKeyCode] = useState("");
  const [defaultPanelMount, setDefaultPanelMount] = useState(false);
  const [isInlineTemplate, setIsInlineTemplate] = useState(false);
  const [voltageClass, setVoltageClass] = useState<"lv" | "hv">("lv");

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && initial) {
      setName(initial.name ?? "");
      setPinCount(initial.pin_count ?? 1);
      setManufacturer(initial.manufacturer ?? "");
      setMalePn(initial.male_part_number ?? "");
      setFemalePn(initial.female_part_number ?? "");
      setMaleCrimpPn(initial.male_crimp_part_number ?? "");
      setFemaleCrimpPn(initial.female_crimp_part_number ?? "");
      setMaleImage(initial.male_image_url ?? "");
      setFemaleImage(initial.female_image_url ?? "");
      setKeyCode(initial.key_code ?? "");
      setDefaultPanelMount(Boolean(initial.default_is_panel_mount));
      setIsInlineTemplate(Boolean(initial.is_inline_template));
      setVoltageClass("lv");
      return;
    }
    setName("");
    setPinCount(2);
    setManufacturer("");
    setMalePn("");
    setFemalePn("");
    setMaleCrimpPn("");
    setFemaleCrimpPn("");
    setMaleImage("");
    setFemaleImage("");
    setKeyCode("");
    setDefaultPanelMount(false);
    setIsInlineTemplate(false);
    setVoltageClass("lv");
  }, [open, mode, initial]);

  const pins = useMemo(
    () =>
      Array.from({ length: Math.max(1, pinCount) }, (_, i) => ({
        pin_number: i + 1,
        name: `${i + 1}`,
      })),
    [pinCount],
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === "edit" ? "Edit Connector Template" : "Connector Builder"}
      footer={
        <>
          <button
            type="button"
            className="rounded border border-tesla-border px-3 py-1 text-sm"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!name.trim() || pending}
            className="rounded bg-tesla-accent px-3 py-1 text-sm text-white disabled:opacity-50"
            onClick={() =>
              onSubmit({
                name: name.trim(),
                pin_count: pinCount,
                manufacturer: manufacturer || undefined,
                male_part_number: malePn || undefined,
                female_part_number: femalePn || undefined,
                male_crimp_part_number: maleCrimpPn || undefined,
                female_crimp_part_number: femaleCrimpPn || undefined,
                male_image_url: maleImage || undefined,
                female_image_url: femaleImage || undefined,
                key_code: keyCode || undefined,
                default_is_panel_mount: defaultPanelMount,
                is_inline_template: isInlineTemplate,
                pins: pins.map((p) => ({
                  ...p,
                  role: voltageClass,
                })),
              })
            }
          >
            {pending ? (mode === "edit" ? "Saving..." : "Creating...") : mode === "edit" ? "Save" : "Create"}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-2">
        <Field label="Name" value={name} onChange={setName} />
        <Field label="Pin count" value={String(pinCount)} onChange={(v) => setPinCount(Math.max(1, Number(v) || 1))} />
        <Field label="Manufacturer" value={manufacturer} onChange={setManufacturer} />
        <Field label="Key" value={keyCode} onChange={setKeyCode} />
        <Field label="Male part #" value={malePn} onChange={setMalePn} />
        <Field label="Female part #" value={femalePn} onChange={setFemalePn} />
        <Field label="Male crimp #" value={maleCrimpPn} onChange={setMaleCrimpPn} />
        <Field label="Female crimp #" value={femaleCrimpPn} onChange={setFemaleCrimpPn} />
        <Field label="Male image URL" value={maleImage} onChange={setMaleImage} />
        <Field label="Female image URL" value={femaleImage} onChange={setFemaleImage} />
        <label className="flex items-center gap-2 text-xs text-tesla-muted">
          Voltage class
          <select
            value={voltageClass}
            onChange={(e) => setVoltageClass(e.target.value as "lv" | "hv")}
            className="rounded border border-tesla-border bg-tesla-bg px-2 py-1 text-sm text-tesla-text"
          >
            <option value="lv">LV</option>
            <option value="hv">HV</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-tesla-muted">
          <input
            type="checkbox"
            checked={defaultPanelMount}
            onChange={(e) => setDefaultPanelMount(e.target.checked)}
            disabled={isInlineTemplate}
          />
          Default panel mount
        </label>
        <label className="flex items-center gap-2 text-xs text-tesla-muted">
          <input
            type="checkbox"
            checked={isInlineTemplate}
            onChange={(e) => {
              const checked = e.target.checked;
              if (checked) {
                setDefaultPanelMount(false);
              }
              setIsInlineTemplate(checked);
            }}
          />
          Inline-capable template
        </label>
      </div>
    </Modal>
  );
}

function PcbBuilderModal({
  open,
  mode,
  initial,
  onClose,
  connectors,
  onSubmit,
  pending,
}: {
  open: boolean;
  mode: "add" | "edit";
  initial: Awaited<ReturnType<typeof fetchPcbTemplates>>[number] | null;
  onClose: () => void;
  connectors: Awaited<ReturnType<typeof fetchConnectorTemplates>>;
  onSubmit: (payload: Parameters<typeof createPcbTemplate>[1]) => void;
  pending: boolean;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [rows, setRows] = useState<Array<{ slot_key: string; connector_template_id: string; export_to_enclosure: boolean }>>([]);

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && initial) {
      setName(initial.name ?? "");
      setDescription(initial.description ?? "");
      setRows(
        (initial.slots ?? []).map((s) => ({
          slot_key: s.slot_key,
          connector_template_id: s.connector_template_id,
          export_to_enclosure: Boolean(s.export_to_enclosure),
        })),
      );
      return;
    }
    setName("");
    setDescription("");
    setRows([]);
  }, [open, mode, initial]);

  const canSubmit = Boolean(name.trim()) && !pending;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === "edit" ? "Edit PCB Template" : "PCB Builder"}
      footer={
        <>
          <button type="button" className="rounded border border-tesla-border px-3 py-1 text-sm" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            className="rounded bg-tesla-accent px-3 py-1 text-sm text-white disabled:opacity-50"
            onClick={() =>
              onSubmit({
                name: name.trim(),
                description: description || undefined,
                slots: rows.filter((r) => r.slot_key && r.connector_template_id),
              })
            }
          >
            {pending ? (mode === "edit" ? "Saving..." : "Creating...") : mode === "edit" ? "Save" : "Create"}
          </button>
        </>
      }
    >
      <div className="space-y-2">
        <Field label="PCB name" value={name} onChange={setName} />
        <Field label="Description" value={description} onChange={setDescription} />
        <button
          type="button"
          className="rounded border border-tesla-border px-2 py-1 text-xs"
          onClick={() =>
            setRows((prev) => [
              ...prev,
              {
                slot_key: `J${prev.length + 1}`,
                connector_template_id: connectors[0]?.id ?? "",
                export_to_enclosure: false,
              },
            ])
          }
        >
          + Add connector slot
        </button>
        {rows.map((row, idx) => (
          <div key={`${row.slot_key}-${idx}`} className="grid grid-cols-4 gap-2 rounded border border-tesla-border p-2">
            <Field
              label="Slot"
              value={row.slot_key}
              onChange={(v) =>
                setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, slot_key: v } : r)))
              }
            />
            <label className="flex flex-col gap-1 text-xs text-tesla-muted">
              Connector
              <select
                value={row.connector_template_id}
                onChange={(e) =>
                  setRows((prev) =>
                    prev.map((r, i) => (i === idx ? { ...r, connector_template_id: e.target.value } : r)),
                  )
                }
                className="rounded border border-tesla-border bg-tesla-bg px-2 py-1 text-sm text-tesla-text"
              >
                <option value="">Select connector</option>
                {connectors.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="col-span-2 flex items-center gap-2 text-xs text-tesla-muted">
              <input
                type="checkbox"
                checked={row.export_to_enclosure}
                onChange={(e) =>
                  setRows((prev) =>
                    prev.map((r, i) => (i === idx ? { ...r, export_to_enclosure: e.target.checked } : r)),
                  )
                }
              />
              Export pins to enclosure (panel/pigtail override)
            </label>
          </div>
        ))}
      </div>
    </Modal>
  );
}

function EnclosureBuilderModal({
  open,
  mode,
  initial,
  onClose,
  connectors,
  pcbs,
  onSubmit,
  pending,
}: {
  open: boolean;
  mode: "add" | "edit";
  initial: Awaited<ReturnType<typeof fetchEnclosureTemplates>>[number] | null;
  onClose: () => void;
  connectors: Awaited<ReturnType<typeof fetchConnectorTemplates>>;
  pcbs: Awaited<ReturnType<typeof fetchPcbTemplates>>;
  onSubmit: (payload: Parameters<typeof createEnclosureTemplate>[1]) => void;
  pending: boolean;
}) {
  const [name, setName] = useState("");
  const [panelSlots, setPanelSlots] = useState<Array<{ slot_key: string; connector_template_id: string }>>([]);
  const [pcbSlots, setPcbSlots] = useState<Array<{ slot_key: string; pcb_template_id: string }>>([]);

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && initial) {
      setName(initial.name ?? "");
      setPanelSlots(
        (initial.slots ?? []).map((s) => ({
          slot_key: s.slot_key,
          connector_template_id: s.connector_template_id,
        })),
      );
      setPcbSlots(
        (initial.pcb_slots ?? []).map((s) => ({
          slot_key: s.slot_key,
          pcb_template_id: s.pcb_template_id,
        })),
      );
      return;
    }
    setName("");
    setPanelSlots([]);
    setPcbSlots([]);
  }, [open, mode, initial]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === "edit" ? "Edit Enclosure Template" : "Enclosure Builder"}
      footer={
        <>
          <button type="button" className="rounded border border-tesla-border px-3 py-1 text-sm" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            disabled={!name.trim() || pending}
            className="rounded bg-tesla-accent px-3 py-1 text-sm text-white disabled:opacity-50"
            onClick={() =>
              onSubmit({
                name: name.trim(),
                slots: panelSlots.filter((s) => s.slot_key && s.connector_template_id),
                pcb_slots: pcbSlots.filter((s) => s.slot_key && s.pcb_template_id),
              })
            }
          >
            {pending ? (mode === "edit" ? "Saving..." : "Creating...") : mode === "edit" ? "Save" : "Create"}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Enclosure name" value={name} onChange={setName} />
        <div>
          <button
            type="button"
            className="rounded border border-tesla-border px-2 py-1 text-xs"
            onClick={() =>
              setPanelSlots((prev) => [
                ...prev,
                { slot_key: `PM${prev.length + 1}`, connector_template_id: connectors[0]?.id ?? "" },
              ])
            }
          >
            + Add panel connector
          </button>
          {panelSlots.map((row, idx) => (
            <div key={`${row.slot_key}-${idx}`} className="mt-2 grid grid-cols-2 gap-2">
              <Field
                label="Slot"
                value={row.slot_key}
                onChange={(v) =>
                  setPanelSlots((prev) => prev.map((r, i) => (i === idx ? { ...r, slot_key: v } : r)))
                }
              />
              <label className="flex flex-col gap-1 text-xs text-tesla-muted">
                Connector
                <select
                  value={row.connector_template_id}
                  onChange={(e) =>
                    setPanelSlots((prev) =>
                      prev.map((r, i) => (i === idx ? { ...r, connector_template_id: e.target.value } : r)),
                    )
                  }
                  className="rounded border border-tesla-border bg-tesla-bg px-2 py-1 text-sm text-tesla-text"
                >
                  <option value="">Select connector</option>
                  {connectors.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ))}
        </div>
        <div>
          <button
            type="button"
            className="rounded border border-tesla-border px-2 py-1 text-xs"
            onClick={() =>
              setPcbSlots((prev) => [...prev, { slot_key: `PCB${prev.length + 1}`, pcb_template_id: pcbs[0]?.id ?? "" }])
            }
          >
            + Add PCB
          </button>
          {pcbSlots.map((row, idx) => (
            <div key={`${row.slot_key}-${idx}`} className="mt-2 grid grid-cols-2 gap-2">
              <Field
                label="Slot"
                value={row.slot_key}
                onChange={(v) =>
                  setPcbSlots((prev) => prev.map((r, i) => (i === idx ? { ...r, slot_key: v } : r)))
                }
              />
              <label className="flex flex-col gap-1 text-xs text-tesla-muted">
                PCB template
                <select
                  value={row.pcb_template_id}
                  onChange={(e) =>
                    setPcbSlots((prev) =>
                      prev.map((r, i) => (i === idx ? { ...r, pcb_template_id: e.target.value } : r)),
                    )
                  }
                  className="rounded border border-tesla-border bg-tesla-bg px-2 py-1 text-sm text-tesla-text"
                >
                  <option value="">Select PCB</option>
                  {pcbs.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ))}
        </div>
        <p className="text-xs text-tesla-muted">
          Enclosure-exposed pins can come from true panel connectors or PCB connectors marked
          as exported (panel/pigtail case by case).
        </p>
      </div>
    </Modal>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-tesla-muted">
      {label}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border border-tesla-border bg-tesla-bg px-2 py-1 text-sm text-tesla-text"
      />
    </label>
  );
}

function getApiErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const raw = error.message || "";
    try {
      const parsed = JSON.parse(raw) as { detail?: string };
      if (parsed.detail) return parsed.detail;
    } catch {
      // fall through to raw text
    }
    return raw || `Request failed (${error.status})`;
  }
  return "Delete failed. Please try again.";
}
