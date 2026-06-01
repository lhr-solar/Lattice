import type { ReactNode } from "react";

interface ModalProps {
  open: boolean;
  title: string;
  children?: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
}

export function Modal({ open, title, children, footer, onClose }: ModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 panel-fade-in">
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
        aria-label={title}
        className="relative z-10 w-full max-w-md rounded-lg border border-tesla-border bg-tesla-surface shadow-2xl"
      >
        <header className="border-b border-tesla-border px-4 py-3">
          <h2 className="text-base font-semibold text-tesla-text">{title}</h2>
        </header>
        {children && <div className="px-4 py-3 text-sm text-tesla-muted">{children}</div>}
        {footer && <footer className="flex justify-end gap-2 border-t border-tesla-border px-4 py-3">{footer}</footer>}
      </div>
    </div>
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
}: ConfirmModalProps) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
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
  submitLabel?: string;
  cancelLabel?: string;
  disabled?: boolean;
  onChange: (next: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

export function PromptModal({
  open,
  title,
  message,
  value,
  submitLabel = "Save",
  cancelLabel = "Cancel",
  disabled = false,
  onChange,
  onSubmit,
  onCancel,
}: PromptModalProps) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
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
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md border border-tesla-border bg-tesla-bg px-3 py-1.5 text-sm text-tesla-text outline-none focus:border-tesla-accent"
          autoFocus
        />
      </div>
    </Modal>
  );
}
