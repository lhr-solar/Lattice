import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchConnectorTemplates } from "@/api/connectorTemplates";
import { createConnector, createEnclosure, createPcb } from "@/api/instances";
import {
  fetchEnclosureTemplates,
  fetchPcbTemplates,
} from "@/api/templates";
import { fetchHierarchy } from "@/api/hierarchy";
import { publishRevision } from "@/api/revisions";
import { useAppStore } from "@/stores/appStore";

export function DesignActions() {
  const queryClient = useQueryClient();
  const vehicleId = useAppStore((s) => s.selectedVehicleId);
  const revisionId = useAppStore((s) => s.selectedRevisionId);
  const selectVehicle = useAppStore((s) => s.selectVehicle);
  const [selectedEnclosureTemplateId, setSelectedEnclosureTemplateId] = useState<string>("");
  const [selectedPcbTemplateId, setSelectedPcbTemplateId] = useState<string>("");
  const [selectedInlineTemplateId, setSelectedInlineTemplateId] = useState<string>("");
  const [selectedInlineGender, setSelectedInlineGender] = useState<
    "male" | "female" | "hermaphroditic"
  >("male");
  const [inlineNickname, setInlineNickname] = useState("");

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

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["hierarchy"] });
    queryClient.invalidateQueries({ queryKey: ["design-projection"] });
    queryClient.invalidateQueries({ queryKey: ["topology-summary"] });
  };

  const inlineTemplates = useMemo(
    () => connectors.filter((c) => Boolean(c.is_inline_template)),
    [connectors],
  );

  const addEnclosure = useMutation({
    mutationFn: async () => {
      if (!vehicleId || !revisionId || !selectedEnclosureTemplateId) return;
      await createEnclosure(vehicleId, revisionId, {
        enclosure_template_id: selectedEnclosureTemplateId,
      });
    },
    onSuccess: invalidate,
  });

  const addPcb = useMutation({
    mutationFn: async () => {
      if (!vehicleId || !revisionId || !selectedPcbTemplateId) return;
      const hierarchy = await fetchHierarchy(vehicleId, revisionId);
      const enc = hierarchy.root.children[0];
      await createPcb(vehicleId, revisionId, {
        pcb_template_id: selectedPcbTemplateId,
        enclosure_instance_id: enc?.id,
      });
    },
    onSuccess: invalidate,
  });

  const addInlineConnector = useMutation({
    mutationFn: async () => {
      if (!vehicleId || !revisionId || !selectedInlineTemplateId) return;
      await createConnector(vehicleId, revisionId, {
        connector_template_id: selectedInlineTemplateId,
        is_panel_mount: false,
        inline_gender: selectedInlineGender,
        nickname: inlineNickname.trim() || undefined,
      });
    },
    onSuccess: () => {
      setInlineNickname("");
      invalidate();
    },
  });

  const publish = useMutation({
    mutationFn: async () => {
      if (!vehicleId || !revisionId) return;
      const result = await publishRevision(vehicleId, revisionId);
      selectVehicle(vehicleId, result.new_draft_revision.id);
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      queryClient.invalidateQueries({ queryKey: ["revisions", vehicleId] });
    },
    onSuccess: invalidate,
  });

  if (!vehicleId || !revisionId) {
    return <p className="text-sm text-tesla-muted">Select a vehicle to design.</p>;
  }

  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs uppercase tracking-wider text-tesla-muted">Add from library</p>
      <div className="space-y-2 rounded border border-tesla-border p-2">
        <label className="block text-xs text-tesla-muted">Enclosure template</label>
        <select
          value={selectedEnclosureTemplateId}
          onChange={(e) => setSelectedEnclosureTemplateId(e.target.value)}
          className="w-full rounded border border-tesla-border bg-tesla-bg px-2 py-1 text-xs text-tesla-text"
        >
          <option value="">Select enclosure template</option>
          {encTemplates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <ActionButton
          label="+ Enclosure"
          disabled={!selectedEnclosureTemplateId}
          onClick={() => addEnclosure.mutate()}
        />
      </div>
      <div className="space-y-2 rounded border border-tesla-border p-2">
        <label className="block text-xs text-tesla-muted">PCB template</label>
        <select
          value={selectedPcbTemplateId}
          onChange={(e) => setSelectedPcbTemplateId(e.target.value)}
          className="w-full rounded border border-tesla-border bg-tesla-bg px-2 py-1 text-xs text-tesla-text"
        >
          <option value="">Select PCB template</option>
          {pcbTemplates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <ActionButton
          label="+ PCB"
          disabled={!selectedPcbTemplateId}
          onClick={() => addPcb.mutate()}
        />
      </div>
      <div className="space-y-2 rounded border border-tesla-border p-2">
        <label className="block text-xs text-tesla-muted">Inline connector template</label>
        <select
          value={selectedInlineTemplateId}
          onChange={(e) => setSelectedInlineTemplateId(e.target.value)}
          className="w-full rounded border border-tesla-border bg-tesla-bg px-2 py-1 text-xs text-tesla-text"
        >
          <option value="">Select inline template</option>
          {inlineTemplates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <label className="block text-xs text-tesla-muted">Inline gender</label>
        <select
          value={selectedInlineGender}
          onChange={(e) =>
            setSelectedInlineGender(
              e.target.value as "male" | "female" | "hermaphroditic",
            )
          }
          className="w-full rounded border border-tesla-border bg-tesla-bg px-2 py-1 text-xs text-tesla-text"
        >
          <option value="male">Male</option>
          <option value="female">Female</option>
          <option value="hermaphroditic">Hermaphroditic</option>
        </select>
        <input
          value={inlineNickname}
          onChange={(e) => setInlineNickname(e.target.value)}
          placeholder="Inline nickname (optional)"
          className="w-full rounded border border-tesla-border bg-tesla-bg px-2 py-1 text-xs text-tesla-text"
        />
        <ActionButton
          label="+ Inline connector"
          disabled={!selectedInlineTemplateId}
          onClick={() => addInlineConnector.mutate()}
        />
      </div>
      <ActionButton
        label="Publish revision"
        variant="accent"
        onClick={() => publish.mutate()}
      />
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
          ? "rounded-md bg-tesla-accent px-2 py-1 text-xs text-white disabled:opacity-40"
          : "rounded-md border border-tesla-border px-2 py-1 text-xs text-tesla-text transition hover:border-tesla-accent disabled:opacity-40"
      }
    >
      {label}
    </button>
  );
}
