import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchHierarchy } from "@/api/hierarchy";
import { updateConnectorInstance } from "@/api/instances";
import { useAppStore } from "@/stores/appStore";
import { ConnectorInstanceLabel } from "@/components/library/ConnectorInstanceLabel";

export function ConnectorNamePanel() {
  const queryClient = useQueryClient();
  const vehicleId = useAppStore((s) => s.selectedVehicleId);
  const revisionId = useAppStore((s) => s.selectedRevisionId);
  const selectedNodeKind = useAppStore((s) => s.selectedNodeKind);
  const focusId = useAppStore((s) => s.focusId);

  const isConnector =
    selectedNodeKind === "connector" ||
    selectedNodeKind === "panelMount" ||
    selectedNodeKind === "group";

  const connectorId = isConnector ? focusId : null;

  const { data: hierarchy } = useQuery({
    queryKey: ["hierarchy", vehicleId, revisionId],
    queryFn: () => fetchHierarchy(vehicleId!, revisionId!),
    enabled: Boolean(vehicleId && revisionId && connectorId),
  });

  const node =
    connectorId && hierarchy ? findConnectorNode(hierarchy.root, connectorId) : null;

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

  const save = useMutation({
    mutationFn: (nickname: string) =>
      updateConnectorInstance(vehicleId!, revisionId!, connectorId!, { nickname }),
    onSuccess: () => {
      setMessage("Connector name saved.");
      queryClient.invalidateQueries({ queryKey: ["hierarchy"] });
      queryClient.invalidateQueries({ queryKey: ["design-projection"] });
      queryClient.invalidateQueries({ queryKey: ["connection-table"] });
      queryClient.invalidateQueries({ queryKey: ["pins"] });
      queryClient.invalidateQueries({ queryKey: ["topology-summary"] });
    },
    onError: () => setMessage("Failed to save connector name."),
  });

  if (!vehicleId || !revisionId || !connectorId || !node) return null;

  const hasCustomName = Boolean(node.template_label);
  const unchanged = hasCustomName ? draft.trim() === node.label : draft.trim() === "";

  return (
    <div className="mt-4 border-t border-tesla-border pt-4">
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-tesla-muted">
        Connector name
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
          disabled={unchanged || save.isPending}
          onClick={() => save.mutate(draft.trim())}
          className="rounded border border-tesla-border px-2 py-1 text-xs text-tesla-muted transition hover:border-tesla-accent hover:text-tesla-text disabled:opacity-40"
        >
          {save.isPending ? "Saving…" : "Save name"}
        </button>
        {hasCustomName && (
          <button
            type="button"
            disabled={save.isPending}
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
  kind: string;
  label: string;
  template_label?: string | null;
  children?: HierarchyLike[];
}

function findConnectorNode(node: HierarchyLike, id: string): HierarchyLike | null {
  if (node.id === id) return node;
  for (const child of node.children ?? []) {
    const found = findConnectorNode(child, id);
    if (found) return found;
  }
  return null;
}
