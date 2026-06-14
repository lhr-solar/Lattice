import type { PinTemplate } from "@/api/pinTemplates";

export interface PinNameState {
  pin_number: number;
  name: string;
}

export interface PinTemplateConflict {
  pin_number: number;
  current_name: string;
  template_name: string;
}

export type PinConflictResolution = "current" | "template";

export function isDefaultPinName(pinNumber: number, name: string): boolean {
  return name.trim() === String(pinNumber);
}

export function findPinTemplateConflicts(
  currentPins: PinNameState[],
  template: PinTemplate,
): PinTemplateConflict[] {
  const byNumber = new Map(currentPins.map((pin) => [pin.pin_number, pin.name]));
  const conflicts: PinTemplateConflict[] = [];
  for (const templatePin of template.pins) {
    const templateName = templatePin.name?.trim();
    if (!templateName) continue;
    const currentName = byNumber.get(templatePin.pin_number);
    if (!currentName) continue;
    if (isDefaultPinName(templatePin.pin_number, currentName)) continue;
    if (currentName.trim() === templateName) continue;
    conflicts.push({
      pin_number: templatePin.pin_number,
      current_name: currentName,
      template_name: templateName,
    });
  }
  return conflicts.sort((a, b) => a.pin_number - b.pin_number);
}

export function applyPinTemplateNames(
  currentPins: PinNameState[],
  template: PinTemplate,
  resolutions: Record<number, PinConflictResolution> = {},
): PinNameState[] {
  const templateByNumber = new Map(
    template.pins
      .filter((pin) => pin.name?.trim())
      .map((pin) => [pin.pin_number, pin.name!.trim()]),
  );
  return currentPins.map((pin) => {
    const templateName = templateByNumber.get(pin.pin_number);
    if (!templateName) return pin;
    const resolution = resolutions[pin.pin_number];
    if (resolution === "current") return pin;
    if (
      !resolution &&
      !isDefaultPinName(pin.pin_number, pin.name) &&
      pin.name.trim() !== templateName
    ) {
      return pin;
    }
    return { ...pin, name: templateName };
  });
}

export function pinMappingFromStates(pins: PinNameState[]): Array<{ pin_number: number; name: string }> {
  return pins
    .filter((pin) => pin.name.trim() && !isDefaultPinName(pin.pin_number, pin.name))
    .map((pin) => ({ pin_number: pin.pin_number, name: pin.name.trim() }));
}

export function pinStatesFromMapping(
  pinCount: number,
  mapping: Array<{ pin_number: number; name: string }>,
  connectorPins?: Array<{ pin_number: number; name: string }>,
): PinNameState[] {
  const mappingByNumber = new Map(mapping.map((row) => [row.pin_number, row.name]));
  const connectorByNumber = new Map((connectorPins ?? []).map((row) => [row.pin_number, row.name]));
  return Array.from({ length: pinCount }, (_, idx) => {
    const pinNumber = idx + 1;
    const mapped = mappingByNumber.get(pinNumber);
    const fallback = connectorByNumber.get(pinNumber) ?? String(pinNumber);
    return { pin_number: pinNumber, name: mapped ?? fallback };
  });
}
