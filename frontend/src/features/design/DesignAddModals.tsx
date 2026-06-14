import { Modal } from "@/components/ui/Modal";
import {
  ConnectorTemplatePicker,
  EnclosureTemplatePicker,
  PcbTemplatePicker,
} from "@/components/library/TemplatePickers";
import { useDesignAddActions } from "@/features/design/DesignAddContext";

export function DesignAddModals() {
  const {
    activeAdd,
    templateId,
    setTemplateId,
    nickname,
    setNickname,
    addTitle,
    canAdd,
    pending,
    encTemplates,
    pcbTemplates,
    inlineTemplates,
    closeAddModal,
    handleAdd,
    setShowLibraryManager,
    setLibraryTab,
  } = useDesignAddActions();

  return (
    <Modal
      open={activeAdd !== null}
      onClose={closeAddModal}
      title={addTitle}
      footer={
        <>
          <button
            type="button"
            className="rounded border border-tesla-border px-3 py-1 text-sm"
            onClick={closeAddModal}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canAdd}
            className="rounded bg-tesla-accent px-3 py-1 text-sm text-white disabled:opacity-50"
            onClick={handleAdd}
          >
            {pending ? "Adding…" : "Add"}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {activeAdd === "enclosure" && (
          <EnclosureTemplatePicker
            enclosures={encTemplates}
            value={templateId}
            onChange={setTemplateId}
            onAddAction={() => {
              setLibraryTab("enclosure");
              setShowLibraryManager(true);
            }}
          />
        )}
        {activeAdd === "node" && (
          <PcbTemplatePicker
            pcbs={pcbTemplates}
            value={templateId}
            onChange={setTemplateId}
            onAddAction={() => {
              setLibraryTab("node");
              setShowLibraryManager(true);
            }}
          />
        )}
        {activeAdd === "inline" && (
          <ConnectorTemplatePicker
            connectors={inlineTemplates}
            value={templateId}
            onChange={setTemplateId}
            label="Inline connector"
            onAddAction={() => {
              setLibraryTab("connector");
              setShowLibraryManager(true);
            }}
          />
        )}
        {activeAdd !== null && (
          <label className="flex flex-col gap-1 text-xs text-tesla-muted">
            Custom name
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="Optional — uses template name if blank"
              className="rounded border border-tesla-border bg-tesla-bg px-2 py-1 text-sm text-tesla-text outline-none focus:border-tesla-accent"
            />
          </label>
        )}
      </div>
    </Modal>
  );
}
