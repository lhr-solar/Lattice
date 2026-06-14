import { useEffect, useMemo, useState } from "react";
import {
  ConnectorTemplatePicker,
  PcbTemplatePicker,
  connectorSubtitle,
  enclosureSubtitle,
  pcbSubtitle,
} from "@/components/library/TemplatePickers";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  connectorCategoryOf,
  createConnectorTemplate,
  deleteConnectorTemplate,
  fetchConnectorTemplates,
  supportsEnclosurePanelTemplate,
  supportsNodeSlotTemplate,
  supportsNodeSlotPigtailOption,
  nodeSlotAutoBubblesToEnclosure,
  updateConnectorTemplate,
  type ConnectorCategory,
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
import { useAppStore } from "@/stores/appStore";
import { ConfirmModal, Modal } from "@/components/ui/Modal";
import { SlotPinoutEditorModal } from "@/components/library/SlotPinoutEditorModal";
import type { PinMappingEntry } from "@/api/templates";

type Tab = "connector" | "node" | "enclosure";
type DeletionTarget =
  | { id: string; kind: "connector"; label: string }
  | { id: string; kind: "node"; label: string }
  | { id: string; kind: "enclosure"; label: string };

export function LibraryBuilders() {
  const vehicleId = useAppStore((s) => s.selectedVehicleId);
  const showLibraryManager = useAppStore((s) => s.showLibraryManager);
  const setShowLibraryManager = useAppStore((s) => s.setShowLibraryManager);
  const libraryTab = useAppStore((s) => s.libraryTab);
  const setLibraryTab = useAppStore((s) => s.setLibraryTab);
  const queryClient = useQueryClient();
  const invalidateTopologyQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["hierarchy"] });
    queryClient.invalidateQueries({ queryKey: ["design-projection"] });
    queryClient.invalidateQueries({ queryKey: ["topology-summary"] });
    queryClient.invalidateQueries({ queryKey: ["connection-table"] });
    queryClient.invalidateQueries({ queryKey: ["pins"] });
    queryClient.invalidateQueries({ queryKey: ["nets"] });
    queryClient.invalidateQueries({ queryKey: ["shorts"] });
  };
  const [activeTab, setActiveTab] = useState<Tab>(libraryTab);
  const [builderMode, setBuilderMode] = useState<null | "add" | "edit">(null);
  const [editingConnectorId, setEditingConnectorId] = useState<string | null>(null);
  const [editingPcbId, setEditingPcbId] = useState<string | null>(null);
  const [editingEnclosureId, setEditingEnclosureId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<DeletionTarget | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["connector-templates"] });
      invalidateTopologyQueries();
    },
  });
  const pcbCreate = useMutation({
    mutationFn: (payload: Parameters<typeof createPcbTemplate>[1]) =>
      createPcbTemplate(vehicleId!, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pcb-templates", vehicleId] });
      invalidateTopologyQueries();
    },
  });
  const enclosureCreate = useMutation({
    mutationFn: (payload: Parameters<typeof createEnclosureTemplate>[1]) =>
      createEnclosureTemplate(vehicleId!, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["enclosure-templates", vehicleId] });
      invalidateTopologyQueries();
    },
  });
  const connectorUpdate = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Parameters<typeof createConnectorTemplate>[0] }) =>
      updateConnectorTemplate(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["connector-templates"] });
      invalidateTopologyQueries();
    },
  });
  const pcbUpdate = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Parameters<typeof createPcbTemplate>[1] }) =>
      updatePcbTemplate(vehicleId!, id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pcb-templates", vehicleId] });
      invalidateTopologyQueries();
    },
  });
  const enclosureUpdate = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: Parameters<typeof createEnclosureTemplate>[1];
    }) => updateEnclosureTemplate(vehicleId!, id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["enclosure-templates", vehicleId] });
      invalidateTopologyQueries();
    },
  });
  const connectorDelete = useMutation({
    mutationFn: (id: string) => deleteConnectorTemplate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["connector-templates"] });
      invalidateTopologyQueries();
    },
  });
  const pcbDelete = useMutation({
    mutationFn: (id: string) => deletePcbTemplate(vehicleId!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pcb-templates", vehicleId] });
      invalidateTopologyQueries();
    },
  });
  const enclosureDelete = useMutation({
    mutationFn: (id: string) => deleteEnclosureTemplate(vehicleId!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["enclosure-templates", vehicleId] });
      invalidateTopologyQueries();
    },
  });
  const connectorEditing = connectorTemplates.find((c) => c.id === editingConnectorId) ?? null;
  const pcbEditing = pcbTemplates.find((p) => p.id === editingPcbId) ?? null;
  const enclosureEditing = enclosureTemplates.find((e) => e.id === editingEnclosureId) ?? null;
  const selectedVehicleName =
    vehicles.find((v) => v.id === vehicleId)?.name ??
    (vehicleId ? `${vehicleId.slice(0, 8)}…` : "No vehicle selected");
  const deletePending = connectorDelete.isPending || pcbDelete.isPending || enclosureDelete.isPending;

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
        showCloseButton
        layer="manager"
        panelClassName="flex h-[90vh] w-full max-w-[calc(100vw-2rem)] flex-col"
        bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        <div className="flex min-h-0 flex-1 flex-col space-y-3">
          <div className="flex items-center gap-2">
            {(["connector", "node", "enclosure"] as Tab[]).map((tab) => (
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
                {tab === "node" ? "Node" : tab === "connector" ? "Connector" : "Enclosure"}
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
              disabled={(activeTab === "node" || activeTab === "enclosure") && !vehicleId}
            >
              + Add
            </button>
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
                  subtitle: connectorSubtitle(c),
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
          {activeTab === "node" && (
            <>
              <p className="rounded border border-tesla-border px-2 py-1 text-xs text-tesla-muted">
                Editing Node library for vehicle:{" "}
                <span className="font-medium text-tesla-text">{selectedVehicleName}</span>
              </p>
              <LibraryList
                items={pcbTemplates
                  .map((p) => ({
                    id: p.id,
                    title: p.name,
                    subtitle: pcbSubtitle(p),
                  }))
                  .filter((item) =>
                    `${item.title} ${item.subtitle}`.toLowerCase().includes(search.toLowerCase()),
                  )}
                onDelete={(id) => {
                  const item = pcbTemplates.find((p) => p.id === id);
                  if (!item) return;
                  setDeleteError(null);
                  setDeleting({ id, kind: "node", label: item.name });
                }}
                onEdit={(id) => {
                  setActiveTab("node");
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
                    subtitle: enclosureSubtitle(e),
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
        open={showLibraryManager && activeTab === "node" && builderMode !== null}
        mode={builderMode === "edit" ? "edit" : "add"}
        initial={pcbEditing}
        onClose={() => {
          setBuilderMode(null);
          setEditingPcbId(null);
        }}
        connectors={connectorTemplates}
        onAddConnectorTemplate={() => {
          setBuilderMode("add");
          setActiveTab("connector");
        }}
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
        onAddConnectorTemplate={() => {
          setBuilderMode("add");
          setActiveTab("connector");
        }}
        onAddPcbTemplate={() => {
          setBuilderMode("add");
          setActiveTab("node");
        }}
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
          if (deleting.kind === "node") {
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
  const [wireGaugeAwg, setWireGaugeAwg] = useState("");
  const [malePn, setMalePn] = useState("");
  const [femalePn, setFemalePn] = useState("");
  const [maleCrimpPn, setMaleCrimpPn] = useState("");
  const [femaleCrimpPn, setFemaleCrimpPn] = useState("");
  const [maleImage, setMaleImage] = useState("");
  const [femaleImage, setFemaleImage] = useState("");
  const [keyCode, setKeyCode] = useState("");
  const [connectorCategory, setConnectorCategory] = useState<ConnectorCategory>("wire_to_wire");
  const [wireToWirePanelMount, setWireToWirePanelMount] = useState(false);
  const [wireToWireInline, setWireToWireInline] = useState(true);
  const [wireToBoardStyle, setWireToBoardStyle] = useState<"standard" | "panel_mount">("standard");
  const [voltageClass, setVoltageClass] = useState<"lv" | "hv">("lv");

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && initial) {
      setName(initial.name ?? "");
      setPinCount(initial.pin_count ?? 1);
      setManufacturer(initial.manufacturer ?? "");
      setWireGaugeAwg(
        initial.wire_gauge_awg !== null && initial.wire_gauge_awg !== undefined
          ? String(initial.wire_gauge_awg)
          : "",
      );
      setMalePn(initial.male_part_number ?? "");
      setFemalePn(initial.female_part_number ?? "");
      setMaleCrimpPn(initial.male_crimp_part_number ?? "");
      setFemaleCrimpPn(initial.female_crimp_part_number ?? "");
      setMaleImage(initial.male_image_url ?? "");
      setFemaleImage(initial.female_image_url ?? "");
      setKeyCode(initial.key_code ?? "");
      const category = connectorCategoryOf(initial);
      setConnectorCategory(category);
      if (category === "wire_to_board") {
        setWireToBoardStyle(initial.default_is_panel_mount ? "panel_mount" : "standard");
        setWireToWirePanelMount(false);
        setWireToWireInline(false);
      } else {
        setWireToWirePanelMount(Boolean(initial.default_is_panel_mount));
        setWireToWireInline(Boolean(initial.is_inline_template));
        setWireToBoardStyle("standard");
      }
      setVoltageClass("lv");
      return;
    }
    setName("");
    setPinCount(2);
    setManufacturer("");
    setWireGaugeAwg("");
    setMalePn("");
    setFemalePn("");
    setMaleCrimpPn("");
    setFemaleCrimpPn("");
    setMaleImage("");
    setFemaleImage("");
    setKeyCode("");
    setConnectorCategory("wire_to_wire");
    setWireToWirePanelMount(false);
    setWireToWireInline(true);
    setWireToBoardStyle("standard");
    setVoltageClass("lv");
  }, [open, mode, initial]);

  const canSubmit =
    Boolean(name.trim()) &&
    !pending &&
    (connectorCategory === "wire_to_board" ||
      wireToWirePanelMount ||
      wireToWireInline);

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
      layer="stacked"
      panelClassName="max-w-6xl"
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
            disabled={!canSubmit}
            className="rounded bg-tesla-accent px-3 py-1 text-sm text-white disabled:opacity-50"
            onClick={() =>
              onSubmit({
                name: name.trim(),
                pin_count: pinCount,
                manufacturer: manufacturer || undefined,
                wire_gauge_awg: wireGaugeAwg.trim() ? Number(wireGaugeAwg) : undefined,
                male_part_number: malePn || undefined,
                female_part_number: femalePn || undefined,
                male_crimp_part_number: maleCrimpPn || undefined,
                female_crimp_part_number: femaleCrimpPn || undefined,
                male_image_url: maleImage || undefined,
                female_image_url: femaleImage || undefined,
                key_code: keyCode || undefined,
                connector_category: connectorCategory,
                default_is_panel_mount:
                  connectorCategory === "wire_to_board"
                    ? wireToBoardStyle === "panel_mount"
                    : wireToWirePanelMount,
                is_inline_template:
                  connectorCategory === "wire_to_wire" && wireToWireInline,
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
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Name" value={name} onChange={setName} />
          <Field
            label="Pin count"
            value={String(pinCount)}
            onChange={(v) => setPinCount(Math.max(1, Number(v) || 1))}
          />
          <Field label="Manufacturer" value={manufacturer} onChange={setManufacturer} />
          <Field
            label="Wire gauge (AWG)"
            value={wireGaugeAwg}
            onChange={setWireGaugeAwg}
          />
          <Field label="Key" value={keyCode} onChange={setKeyCode} />
        </div>
        <div>
          <p className="mb-1 text-xs text-tesla-muted">Voltage class</p>
          <div className="relative flex rounded-md border border-tesla-border p-0.5">
            <span
              aria-hidden
              className="absolute bottom-0.5 left-0.5 top-0.5 rounded bg-tesla-accent transition-transform duration-200 ease-out"
              style={{
                width: "calc((100% - 0.25rem) / 2)",
                transform: `translateX(${voltageClass === "hv" ? 100 : 0}%)`,
              }}
            />
            <button
              type="button"
              onClick={() => setVoltageClass("lv")}
              className={`relative z-10 flex-1 rounded px-2 py-1.5 text-sm transition-colors ${
                voltageClass === "lv" ? "text-white" : "text-tesla-muted hover:text-tesla-text"
              }`}
            >
              LV
            </button>
            <button
              type="button"
              onClick={() => setVoltageClass("hv")}
              className={`relative z-10 flex-1 rounded px-2 py-1.5 text-sm transition-colors ${
                voltageClass === "hv" ? "text-white" : "text-tesla-muted hover:text-tesla-text"
              }`}
            >
              HV
            </button>
          </div>
        </div>
        <div>
          <p className="mb-1 text-xs text-tesla-muted">Connector category</p>
          <div className="relative flex rounded-md border border-tesla-border p-0.5">
            <span
              aria-hidden
              className="absolute bottom-0.5 left-0.5 top-0.5 rounded bg-tesla-accent transition-transform duration-200 ease-out"
              style={{
                width: "calc((100% - 0.25rem) / 2)",
                transform: `translateX(${connectorCategory === "wire_to_board" ? 100 : 0}%)`,
              }}
            />
            <button
              type="button"
              onClick={() => setConnectorCategory("wire_to_wire")}
              className={`relative z-10 flex-1 rounded px-2 py-1.5 text-sm transition-colors ${
                connectorCategory === "wire_to_wire"
                  ? "text-white"
                  : "text-tesla-muted hover:text-tesla-text"
              }`}
            >
              Wire-to-wire
            </button>
            <button
              type="button"
              onClick={() => setConnectorCategory("wire_to_board")}
              className={`relative z-10 flex-1 rounded px-2 py-1.5 text-sm transition-colors ${
                connectorCategory === "wire_to_board"
                  ? "text-white"
                  : "text-tesla-muted hover:text-tesla-text"
              }`}
            >
              Wire-to-board
            </button>
          </div>
        </div>
        {connectorCategory === "wire_to_wire" ? (
          <div>
            <p className="mb-1 text-xs text-tesla-muted">Capabilities</p>
            <div className="flex gap-2">
              <button
                type="button"
                aria-pressed={wireToWirePanelMount}
                onClick={() => setWireToWirePanelMount((prev) => !prev)}
                className={`flex-1 rounded-md border p-0.5 text-sm transition-colors ${
                  wireToWirePanelMount ? "border-tesla-accent" : "border-tesla-border"
                }`}
              >
                <span
                  className={`block rounded px-2 py-1.5 transition-colors ${
                    wireToWirePanelMount
                      ? "bg-tesla-accent text-white"
                      : "text-tesla-muted hover:text-tesla-text"
                  }`}
                >
                  Panel mount
                </span>
              </button>
              <button
                type="button"
                aria-pressed={wireToWireInline}
                onClick={() => setWireToWireInline((prev) => !prev)}
                className={`flex-1 rounded-md border p-0.5 text-sm transition-colors ${
                  wireToWireInline ? "border-tesla-accent" : "border-tesla-border"
                }`}
              >
                <span
                  className={`block rounded px-2 py-1.5 transition-colors ${
                    wireToWireInline
                      ? "bg-tesla-accent text-white"
                      : "text-tesla-muted hover:text-tesla-text"
                  }`}
                >
                  Inline
                </span>
              </button>
            </div>
            {!wireToWirePanelMount && !wireToWireInline && (
              <p className="mt-1 text-xs text-red-300">Select at least one capability.</p>
            )}
          </div>
        ) : (
          <div>
            <p className="mb-1 text-xs text-tesla-muted">Mount style</p>
            <div className="relative flex rounded-md border border-tesla-border p-0.5">
              <span
                aria-hidden
                className="absolute bottom-0.5 left-0.5 top-0.5 rounded bg-tesla-accent transition-transform duration-200 ease-out"
                style={{
                  width: "calc((100% - 0.25rem) / 2)",
                  transform: `translateX(${wireToBoardStyle === "panel_mount" ? 100 : 0}%)`,
                }}
              />
              <button
                type="button"
                onClick={() => setWireToBoardStyle("standard")}
                className={`relative z-10 flex-1 rounded px-2 py-1.5 text-sm transition-colors ${
                  wireToBoardStyle === "standard"
                    ? "text-white"
                    : "text-tesla-muted hover:text-tesla-text"
                }`}
              >
                Standard
              </button>
              <button
                type="button"
                onClick={() => setWireToBoardStyle("panel_mount")}
                className={`relative z-10 flex-1 rounded px-2 py-1.5 text-sm transition-colors ${
                  wireToBoardStyle === "panel_mount"
                    ? "text-white"
                    : "text-tesla-muted hover:text-tesla-text"
                }`}
              >
                Panel mount
              </button>
            </div>
          </div>
        )}
        <div className="space-y-2 rounded border border-tesla-border p-3">
          <p className="text-xs font-medium uppercase tracking-wider text-tesla-muted">
            Mating pair
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Male part #" value={malePn} onChange={setMalePn} />
            <Field label="Female part #" value={femalePn} onChange={setFemalePn} />
            <Field
              label="Male crimp #"
              value={maleCrimpPn}
              onChange={setMaleCrimpPn}
            />
            <Field
              label="Female crimp #"
              value={femaleCrimpPn}
              onChange={setFemaleCrimpPn}
            />
            <Field
              label="Male image URL"
              value={maleImage}
              onChange={setMaleImage}
            />
            <Field
              label="Female image URL"
              value={femaleImage}
              onChange={setFemaleImage}
            />
          </div>
        </div>
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
  onAddConnectorTemplate,
  onSubmit,
  pending,
}: {
  open: boolean;
  mode: "add" | "edit";
  initial: Awaited<ReturnType<typeof fetchPcbTemplates>>[number] | null;
  onClose: () => void;
  connectors: Awaited<ReturnType<typeof fetchConnectorTemplates>>;
  onAddConnectorTemplate: () => void;
  onSubmit: (payload: Parameters<typeof createPcbTemplate>[1]) => void;
  pending: boolean;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pinoutRowIdx, setPinoutRowIdx] = useState<number | null>(null);
  const [rows, setRows] = useState<
    Array<{
      slot_key: string;
      connector_template_id: string;
      export_to_enclosure: boolean;
      nickname: string;
      description: string;
      pin_mapping: PinMappingEntry[];
    }>
  >([]);

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
          nickname: s.nickname ?? "",
          description: s.description ?? "",
          pin_mapping: s.pin_mapping ?? [],
        })),
      );
      return;
    }
    setName("");
    setDescription("");
    setRows([]);
  }, [open, mode, initial]);

  const canSubmit = Boolean(name.trim()) && !pending;

  const nodeSlotConnectors = useMemo(
    () => connectors.filter((connector) => supportsNodeSlotTemplate(connector)),
    [connectors],
  );

  const connectorById = useMemo(
    () => new Map(connectors.map((connector) => [connector.id, connector])),
    [connectors],
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === "edit" ? "Edit Node Template" : "Node Builder"}
      layer="stacked"
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
                slots: rows
                  .filter((r) => r.slot_key && r.connector_template_id)
                  .map((r) => ({
                    slot_key: r.slot_key,
                    connector_template_id: r.connector_template_id,
                    export_to_enclosure: r.export_to_enclosure,
                    nickname: r.nickname.trim() || undefined,
                    description: r.description.trim() || undefined,
                    pin_mapping: r.pin_mapping,
                  })),
              })
            }
          >
            {pending ? (mode === "edit" ? "Saving..." : "Creating...") : mode === "edit" ? "Save" : "Create"}
          </button>
        </>
      }
    >
      <div className="space-y-2">
        <Field label="Node name" value={name} onChange={setName} />
        <Field label="Description" value={description} onChange={setDescription} />
        <button
          type="button"
          className="rounded border border-tesla-border px-2 py-1 text-xs"
          onClick={() =>
            setRows((prev) => [
              ...prev,
              {
                slot_key: `J${prev.length + 1}`,
                connector_template_id: "",
                export_to_enclosure: false,
                nickname: "",
                description: "",
                pin_mapping: [],
              },
            ])
          }
        >
          + Add connector slot
        </button>
        {rows.map((row, idx) => {
          const selectedConnector = row.connector_template_id
            ? connectorById.get(row.connector_template_id)
            : undefined;
          return (
          <div key={`${row.slot_key}-${idx}`} className="space-y-2 rounded border border-tesla-border p-2">
            <div className="flex items-start gap-2">
              <div className="w-28 shrink-0">
                <Field
                  label="Slot"
                  value={row.slot_key}
                  onChange={(v) =>
                    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, slot_key: v } : r)))
                  }
                />
              </div>
              <div className="min-w-0 flex-1">
                <ConnectorTemplatePicker
                  connectors={nodeSlotConnectors}
                  value={row.connector_template_id}
                  onChange={(connectorId) =>
                    setRows((prev) =>
                      prev.map((r, i) => {
                        if (i !== idx) return r;
                        const tmpl = connectorId ? connectorById.get(connectorId) : undefined;
                        return {
                          ...r,
                          connector_template_id: connectorId,
                          export_to_enclosure:
                            tmpl && supportsNodeSlotPigtailOption(tmpl)
                              ? r.export_to_enclosure
                              : false,
                          pin_mapping: connectorId === r.connector_template_id ? r.pin_mapping : [],
                        };
                      }),
                    )
                  }
                  onAddAction={onAddConnectorTemplate}
                />
              </div>
              <RemoveLineButton
                onClick={() => setRows((prev) => prev.filter((_, i) => i !== idx))}
                label="Remove connector slot"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field
                label="Nickname"
                value={row.nickname}
                onChange={(v) =>
                  setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, nickname: v } : r)))
                }
              />
              <Field
                label="Description"
                value={row.description}
                onChange={(v) =>
                  setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, description: v } : r)))
                }
              />
            </div>
            {(() => {
              const selected = selectedConnector;
              if (!selected) return null;
              if (supportsNodeSlotPigtailOption(selected)) {
                return (
                  <label className="flex items-center gap-2 text-xs text-tesla-muted">
                    <input
                      type="checkbox"
                      checked={row.export_to_enclosure}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((r, i) =>
                            i === idx ? { ...r, export_to_enclosure: e.target.checked } : r,
                          ),
                        )
                      }
                    />
                    Pigtail this connector (export pins to parent enclosure)
                  </label>
                );
              }
              if (nodeSlotAutoBubblesToEnclosure(selected)) {
                return (
                  <p className="text-xs text-tesla-muted">
                    Panel mount connectors bubble up to the parent enclosure when the node is
                    placed inside one; at vehicle level they stay on the node.
                  </p>
                );
              }
              return null;
            })()}
            {row.connector_template_id && (
              <button
                type="button"
                className="rounded border border-tesla-border px-2 py-1 text-xs text-tesla-muted transition hover:border-tesla-accent hover:text-tesla-text"
                onClick={() => setPinoutRowIdx(idx)}
              >
                Edit pinout
                {row.pin_mapping.length > 0 ? ` (${row.pin_mapping.length} named)` : ""}
              </button>
            )}
          </div>
          );
        })}
      </div>
      <SlotPinoutEditorModal
        open={pinoutRowIdx !== null}
        slotLabel={
          pinoutRowIdx !== null
            ? `Slot ${rows[pinoutRowIdx]?.slot_key ?? ""}`
            : "Connector slot"
        }
        connector={
          pinoutRowIdx !== null && rows[pinoutRowIdx]?.connector_template_id
            ? connectorById.get(rows[pinoutRowIdx].connector_template_id) ?? null
            : null
        }
        pinMapping={pinoutRowIdx !== null ? rows[pinoutRowIdx]?.pin_mapping ?? [] : []}
        onClose={() => setPinoutRowIdx(null)}
        onSave={(mapping) => {
          if (pinoutRowIdx === null) return;
          setRows((prev) =>
            prev.map((r, i) => (i === pinoutRowIdx ? { ...r, pin_mapping: mapping } : r)),
          );
        }}
      />
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
  onAddConnectorTemplate,
  onAddPcbTemplate,
  onSubmit,
  pending,
}: {
  open: boolean;
  mode: "add" | "edit";
  initial: Awaited<ReturnType<typeof fetchEnclosureTemplates>>[number] | null;
  onClose: () => void;
  connectors: Awaited<ReturnType<typeof fetchConnectorTemplates>>;
  pcbs: Awaited<ReturnType<typeof fetchPcbTemplates>>;
  onAddConnectorTemplate: () => void;
  onAddPcbTemplate: () => void;
  onSubmit: (payload: Parameters<typeof createEnclosureTemplate>[1]) => void;
  pending: boolean;
}) {
  const [name, setName] = useState("");
  const [pinoutRowIdx, setPinoutRowIdx] = useState<number | null>(null);
  const [panelSlots, setPanelSlots] = useState<
    Array<{ slot_key: string; connector_template_id: string; pin_mapping: PinMappingEntry[] }>
  >([]);
  const [pcbSlots, setPcbSlots] = useState<Array<{ slot_key: string; pcb_template_id: string }>>([]);
  const panelMountConnectors = useMemo(
    () => connectors.filter((connector) => supportsEnclosurePanelTemplate(connector)),
    [connectors],
  );
  const connectorById = useMemo(
    () => new Map(connectors.map((connector) => [connector.id, connector])),
    [connectors],
  );

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && initial) {
      setName(initial.name ?? "");
      setPanelSlots(
        (initial.slots ?? []).map((s) => ({
          slot_key: s.slot_key,
          connector_template_id: s.connector_template_id,
          pin_mapping: s.pin_mapping ?? [],
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
      layer="stacked"
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
                {
                  slot_key: `PM${prev.length + 1}`,
                  connector_template_id: "",
                  pin_mapping: [],
                },
              ])
            }
          >
            + Add panel connector
          </button>
          {panelSlots.map((row, idx) => (
            <div key={`${row.slot_key}-${idx}`} className="mt-2 space-y-2 rounded border border-tesla-border p-2">
              <div className="flex items-start gap-2">
              <div className="w-28 shrink-0">
                <Field
                  label="Slot"
                  value={row.slot_key}
                  onChange={(v) =>
                    setPanelSlots((prev) => prev.map((r, i) => (i === idx ? { ...r, slot_key: v } : r)))
                  }
                />
              </div>
              <div className="min-w-0 flex-1">
                <ConnectorTemplatePicker
                  label="Connector"
                  connectors={panelMountConnectors}
                  value={row.connector_template_id}
                  onChange={(connectorId) =>
                    setPanelSlots((prev) =>
                      prev.map((r, i) =>
                        i === idx
                          ? {
                              ...r,
                              connector_template_id: connectorId,
                              pin_mapping:
                                connectorId === r.connector_template_id ? r.pin_mapping : [],
                            }
                          : r,
                      ),
                    )
                  }
                  onAddAction={onAddConnectorTemplate}
                />
              </div>
              <RemoveLineButton
                onClick={() => setPanelSlots((prev) => prev.filter((_, i) => i !== idx))}
                label="Remove panel connector"
              />
              </div>
              {row.connector_template_id && (
                <button
                  type="button"
                  className="rounded border border-tesla-border px-2 py-1 text-xs text-tesla-muted transition hover:border-tesla-accent hover:text-tesla-text"
                  onClick={() => setPinoutRowIdx(idx)}
                >
                  Edit pinout
                  {row.pin_mapping.length > 0 ? ` (${row.pin_mapping.length} named)` : ""}
                </button>
              )}
            </div>
          ))}
        </div>
        <SlotPinoutEditorModal
          open={pinoutRowIdx !== null}
          slotLabel={
            pinoutRowIdx !== null
              ? `Panel ${panelSlots[pinoutRowIdx]?.slot_key ?? ""}`
              : "Panel connector"
          }
          connector={
            pinoutRowIdx !== null && panelSlots[pinoutRowIdx]?.connector_template_id
              ? connectorById.get(panelSlots[pinoutRowIdx].connector_template_id) ?? null
              : null
          }
          pinMapping={pinoutRowIdx !== null ? panelSlots[pinoutRowIdx]?.pin_mapping ?? [] : []}
          onClose={() => setPinoutRowIdx(null)}
          onSave={(mapping) => {
            if (pinoutRowIdx === null) return;
            setPanelSlots((prev) =>
              prev.map((r, i) => (i === pinoutRowIdx ? { ...r, pin_mapping: mapping } : r)),
            );
          }}
        />
        <div>
          <button
            type="button"
            className="rounded border border-tesla-border px-2 py-1 text-xs"
            onClick={() =>
              setPcbSlots((prev) => [...prev, { slot_key: `NODE${prev.length + 1}`, pcb_template_id: "" }])
            }
          >
            + Add Node
          </button>
          {pcbSlots.map((row, idx) => (
            <div key={`${row.slot_key}-${idx}`} className="mt-2 flex items-start gap-2 rounded border border-tesla-border p-2">
              <div className="w-28 shrink-0">
                <Field
                  label="Slot"
                  value={row.slot_key}
                  onChange={(v) =>
                    setPcbSlots((prev) => prev.map((r, i) => (i === idx ? { ...r, slot_key: v } : r)))
                  }
                />
              </div>
              <div className="min-w-0 flex-1">
                <PcbTemplatePicker
                  pcbs={pcbs}
                  value={row.pcb_template_id}
                  onChange={(pcbId) =>
                    setPcbSlots((prev) =>
                      prev.map((r, i) => (i === idx ? { ...r, pcb_template_id: pcbId } : r)),
                    )
                  }
                  onAddAction={onAddPcbTemplate}
                />
              </div>
              <RemoveLineButton
                onClick={() => setPcbSlots((prev) => prev.filter((_, i) => i !== idx))}
                label="Remove node slot"
              />
            </div>
          ))}
        </div>
        <p className="text-xs text-tesla-muted">
          Panel slots accept wire-to-wire connectors with panel mount enabled. Node slots on
          attached nodes use wire-to-board connectors only.
        </p>
      </div>
    </Modal>
  );
}

function RemoveLineButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <div className="flex shrink-0 flex-col gap-1 self-start">
      <span className="pointer-events-none select-none text-xs leading-none text-transparent" aria-hidden>
        Remove
      </span>
      <button
        type="button"
        className="flex size-8 shrink-0 items-center justify-center rounded border border-tesla-border bg-tesla-bg text-base leading-none text-tesla-muted transition hover:border-red-500/50 hover:text-red-300"
        onClick={onClick}
        title={label}
        aria-label={label}
      >
        ×
      </button>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-tesla-muted">
      {label}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="h-8 rounded border border-tesla-border bg-tesla-bg px-2 text-sm text-tesla-text disabled:opacity-50"
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
