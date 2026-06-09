import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchHierarchy } from "@/api/hierarchy";
import { updateEnclosureInstance, updatePcbInstance } from "@/api/instances";
import { StaleRevisionBanner } from "@/components/shell/StaleRevisionBanner";
import { handleMutationError } from "@/lib/mutationErrors";
import { useAppStore } from "@/stores/appStore";
import { useRevisionSyncStore } from "@/stores/revisionSyncStore";
import { ConnectorInstanceLabel } from "@/components/library/ConnectorInstanceLabel";

export function InstanceNicknamePanel() {
  const queryClient = useQueryClient();
  const vehicleId = useAppStore((s) => s.selectedVehicleId);
  const revisionId = useAppStore((s) => s.selectedRevisionId);
  const selectedNodeKind = useAppStore((s) => s.selectedNodeKind);
  const focusId = useAppStore((s) => s.focusId);
  const editSequence = useRevisionSyncStore((s) => s.editSequence);
  const staleRevision = useRevisionSyncStore((s) => s.staleRevision);
  const setDirtyForm = useRevisionSyncStore((s) => s.setDirtyForm);

  const isEnclosure = selectedNodeKind === "enclosure";
  const isNode = selectedNodeKind === "node";
  const instanceId = isEnclosure || isNode ? focusId : null;

  const { data: hierarchy } = useQuery({
    queryKey: ["hierarchy", vehicleId, revisionId],
    queryFn: () => fetchHierarchy(vehicleId!, revisionId!),
    enabled: Boolean(vehicleId && revisionId && instanceId),
  });

  const node =
    instanceId && hierarchy ? findHierarchyNode(hierarchy.root, instanceId) : null;

  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!node) {
      setDraft("");
      setMessage(null);
      return;
    }
    setDraft(node.template_label ? node.label : "");
    setMessage(null);
  }, [node?.id, node?.label, node?.template_label]);

  const hasCustomName = Boolean(node?.template_label);
  const unchanged = hasCustomName ? draft.trim() === node?.label : draft.trim() === "";
  const isDirty = Boolean(node && !unchanged);

  useEffect(() => {
    setDirtyForm(isDirty);
    return () => setDirtyForm(false);
  }, [isDirty, setDirtyForm]);

  const save = useMutation({
    mutationFn: async (nickname: string) => {
      if (!vehicleId || !revisionId || !instanceId) throw new Error("Missing context");
      const body = { nickname, expected_edit_sequence: editSequence };
      if (isEnclosure) {
        await updateEnclosureInstance(vehicleId, revisionId, instanceId, body);
        return;
      }
      await updatePcbInstance(vehicleId, revisionId, instanceId, body);
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

  if (!vehicleId || !revisionId || !instanceId || !node) return null;

  const title = isEnclosure ? "Enclosure name" : "Node name";

  return (
    <div className="mt-4 border-t border-tesla-border pt-4">
      <StaleRevisionBanner className="mb-2" />
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-tesla-muted">
        {title}
      </h3>
      <div className="mb-2 text-sm">
        <ConnectorInstanceLabel
          label={node.label}
          templateLabel={node.template_label}
          stacked
        />
      </div>
      <label className="mb-2 block text-xs text-tesla-muted">
        Custom name
        <input
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setMessage(null);
          }}
          placeholder={node.template_label ?? node.label}
          className="mt-1 w-full rounded border border-tesla-border bg-tesla-bg px-2 py-1 text-sm outline-none focus:border-tesla-accent"
        />
      </label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={unchanged || save.isPending || staleRevision}
          onClick={() => save.mutate(draft.trim())}
          className="rounded border border-tesla-border px-2 py-1 text-xs text-tesla-muted transition hover:border-tesla-accent hover:text-tesla-text disabled:opacity-40"
        >
          {save.isPending ? "Saving…" : "Save name"}
        </button>
        {hasCustomName && (
          <button
            type="button"
            disabled={save.isPending || staleRevision}
            onClick={() => save.mutate("")}
            className="rounded border border-tesla-border px-2 py-1 text-xs text-tesla-muted transition hover:border-tesla-accent hover:text-tesla-text disabled:opacity-40"
          >
            Use template name
          </button>
        )}
      </div>
      {message && <p className="mt-2 text-xs text-tesla-muted">{message}</p>}
    </div>
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
