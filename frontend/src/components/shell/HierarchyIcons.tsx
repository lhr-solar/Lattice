import clsx from "clsx";

export function HierarchyIcon({ kind, className }: { kind: string; className?: string }) {
  const cls = clsx("shrink-0", className);
  switch (kind) {
    case "vehicle":
      return (
        <svg viewBox="0 0 16 16" className={cls} width={14} height={14} aria-hidden>
          <path
            fill="currentColor"
            d="M1.5 7.5h1.1l.7-2.2A1.5 1.5 0 0 1 4.6 4.5h6.8a1.5 1.5 0 0 1 1.3.8l.7 2.2h1.1a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-.5.5h-.8a1.5 1.5 0 0 1-2.9 0H5.2a1.5 1.5 0 0 1-2.9 0h-.8a.5.5 0 0 1-.5-.5V8a.5.5 0 0 1 .5-.5Zm3.1-2.5-1 3h7.8l-1-3H4.6ZM4 12a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm8 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
          />
        </svg>
      );
    case "enclosure":
      return (
        <svg viewBox="0 0 16 16" className={cls} width={14} height={14} aria-hidden>
          <path
            fill="currentColor"
            d="M2 5.5 8 2l6 3.5v7L8 16l-6-3.5v-7Zm1 .9v5.2l5 2.9 5-2.9V6.4L8 3.5 3 6.4Z"
          />
        </svg>
      );
    case "pcb":
    case "node":
      return (
        <svg viewBox="0 0 16 16" className={cls} width={14} height={14} aria-hidden>
          <path
            fill="currentColor"
            d="M3 3h10v10H3V3Zm1 1v8h8V4H4Zm1.5 1.5h1v1h-1v-1Zm3 0h1v1h-1v-1Zm-3 3h1v1h-1v-1Zm3 0h1v1h-1v-1Zm-3 3h1v1h-1v-1Zm3 0h1v1h-1v-1Z"
          />
        </svg>
      );
    case "panelMount":
      return (
        <svg viewBox="0 0 16 16" className={cls} width={14} height={14} aria-hidden>
          <path
            fill="currentColor"
            d="M2 3h12v3H2V3Zm0 4h12v6H2V7Zm2 1.5v3h8v-3H4Zm1.5.5h1.5v2H5.5v-2Zm3 0h1.5v2H8.5v-2Z"
          />
        </svg>
      );
    case "inlineConnector":
      return (
        <svg viewBox="0 0 16 16" className={cls} width={14} height={14} aria-hidden>
          <path
            fill="currentColor"
            d="M1 7.5h3.5l1-2h2l1 2H12v1H8.5l-1 2h-2l-1-2H1v-1Zm5.5-1.3.6 1.3h1.8l.6-1.3H6.5Z"
          />
        </svg>
      );
    case "connector":
      return (
        <svg viewBox="0 0 16 16" className={cls} width={14} height={14} aria-hidden>
          <path
            fill="currentColor"
            d="M5 4.5a2.5 2.5 0 0 0 0 5h1.2l.8 2H9l.8-2H11a2.5 2.5 0 0 0 0-5H5Zm0 1h6a1.5 1.5 0 0 1 0 3H9.6l-.5 1.2H6.9L6.4 9.5H5a1.5 1.5 0 0 1 0-3Z"
          />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 16 16" className={cls} width={14} height={14} aria-hidden>
          <circle cx="8" cy="8" r="2" fill="currentColor" />
        </svg>
      );
  }
}
