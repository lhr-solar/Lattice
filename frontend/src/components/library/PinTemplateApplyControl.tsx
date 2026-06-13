import { useEffect, useState } from "react";
import type { PinTemplate } from "@/api/pinTemplates";
import { PinTemplatePicker } from "@/components/library/PinTemplatePicker";
import { PinTemplateConflictModal } from "@/components/library/PinTemplateConflictModal";
import {
  applyPinTemplateNames,
  findPinTemplateConflicts,
  pinMappingFromStates,
  pinStatesFromMapping,
  type PinConflictResolution,
  type PinNameState,
} from "@/lib/pinTemplateApply";

export function PinTemplateApplyControl({
  vehicleId,
  connectorTemplateId,
  connectorPinCount,
  connectorPins,
  pinMapping,
  onApply,
}: {
  vehicleId: string | null;
  connectorTemplateId: string;
  connectorPinCount: number;
  connectorPins?: Array<{ pin_number: number; name: string }>;
  pinMapping: Array<{ pin_number: number; name: string }>;
  onApply: (mapping: Array<{ pin_number: number; name: string }>) => void;
}) {
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [pendingTemplate, setPendingTemplate] = useState<PinTemplate | null>(null);
  const [conflicts, setConflicts] = useState<ReturnType<typeof findPinTemplateConflicts>>([]);

  useEffect(() => {
    setSelectedTemplateId("");
    setPendingTemplate(null);
    setConflicts([]);
  }, [connectorTemplateId]);

  const currentStates = pinStatesFromMapping(connectorPinCount, pinMapping, connectorPins);

  const finishApply = (
    template: PinTemplate,
    resolutions: Record<number, PinConflictResolution> = {},
  ) => {
    const nextStates = applyPinTemplateNames(currentStates, template, resolutions);
    onApply(pinMappingFromStates(nextStates));
    setSelectedTemplateId("");
    setPendingTemplate(null);
    setConflicts([]);
  };

  const handleTemplateSelect = (templateId: string, template: PinTemplate | null) => {
    setSelectedTemplateId(templateId);
    if (!template) return;
    const foundConflicts = findPinTemplateConflicts(currentStates, template);
    if (foundConflicts.length > 0) {
      setPendingTemplate(template);
      setConflicts(foundConflicts);
      return;
    }
    finishApply(template);
  };

  return (
    <>
      <PinTemplatePicker
        vehicleId={vehicleId}
        connectorTemplateId={connectorTemplateId}
        value={selectedTemplateId}
        onChange={handleTemplateSelect}
      />
      <PinTemplateConflictModal
        open={Boolean(pendingTemplate && conflicts.length > 0)}
        conflicts={conflicts}
        onClose={() => {
          setPendingTemplate(null);
          setConflicts([]);
          setSelectedTemplateId("");
        }}
        onConfirm={(resolutions) => {
          if (pendingTemplate) finishApply(pendingTemplate, resolutions);
        }}
      />
    </>
  );
}

export function pinNamesPreview(
  pinCount: number,
  mapping: Array<{ pin_number: number; name: string }>,
  connectorPins?: Array<{ pin_number: number; name: string }>,
): PinNameState[] {
  return pinStatesFromMapping(pinCount, mapping, connectorPins);
}
