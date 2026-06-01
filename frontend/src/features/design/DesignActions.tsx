import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createConnectorTemplate, fetchConnectorTemplates } from "@/api/connectorTemplates";
import { createConnector, createEnclosure, createPcb } from "@/api/instances";
import {
  createEnclosureTemplate,
  createPcbTemplate,
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

  const seedConnector = useMutation({
    mutationFn: () =>
      createConnectorTemplate({
        name: `Conn-${connectors.length + 1}`,
        pin_count: 4,
        pins: [
          { pin_number: 1, name: "1" },
          { pin_number: 2, name: "2" },
          { pin_number: 3, name: "3" },
          { pin_number: 4, name: "4" },
        ],
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["connector-templates"] }),
  });

  const seedPcbTemplate = useMutation({
    mutationFn: async () => {
      if (!vehicleId || !connectors[0]) return;
      await createPcbTemplate(vehicleId, {
        name: `PCB-T${pcbTemplates.length + 1}`,
        slots: [{ slot_key: "J1", connector_template_id: connectors[0].id }],
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pcb-templates", vehicleId] }),
  });

  const seedEncTemplate = useMutation({
    mutationFn: async () => {
      if (!vehicleId || !connectors[0]) return;
      await createEnclosureTemplate(vehicleId, {
        name: `ENC-T${encTemplates.length + 1}`,
        slots: [{ slot_key: "PM1", connector_template_id: connectors[0].id }],
      });
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["enclosure-templates", vehicleId] }),
  });

  const addEnclosure = useMutation({
    mutationFn: async () => {
      if (!vehicleId || !revisionId || !encTemplates[0]) return;
      await createEnclosure(vehicleId, revisionId, {
        enclosure_template_id: encTemplates[0].id,
      });
    },
    onSuccess: invalidate,
  });

  const addPcb = useMutation({
    mutationFn: async () => {
      if (!vehicleId || !revisionId || !pcbTemplates[0]) return;
      const hierarchy = await fetchHierarchy(vehicleId, revisionId);
      const enc = hierarchy.root.children[0];
      await createPcb(vehicleId, revisionId, {
        pcb_template_id: pcbTemplates[0].id,
        enclosure_instance_id: enc?.id,
      });
    },
    onSuccess: invalidate,
  });

  const addInlineConnector = useMutation({
    mutationFn: async () => {
      if (!vehicleId || !revisionId || !connectors[0]) return;
      await createConnector(vehicleId, revisionId, {
        connector_template_id: connectors[0].id,
        is_panel_mount: false,
      });
    },
    onSuccess: invalidate,
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
      <p className="text-xs uppercase tracking-wider text-tesla-muted">Quick setup</p>
      <div className="flex flex-wrap gap-2">
        <ActionButton label="+ Connector TPL" onClick={() => seedConnector.mutate()} />
        <ActionButton
          label="+ PCB TPL"
          disabled={!connectors.length}
          onClick={() => seedPcbTemplate.mutate()}
        />
        <ActionButton
          label="+ Enc TPL"
          disabled={!connectors.length}
          onClick={() => seedEncTemplate.mutate()}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <ActionButton
          label="+ Enclosure"
          disabled={!encTemplates.length}
          onClick={() => addEnclosure.mutate()}
        />
        <ActionButton
          label="+ PCB"
          disabled={!pcbTemplates.length}
          onClick={() => addPcb.mutate()}
        />
        <ActionButton
          label="+ Inline connector"
          disabled={!connectors.length}
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
