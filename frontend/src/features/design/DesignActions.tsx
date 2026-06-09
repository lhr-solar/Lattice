import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchConnectorTemplates } from "@/api/connectorTemplates";
import { createConnector, createEnclosure, createPcb } from "@/api/instances";
import {
  fetchEnclosureTemplates,
  fetchPcbTemplates,
} from "@/api/templates";
import { fetchHierarchy } from "@/api/hierarchy";
import { useAppStore } from "@/stores/appStore";
import { Modal } from "@/components/ui/Modal";
import {
  ConnectorTemplatePicker,
  EnclosureTemplatePicker,
  InstancePicker,
  PcbTemplatePicker,
} from "@/components/library/TemplatePickers";

type AddKind = "enclosure" | "node" | "inline";

export function DesignActions() {
  const queryClient = useQueryClient();
  const vehicleId = useAppStore((s) => s.selectedVehicleId);
  const revisionId = useAppStore((s) => s.selectedRevisionId);
  const selectedNodeId = useAppStore((s) => s.selectedNodeId);
  const selectedNodeKind = useAppStore((s) => s.selectedNodeKind);
  const setShowLibraryManager = useAppStore((s) => s.setShowLibraryManager);
  const setLibraryTab = useAppStore((s) => s.setLibraryTab);
  const [activeAdd, setActiveAdd] = useState<AddKind | null>(null);
  const [templateId, setTemplateId] = useState("");
  const [nickname, setNickname] = useState("");
  const [targetEnclosureId, setTargetEnclosureId] = useState("");

  const { data: connectors = [] } = useQuery({
    queryKey: ["connector-templates"],
    queryFn: fetchConnectorTemplates,
  });

  const { data: pcbTemplates = [] } = useQuery({
    queryKey: ["pcb-templates", vehicleId],
    queryFn: () => fetchPcbTemplates(vehicleId!),
    enabled: Boolean(vehicleId),
  });

  const { data: encTemplates = [] } = useQuery({
    queryKey: ["enclosure-templates", vehicleId],
    queryFn: () => fetchEnclosureTemplates(vehicleId!),
    enabled: Boolean(vehicleId),
  });

  const { data: hierarchy } = useQuery({
    queryKey: ["hierarchy", vehicleId, revisionId],
    queryFn: () => fetchHierarchy(vehicleId!, revisionId!),
    enabled: Boolean(vehicleId && revisionId),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["hierarchy"] });
    queryClient.invalidateQueries({ queryKey: ["design-projection"] });
    queryClient.invalidateQueries({ queryKey: ["topology-summary"] });
  };

  const inlineTemplates = useMemo(
    () => connectors.filter((c) => Boolean(c.is_inline_template)),
    [connectors],
  );

  const enclosureInstances = useMemo(
    () => hierarchy?.root.children.filter((node) => node.kind === "enclosure") ?? [],
    [hierarchy],
  );

  const addEnclosure = useMutation({
    mutationFn: async () => {
      if (!vehicleId || !revisionId || !templateId) return;
      await createEnclosure(vehicleId, revisionId, {
        enclosure_template_id: templateId,
        nickname: nickname.trim() || undefined,
      });
    },
    onSuccess: () => {
      closeAddModal();
      invalidate();
    },
  });

  const addPcb = useMutation({
    mutationFn: async () => {
      if (!vehicleId || !revisionId || !templateId || !targetEnclosureId) return;
      await createPcb(vehicleId, revisionId, {
        pcb_template_id: templateId,
        enclosure_instance_id: targetEnclosureId,
        nickname: nickname.trim() || undefined,
      });
    },
    onSuccess: () => {
      closeAddModal();
      invalidate();
    },
  });

  const addInlineConnector = useMutation({
    mutationFn: async () => {
      if (!vehicleId || !revisionId || !templateId) return;
      await createConnector(vehicleId, revisionId, {
        connector_template_id: templateId,
        is_panel_mount: false,
      });
    },
    onSuccess: () => {
      closeAddModal();
      invalidate();
    },
  });

  const pending =
    addEnclosure.isPending || addPcb.isPending || addInlineConnector.isPending;

  function openAddModal(kind: AddKind) {
    setActiveAdd(kind);
    setTemplateId("");
    setNickname("");
    if (kind === "node") {
      const preferredEnclosureId =
        selectedNodeKind === "enclosure" && selectedNodeId
          ? selectedNodeId
          : enclosureInstances[0]?.id ?? "";
      setTargetEnclosureId(preferredEnclosureId);
    } else {
      setTargetEnclosureId("");
    }
  }

  function closeAddModal() {
    setActiveAdd(null);
    setTemplateId("");
    setNickname("");
    setTargetEnclosureId("");
  }

  function handleAdd() {
    if (activeAdd === "enclosure") addEnclosure.mutate();
    if (activeAdd === "node") addPcb.mutate();
    if (activeAdd === "inline") addInlineConnector.mutate();
  }

  const canAdd =
    Boolean(templateId) &&
    !pending &&
    (activeAdd !== "node" || Boolean(targetEnclosureId));

  const addTitle =
    activeAdd === "enclosure"
      ? "Add Enclosure"
      : activeAdd === "node"
        ? "Add Node"
        : activeAdd === "inline"
          ? "Add Inline Connector"
          : "";

  if (!vehicleId || !revisionId) {
    return <p className="text-sm text-tesla-muted">Select a vehicle to design.</p>;
  }

  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs uppercase tracking-wider text-tesla-muted">Add from library</p>
      <div className="grid gap-2">
        <ActionButton label="Add Enclosure" onClick={() => openAddModal("enclosure")} />
        <ActionButton label="Add Node" onClick={() => openAddModal("node")} />
        <ActionButton label="Add Inline Connector" onClick={() => openAddModal("inline")} />
      </div>

      <Modal
        open={activeAdd !== null}
        onClose={closeAddModal}
        title={addTitle}
        footer={
          <>
            <button
              type="button"
              className="rounded border border-tesla-border px-3 py-1 text-sm"
              onClick={closeAddModal}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!canAdd}
              className="rounded bg-tesla-accent px-3 py-1 text-sm text-white disabled:opacity-50"
              onClick={handleAdd}
            >
              {pending ? "Adding…" : "Add"}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          {activeAdd === "enclosure" && (
            <EnclosureTemplatePicker
              enclosures={encTemplates}
              value={templateId}
              onChange={setTemplateId}
              onAddAction={() => {
                setLibraryTab("enclosure");
                setShowLibraryManager(true);
              }}
            />
          )}
          {activeAdd === "node" && (
            <>
              <PcbTemplatePicker
                pcbs={pcbTemplates}
                value={templateId}
                onChange={setTemplateId}
                onAddAction={() => {
                  setLibraryTab("node");
                  setShowLibraryManager(true);
                }}
              />
              <InstancePicker
                label="Target enclosure"
                instances={enclosureInstances}
                value={targetEnclosureId}
                onChange={setTargetEnclosureId}
                placeholder="Select enclosure instance…"
                onAddAction={() => openAddModal("enclosure")}
                addActionLabel="Add enclosure instance"
              />
            </>
          )}
          {activeAdd === "inline" && (
            <ConnectorTemplatePicker
              connectors={inlineTemplates}
              value={templateId}
              onChange={setTemplateId}
              label="Inline connector"
              onAddAction={() => {
                setLibraryTab("connector");
                setShowLibraryManager(true);
              }}
            />
          )}
          {(activeAdd === "enclosure" || activeAdd === "node") && (
            <label className="flex flex-col gap-1 text-xs text-tesla-muted">
              Custom name
              <input
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="Optional — uses template name if blank"
                className="rounded border border-tesla-border bg-tesla-bg px-2 py-1 text-sm text-tesla-text outline-none focus:border-tesla-accent"
              />
            </label>
          )}
        </div>
      </Modal>
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  disabled,
  variant = "default",
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: "default" | "accent";
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={
        variant === "accent"
          ? "w-full rounded-md bg-tesla-accent px-2 py-1.5 text-xs text-white disabled:opacity-40"
          : "w-full rounded-md border border-tesla-border px-2 py-1.5 text-xs text-tesla-text transition hover:border-tesla-accent disabled:opacity-40"
      }
    >
      {label}
    </button>
  );
}
