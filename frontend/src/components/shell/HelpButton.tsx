import { useAppStore } from "@/stores/appStore";

export function HelpButton() {
  const setShowHelpModal = useAppStore((s) => s.setShowHelpModal);

  return (
    <button
      type="button"
      onClick={() => setShowHelpModal(true)}
      className="rounded-md border border-tesla-border p-1 text-tesla-muted transition hover:border-tesla-accent hover:text-tesla-text"
      aria-label="Help"
      title="Help"
    >
      <HelpCircleIcon />
    </button>
  );
}

function HelpCircleIcon() {
  return (
    <svg
      aria-hidden
      className="h-3.5 w-3.5"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
    >
      <circle cx="8" cy="8" r="6.25" />
      <path
        d="M6.1 6.15c.2-1.1 1.15-1.85 2.4-1.85 1.35 0 2.25.75 2.25 1.85 0 .85-.45 1.25-1.35 1.75-.75.45-1.05.85-1.05 1.55V9.5"
        strokeLinecap="round"
      />
      <circle cx="8" cy="11.25" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}
