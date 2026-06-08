import { Modal } from "@/components/ui/Modal";
import { useAppStore } from "@/stores/appStore";

export function HelpModal() {
  const showHelpModal = useAppStore((s) => s.showHelpModal);
  const setShowHelpModal = useAppStore((s) => s.setShowHelpModal);

  return (
    <Modal
      open={showHelpModal}
      title="Harness workflow help"
      onClose={() => setShowHelpModal(false)}
      showCloseButton
      panelClassName="max-w-3xl"
    >
      <div className="space-y-4 text-sm text-tesla-muted">
        <section>
          <h3 className="mb-1 font-medium text-tesla-text">Suggested workflow</h3>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Add enclosure, node, and inline connectors from library panels.</li>
            <li>Select a connector and use Edit pinout to define pin names and net assignments.</li>
            <li>Build a Pin Name Library for reusable labels — picking a name copies it, it is not linked.</li>
            <li>Enable Wire mode, then click pin A and pin B to create a wire/net.</li>
            <li>Use Nets to inspect naming and make any net-level cleanup edits.</li>
            <li>Use Pin shorts for internal continuity inside the same connector.</li>
          </ol>
        </section>

        <section>
          <h3 className="mb-1 font-medium text-tesla-text">What the Wire button does</h3>
          <p>
            Wire mode changes pin click behavior from navigation to pairing. First click selects pin
            A. Second click creates a wire and assigns both pins to a net (existing, new, or auto).
          </p>
        </section>

        <section>
          <h3 className="mb-1 font-medium text-tesla-text">Tips</h3>
          <ul className="list-disc space-y-1 pl-5">
            <li>Use connector projection to wire quickly within one connector context.</li>
            <li>Pin names drive auto net naming, so define pinouts early.</li>
            <li>Dashed edges are pin shorts, not harness wires.</li>
          </ul>
        </section>
      </div>
    </Modal>
  );
}
