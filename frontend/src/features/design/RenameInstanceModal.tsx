import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchHierarchy } from "@/api/hierarchy";
import {
  updateConnectorInstance,
  updateEnclosureInstance,
  updatePcbInstance,
} from "@/api/instances";
import { StaleRevisionBanner } from "@/components/shell/StaleRevisionBanner";
import { Modal } from "@/components/ui/Modal";
import { ConnectorInstanceLabel } from "@/components/library/ConnectorInstanceLabel";
import { InstanceRenameFields } from "@/features/design/InstanceRenameFields";
import { handleMutationError } from "@/lib/mutationErrors";
import { useAppStore } from "@/stores/appStore";
import { useRevisionSyncStore } from "@/stores/revisionSyncStore";

export type RenameInstanceKind = "enclosure" | "node" | "pcb" | "inlineConnector";

interface RenameInstanceModalProps {
  open: boolean;
  instanceId: string | null;
  kind: RenameInstanceKind | null;
  onClose: () => void;
}

export function RenameInstanceModal({ open, instanceId, kind, onClose }: RenameInstanceModalProps) {
  const queryClient = useQueryClient();
  const vehicleId = useAppStore((s) => s.selectedVehicleId);
  const revisionId = useAppStore((s) => s.selectedRevisionId);
  const editSequence = useRevisionSyncStore((s) => s.editSequence);
  const staleRevision = useRevisionSyncStore((s) => s.staleRevision);
  const setDirtyForm = useRevisionSyncStore((s) => s.setDirtyForm);

  const isEnclosure = kind === "enclosure";
  const isNode = kind === "node" || kind === "pcb";

  const { data: hierarchy } = useQuery({
    queryKey: ["hierarchy", vehicleId, revisionId],
    queryFn: () => fetchHierarchy(vehicleId!, revisionId!),
    enabled: Boolean(open && vehicleId && revisionId && instanceId),
  });

  const node =
    instanceId && hierarchy ? findHierarchyNode(hierarchy.root, instanceId) : null;

  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !node) {
      setDraft("");
      setMessage(null);
      return;
    }
    setDraft(node.template_label ? node.label : "");
    setMessage(null);
  }, [open, node?.id, node?.label, node?.template_label]);

  const libraryName = node?.template_label ?? node?.label ?? "";
  const hasCustomName = Boolean(node?.template_label);
  const unchanged = hasCustomName ? draft.trim() === node?.label : draft.trim() === "";
  const isDirty = Boolean(node && !unchanged);

  useEffect(() => {
    if (!open) return;
    setDirtyForm(isDirty);
    return () => setDirtyForm(false);
  }, [open, isDirty, setDirtyForm]);

  const save = useMutation({
    mutationFn: async (nickname: string) => {
      if (!vehicleId || !revisionId || !instanceId) throw new Error("Missing context");
      const body = { nickname, expected_edit_sequence: editSequence };
      if (isEnclosure) {
        await updateEnclosureInstance(vehicleId, revisionId, instanceId, body);
        return;
      }
      if (isNode) {
        await updatePcbInstance(vehicleId, revisionId, instanceId, body);
        return;
      }
      await updateConnectorInstance(vehicleId, revisionId, instanceId, body);
    },
    onSuccess: () => {
      setMessage("Name saved.");
      queryClient.invalidateQueries({ queryKey: ["hierarchy"] });
      queryClient.invalidateQueries({ queryKey: ["design-projection"] });
      queryClient.invalidateQueries({ queryKey: ["connection-table"] });
      queryClient.invalidateQueries({ queryKey: ["topology-summary"] });
    },
    onError: (error) => setMessage(handleMutationError(error, "Failed to save name.")),
  });

  if (!open || !instanceId || !kind) return null;

  const title = isEnclosure
    ? "Rename enclosure"
    : isNode
      ? "Rename node"
      : "Rename inline connector";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <button
            type="button"
            className="whitespace-nowrap rounded border border-tesla-border px-3 py-1 text-sm"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!node || unchanged || save.isPending || staleRevision}
            onClick={() => save.mutate(draft.trim())}
            className="whitespace-nowrap rounded bg-tesla-accent px-3 py-1 text-sm text-white disabled:opacity-50"
          >
            {save.isPending ? "Saving…" : "Save name"}
          </button>
        </>
      }
    >
      <StaleRevisionBanner className="mb-3" />
      {node && (
        <div className="mb-3 text-sm">
          <ConnectorInstanceLabel
            label={node.label}
            templateLabel={node.template_label}
            stacked
          />
        </div>
      )}
      {node && (
        <InstanceRenameFields
          draft={draft}
          libraryName={libraryName}
          placeholder={libraryName}
          disabled={save.isPending || staleRevision}
          onDraftChange={(value) => {
            setDraft(value);
            setMessage(null);
          }}
          onUseLibraryName={() => save.mutate("")}
        />
      )}
      {message && <p className="mt-2 text-xs text-tesla-muted">{message}</p>}
    </Modal>
  );
}

interface HierarchyLike {
  id: string;
  label: string;
  template_label?: string | null;
  children?: HierarchyLike[];
}

function findHierarchyNode(node: HierarchyLike, id: string): HierarchyLike | null {
  if (node.id === id) return node;
  for (const child of node.children ?? []) {
    const found = findHierarchyNode(child, id);
    if (found) return found;
  }
  return null;
}
