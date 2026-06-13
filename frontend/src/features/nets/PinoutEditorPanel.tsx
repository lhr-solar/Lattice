import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { assignPinNet, fetchNets, fetchPins } from "@/api/nets";
import { fetchPinNameLibrary } from "@/api/pinNames";
import { fetchHierarchy, type HierarchyNode } from "@/api/hierarchy";
import { updateConnectorInstance, updateConnectorPin, updateConnectorPinout } from "@/api/instances";
import { PinTemplatePicker } from "@/components/library/PinTemplatePicker";
import { ConnectorInstanceLabel } from "@/components/library/ConnectorInstanceLabel";
import { InstanceRenameFields } from "@/features/design/InstanceRenameFields";
import {
  applyPinTemplateNames,
  findPinTemplateConflicts,
  type PinConflictResolution,
} from "@/lib/pinTemplateApply";
import type { PinTemplate } from "@/api/pinTemplates";
import { PinTemplateConflictModal } from "@/components/library/PinTemplateConflictModal";
import { StaleRevisionBanner } from "@/components/shell/StaleRevisionBanner";
import { ModalOverlay } from "@/components/ui/Modal";
import { handleMutationError } from "@/lib/mutationErrors";
import { useAppStore } from "@/stores/appStore";
import { useRevisionSyncStore } from "@/stores/revisionSyncStore";
import { InstancePicker } from "@/components/library/TemplatePickers";
import { PinNamePicker } from "@/components/library/PinNamePicker";

function findHierarchyNode(node: HierarchyNode, id: string): HierarchyNode | null {
  if (node.id === id) return node;
  for (const child of node.children) {
    const found = findHierarchyNode(child, id);
    if (found) return found;
  }
  return null;
}

