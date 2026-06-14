import { useEffect, useState } from "react";
import type { PinTemplateConflict, PinConflictResolution } from "@/lib/pinTemplateApply";
import { Modal } from "@/components/ui/Modal";
import { SegmentedControl } from "@/components/ui/SegmentedControl";

const KEEP_OPTIONS = [
  { value: "current" as const, label: "Current" },
  { value: "template" as const, label: "Template" },
];

export function PinTemplateConflictModal({
  open,
  conflicts,
  onClose,
  onConfirm,
}: {
  open: boolean;
  conflicts: PinTemplateConflict[];
  onClose: () => void;
  onConfirm: (resolutions: Record<number, PinConflictResolution>) => void;
}) {
  const [resolutions, setResolutions] = useState<Record<number, PinConflictResolution>>({});

  useEffect(() => {
    if (!open) return;
    const initial: Record<number, PinConflictResolution> = {};
    for (const conflict of conflicts) {
      initial[conflict.pin_number] = "template";
    }
    setResolutions(initial);
  }, [open, conflicts]);

  const setAll = (choice: PinConflictResolution) => {
    const next: Record<number, PinConflictResolution> = {};
    for (const conflict of conflicts) {
      next[conflict.pin_number] = choice;
    }
    setResolutions(next);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Pin name conflicts"
      layer="stacked"
      panelClassName="max-w-2xl"
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
            className="rounded bg-tesla-accent px-3 py-1 text-sm text-white"
            onClick={() => onConfirm(resolutions)}
          >
            Apply template
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-tesla-muted">
          Some pins already have names that differ from the template. Choose which name to keep for
          each conflicting pin.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded border border-tesla-border px-2 py-1 text-xs text-tesla-muted transition hover:border-tesla-accent hover:bg-tesla-accent/10 hover:text-tesla-accent"
            onClick={() => setAll("current")}
          >
            Use all current names
          </button>
          <button
            type="button"
            className="rounded border border-tesla-border px-2 py-1 text-xs text-tesla-muted transition hover:border-tesla-accent hover:bg-tesla-accent/10 hover:text-tesla-accent"
            onClick={() => setAll("template")}
          >
            Use all template names
          </button>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-tesla-border text-left text-xs uppercase tracking-wider text-tesla-muted">
              <th className="pb-2 pr-3 font-medium">Pin</th>
              <th className="pb-2 pr-3 font-medium">Current</th>
              <th className="pb-2 pr-3 font-medium">Template</th>
              <th className="pb-2 font-medium">Keep</th>
            </tr>
          </thead>
          <tbody>
            {conflicts.map((conflict) => (
              <tr key={conflict.pin_number} className="border-b border-tesla-border/50">
                <td className="py-2 pr-3 text-tesla-muted">{conflict.pin_number}</td>
                <td className="py-2 pr-3">{conflict.current_name}</td>
                <td className="py-2 pr-3">{conflict.template_name}</td>
                <td className="py-2">
                  <SegmentedControl
                    value={resolutions[conflict.pin_number] ?? "template"}
                    onChange={(choice) =>
                      setResolutions((prev) => ({
                        ...prev,
                        [conflict.pin_number]: choice,
                      }))
                    }
                    options={KEEP_OPTIONS}
                    ariaLabel={`Keep name for pin ${conflict.pin_number}`}
                    className="transition-colors hover:border-tesla-accent/60"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
