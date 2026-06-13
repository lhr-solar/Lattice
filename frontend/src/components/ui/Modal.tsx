import type { ReactNode } from "react";
import { PasswordInput } from "@/components/ui/PasswordInput";

export type ModalLayer = "dialog" | "manager" | "stacked";

const MODAL_LAYER_CLASS: Record<ModalLayer, string> = {
  dialog: "z-[60]",
  manager: "z-[70]",
  stacked: "z-[80]",
};

interface ModalOverlayProps {
  open?: boolean;
  onClose: () => void;
  layer?: ModalLayer;
  panelClassName?: string;
  ariaLabel?: string;
  children: ReactNode;
}

export function ModalOverlay({
  open = true,
  onClose,
  layer = "dialog",
  panelClassName,
  ariaLabel,
  children,
}: ModalOverlayProps) {
  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 ${MODAL_LAYER_CLASS[layer]} flex items-center justify-center bg-black/60 p-4 panel-fade-in`}
    >
      <div
        className="absolute inset-0"
        onClick={onClose}
        role="button"
        aria-label="Close dialog overlay"
        tabIndex={-1}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        className={`relative z-10 w-full rounded-lg border border-tesla-border bg-tesla-surface shadow-2xl ${
          panelClassName ?? ""
        }`}
      >
        {children}
      </div>
    </div>
  );
}

interface ModalProps {
  open: boolean;
  title: string;
  children?: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  panelClassName?: string;
  bodyClassName?: string;
  showCloseButton?: boolean;
  layer?: ModalLayer;
}

export function Modal({
  open,
  title,
  children,
  footer,
  onClose,
  panelClassName,
  bodyClassName,
  showCloseButton = false,
  layer = "dialog",
}: ModalProps) {
  return (
    <ModalOverlay
      open={open}
      onClose={onClose}
      layer={layer}
      ariaLabel={title}
      panelClassName={panelClassName ?? "max-w-md"}
    >
      <header className="relative border-b border-tesla-border px-4 py-3">
        <h2 className="pr-8 text-base font-semibold text-tesla-text">{title}</h2>
        {showCloseButton && (
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-lg leading-none text-tesla-muted transition hover:bg-tesla-border hover:text-tesla-text"
            aria-label="Close"
          >
            ×
          </button>
        )}
      </header>
      {children && (
        <div className={`px-4 py-3 text-sm text-tesla-muted ${bodyClassName ?? ""}`}>{children}</div>
      )}
      {footer && <footer className="flex justify-end gap-2 border-t border-tesla-border px-4 py-3">{footer}</footer>}
    </ModalOverlay>
  );
}

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  disabled?: boolean;
  layer?: ModalLayer;
}

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  onCancel,
  disabled = false,
  layer = "stacked",
}: ConfirmModalProps) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      layer={layer}
      footer={
        <>
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-tesla-border px-3 py-1.5 text-sm text-tesla-muted transition hover:border-tesla-accent hover:text-tesla-text"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={disabled}
            className={`rounded px-3 py-1.5 text-sm text-white transition disabled:opacity-50 ${
              destructive ? "bg-red-600 hover:bg-red-500" : "bg-tesla-accent hover:bg-tesla-accent/90"
            }`}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      {message}
    </Modal>
  );
}

interface PromptModalProps {
  open: boolean;
  title: string;
  message?: string;
  value: string;
  inputType?: "text" | "password";
  submitLabel?: string;
  cancelLabel?: string;
  disabled?: boolean;
  onChange: (next: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  layer?: ModalLayer;
}

export function PromptModal({
  open,
  title,
  message,
  value,
  inputType = "text",
  submitLabel = "Save",
  cancelLabel = "Cancel",
  disabled = false,
  onChange,
  onSubmit,
  onCancel,
  layer = "dialog",
}: PromptModalProps) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      layer={layer}
      footer={
        <>
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-tesla-border px-3 py-1.5 text-sm text-tesla-muted transition hover:border-tesla-accent hover:text-tesla-text"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={disabled}
            className="rounded bg-tesla-accent px-3 py-1.5 text-sm text-white transition hover:bg-tesla-accent/90 disabled:opacity-50"
          >
            {submitLabel}
          </button>
        </>
      }
    >
      <div className="space-y-2">
        {message ? <p>{message}</p> : null}
        {inputType === "password" ? (
          <PasswordInput value={value} onChange={onChange} autoFocus />
        ) : (
          <input
            type={inputType}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full rounded-md border border-tesla-border bg-tesla-bg px-3 py-1.5 text-sm text-tesla-text outline-none focus:border-tesla-accent"
            autoFocus
          />
        )}
      </div>
    </Modal>
  );
}