export function PinoutEditorModal({
  open,
  connectorId,
  onClose,
}: {
  open: boolean;
  connectorId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const vehicleId = useAppStore((s) => s.selectedVehicleId);
  const revisionId = useAppStore((s) => s.selectedRevisionId);
  const setShowNetManager = useAppStore((s) => s.setShowNetManager);
  const openPinTemplatesManage = useAppStore((s) => s.openPinTemplatesManage);
  const staleRevision = useRevisionSyncStore((s) => s.staleRevision);
  const setDirtyForm = useRevisionSyncStore((s) => s.setDirtyForm);
  const clearStale = useRevisionSyncStore((s) => s.clearStale);
  const beginOwnSave = useRevisionSyncStore((s) => s.beginOwnSave);
  const endOwnSave = useRevisionSyncStore((s) => s.endOwnSave);
  const editSequence = useRevisionSyncStore((s) => s.editSequence);

  const [draftNetAssignments, setDraftNetAssignments] = useState<Record<string, string>>({});
  const [draftNames, setDraftNames] = useState<Record<string, string>>({});
  const [draftNickname, setDraftNickname] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [selectedPinTemplateId, setSelectedPinTemplateId] = useState("");
  const [pendingTemplate, setPendingTemplate] = useState<PinTemplate | null>(null);
  const [conflicts, setConflicts] = useState<ReturnType<typeof findPinTemplateConflicts>>([]);

  const { data: nets = [] } = useQuery({
    queryKey: ["nets", vehicleId, revisionId],
    queryFn: () => fetchNets(vehicleId!, revisionId!),
    enabled: Boolean(open && vehicleId && revisionId),
  });

  const { data: pinNameLibrary = [] } = useQuery({
    queryKey: ["pin-name-library", vehicleId],
    queryFn: () => fetchPinNameLibrary(vehicleId!),
    enabled: Boolean(open && vehicleId),
  });

  const { data: hierarchy } = useQuery({
    queryKey: ["hierarchy", vehicleId, revisionId],
    queryFn: () => fetchHierarchy(vehicleId!, revisionId!),
    enabled: Boolean(open && vehicleId && revisionId),
  });

  const hierarchyNode =
    hierarchy?.root ? findHierarchyNode(hierarchy.root, connectorId) : null;

  const { data: pins = [], isLoading } = useQuery({
    queryKey: ["pins", vehicleId, revisionId, connectorId],
    queryFn: () =>
      fetchPins(vehicleId!, revisionId!, {
        connector_instance_id: connectorId,
      }),
    enabled: Boolean(open && vehicleId && revisionId && connectorId),
  });

  const sortedPins = useMemo(
    () => [...pins].sort((a, b) => a.pin_number - b.pin_number),
    [pins],
  );

  const connectorTemplateId = sortedPins[0]?.connector_template_id ?? "";

  useEffect(() => {
    if (!open) return;
    setDraftNetAssignments({});
    setDraftNames({});
    setDraftNickname("");
    setMessage(null);
    setSelectedPinTemplateId("");
    setPendingTemplate(null);
    setConflicts([]);
  }, [open, connectorId]);

  useEffect(() => {
    if (!open || !hierarchyNode) return;
    setDraftNickname(hierarchyNode.template_label ? hierarchyNode.label : "");
  }, [open, hierarchyNode?.id, hierarchyNode?.label, hierarchyNode?.template_label]);

  const connectorLabel = hierarchyNode?.label ?? sortedPins[0]?.connector_label ?? "Connector";
  const libraryName = hierarchyNode?.template_label ?? hierarchyNode?.label ?? connectorLabel;
  const hasCustomConnectorName = Boolean(hierarchyNode?.template_label);
  const savedNickname = hasCustomConnectorName ? hierarchyNode!.label : "";
  const nicknameChanged = draftNickname.trim() !== savedNickname.trim();
  const sharedPinout = sortedPins[0]?.shared_pinout ?? false;

  const hasPinoutChanges = useMemo(
    () =>
      sortedPins.some((pin) => {
        const netValue = draftNetAssignments[pin.pin_id] ?? pin.primary_net_id ?? "__unassigned__";
        const netChanged = netValue !== (pin.primary_net_id ?? "__unassigned__");
        const name = (draftNames[pin.pin_id] ?? pin.pin_name).trim();
        return netChanged || name !== pin.pin_name;
      }),
    [sortedPins, draftNetAssignments, draftNames],
  );

  const hasChanges = hasPinoutChanges || nicknameChanged;

  useEffect(() => {
    if (!open) return;
    setDirtyForm(hasChanges);
    return () => setDirtyForm(false);
  }, [open, hasChanges, setDirtyForm]);

  const saveAll = useMutation({
    mutationFn: async () => {
      const tasks: Promise<unknown>[] = [];

      if (nicknameChanged) {
        tasks.push(
          updateConnectorInstance(vehicleId!, revisionId!, connectorId, {
            nickname: draftNickname.trim(),
            expected_edit_sequence: editSequence,
          }),
        );
      }

      const nameUpdates = sortedPins
        .map((pin) => ({
          pin,
          name: (draftNames[pin.pin_id] ?? pin.pin_name).trim(),
        }))
        .filter(({ pin, name }) => name && name !== pin.pin_name);

      for (const pin of sortedPins) {
        const netValue = draftNetAssignments[pin.pin_id] ?? pin.primary_net_id ?? "__unassigned__";
        if (netValue !== (pin.primary_net_id ?? "__unassigned__")) {
          tasks.push(
            assignPinNet(
              vehicleId!,
              revisionId!,
              pin.pin_id,
              netValue === "__unassigned__" ? null : netValue,
            ),
          );
        }
      }

      if (nameUpdates.length > 0) {
        if (sharedPinout) {
          tasks.push(
            updateConnectorPinout(vehicleId!, revisionId!, connectorId, {
              pins: sortedPins.map((pin) => ({
                pin_number: pin.pin_number,
                name: (draftNames[pin.pin_id] ?? pin.pin_name).trim(),
              })),
            }),
          );
        } else {
          for (const { pin, name } of nameUpdates) {
            tasks.push(
              updateConnectorPin(vehicleId!, revisionId!, connectorId, pin.pin_id, { name }),
            );
          }
        }
      }

      await Promise.all(tasks);
    },
    onMutate: () => {
      beginOwnSave();
      clearStale();
    },
    onSuccess: async () => {
      const messages: string[] = [];
      if (nicknameChanged) {
        messages.push(
          sharedPinout
            ? "Connector name updated on all instances sharing this slot."
            : "Connector name saved.",
        );
      }
      if (hasPinoutChanges) {
        messages.push(
          sharedPinout
            ? "Pinout saved. Pin names updated on all instances of this node or enclosure slot."
            : "Pinout saved.",
        );
      }
      setMessage(messages.join(" "));
      setDraftNetAssignments({});
      setDraftNames({});
      clearStale();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["hierarchy"] }),
        queryClient.invalidateQueries({ queryKey: ["pins"] }),
        queryClient.invalidateQueries({ queryKey: ["design-projection"] }),
        queryClient.invalidateQueries({ queryKey: ["topology-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["nets"] }),
        queryClient.invalidateQueries({ queryKey: ["net-detail"] }),
        queryClient.invalidateQueries({ queryKey: ["connection-table"] }),
      ]);
    },
    onError: (error) => setMessage(handleMutationError(error, "Failed to save pinout.")),
    onSettled: () => {
      endOwnSave();
    },
  });

  const applyTemplateToDraft = (
    template: PinTemplate,
    resolutions: Record<number, PinConflictResolution> = {},
  ) => {
    const currentStates = sortedPins.map((pin) => ({
      pin_number: pin.pin_number,
      name: draftNames[pin.pin_id] ?? pin.pin_name,
    }));
    const nextStates = applyPinTemplateNames(currentStates, template, resolutions);
    const nextDraft: Record<string, string> = { ...draftNames };
    for (const pin of sortedPins) {
      const next = nextStates.find((row) => row.pin_number === pin.pin_number);
      if (next) nextDraft[pin.pin_id] = next.name;
    }
    setDraftNames(nextDraft);
    setSelectedPinTemplateId("");
    setPendingTemplate(null);
    setConflicts([]);
    setMessage("Pin template applied. Save pinout to persist changes.");
  };

  const handlePinTemplateSelect = (templateId: string, template: PinTemplate | null) => {
    setSelectedPinTemplateId(templateId);
    if (!template) return;
    const currentStates = sortedPins.map((pin) => ({
      pin_number: pin.pin_number,
      name: draftNames[pin.pin_id] ?? pin.pin_name,
    }));
    const foundConflicts = findPinTemplateConflicts(currentStates, template);
    if (foundConflicts.length > 0) {
      setPendingTemplate(template);
      setConflicts(foundConflicts);
      return;
    }
    applyTemplateToDraft(template);
  };

  if (!open) return null;

  return (
    <>
    <ModalOverlay
      open={open}
      onClose={onClose}
      ariaLabel="Edit pinout"
      panelClassName="flex h-[min(720px,92vh)] max-w-3xl flex-col overflow-hidden"
    >
      <header className="flex items-center justify-between border-b border-tesla-border px-4 py-3">
          <div>
            <h2 className="text-lg font-semibold">Edit pinout</h2>
            <p className="text-xs text-tesla-muted">{connectorLabel}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-1 text-tesla-muted transition hover:bg-tesla-border hover:text-tesla-text"
          >
            ✕
          </button>
        </header>

        <div className="border-b border-tesla-border px-4 py-3">
          <StaleRevisionBanner className="mb-3" />
          {hierarchyNode && (
            <div className="mb-3 text-sm">
              <ConnectorInstanceLabel
                label={hierarchyNode.label}
                templateLabel={hierarchyNode.template_label}
                stacked
              />
            </div>
          )}
          <InstanceRenameFields
            draft={draftNickname}
            libraryName={libraryName}
            placeholder={libraryName}
            disabled={saveAll.isPending || staleRevision}
            onDraftChange={(value) => {
              setDraftNickname(value);
              setMessage(null);
            }}
            onUseLibraryName={() => {
              setDraftNickname("");
              setMessage(null);
            }}
          />
          {sharedPinout && (
            <p className="mt-2 text-xs text-tesla-muted">
              Name and pinout changes apply to every connector instance sharing this node or
              enclosure slot.
            </p>
          )}
        </div>

        {connectorTemplateId && (
          <div className="space-y-2 border-b border-tesla-border px-4 py-3">
            <PinTemplatePicker
              vehicleId={vehicleId}
              connectorTemplateId={connectorTemplateId}
              value={selectedPinTemplateId}
              onChange={handlePinTemplateSelect}
              disabled={staleRevision || sortedPins.length === 0}
            />
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-auto p-4">
          {isLoading && <p className="text-sm text-tesla-muted">Loading pins…</p>}
          {!isLoading && sortedPins.length === 0 && (
            <p className="text-sm text-tesla-muted">No pins found on this connector.</p>
          )}
          {sortedPins.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-tesla-border text-left text-xs uppercase tracking-wider text-tesla-muted">
                  <th className="w-16 pb-2 pr-3 font-medium">Pin</th>
                  <th className="pb-2 pr-3 font-medium">Name</th>
                  <th className="pb-2 font-medium">Net</th>
                </tr>
              </thead>
              <tbody>
                {sortedPins.map((pin) => {
                  const netValue = draftNetAssignments[pin.pin_id] ?? pin.primary_net_id ?? "__unassigned__";
                  return (
                    <tr key={pin.pin_id} className="border-b border-tesla-border/50">
                      <td className="py-2 pr-3 text-tesla-muted">{pin.pin_number}</td>
                      <td className="py-2 pr-3">
                        <PinNamePicker
                          value={draftNames[pin.pin_id] ?? pin.pin_name}
                          onChange={(name) =>
                            setDraftNames((prev) => ({ ...prev, [pin.pin_id]: name }))
                          }
                          entries={pinNameLibrary}
                          onManageLibrary={() => openPinTemplatesManage("names")}
                        />
                      </td>
                      <td className="py-2">
                        <InstancePicker
                          label=""
                          instances={[
                            { id: "__unassigned__", label: "Unassigned net" },
                            ...nets.map((net) => ({ id: net.id, label: net.name })),
                          ]}
                          value={netValue}
                          onChange={(nextId) => {
                            setDraftNetAssignments((prev) => ({ ...prev, [pin.pin_id]: nextId }));
                            setMessage(null);
                          }}
                          placeholder="Select net…"
                          addActionLabel="Add net"
                          onAddAction={() => setShowNetManager(true)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <footer className="flex items-center justify-between border-t border-tesla-border px-4 py-3">
          {message ? <p className="text-xs text-tesla-muted">{message}</p> : <span />}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="whitespace-nowrap rounded border border-tesla-border px-3 py-1.5 text-sm text-tesla-muted transition hover:border-tesla-accent hover:text-tesla-text"
            >
              Close
            </button>
            <button
              type="button"
              disabled={!hasChanges || saveAll.isPending || staleRevision}
              onClick={() => saveAll.mutate()}
              className="whitespace-nowrap rounded bg-tesla-accent px-3 py-1.5 text-sm text-white transition hover:bg-tesla-accent/90 disabled:opacity-40"
            >
              {saveAll.isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </footer>
    </ModalOverlay>
    <PinTemplateConflictModal
      open={Boolean(pendingTemplate && conflicts.length > 0)}
      conflicts={conflicts}
      onClose={() => {
        setPendingTemplate(null);
        setConflicts([]);
        setSelectedPinTemplateId("");
      }}
      onConfirm={(resolutions) => {
        if (pendingTemplate) applyTemplateToDraft(pendingTemplate, resolutions);
      }}
    />
  </>
  );
}
