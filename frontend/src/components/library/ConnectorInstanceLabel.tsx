interface ConnectorInstanceLabelProps {
  label: string;
  templateLabel?: string | null;
  /** When true, stack template below primary (tree). When false, inline (canvas header). */
  stacked?: boolean;
  className?: string;
}

export function ConnectorInstanceLabel({
  label,
  templateLabel,
  stacked = false,
  className = "",
}: ConnectorInstanceLabelProps) {
  if (!templateLabel) {
    return (
      <span className={className}>
        <span className="italic">{label}</span>
      </span>
    );
  }

  if (stacked) {
    return (
      <span className={`flex min-w-0 flex-col ${className}`}>
        <span className="truncate">{label}</span>
        <span className="truncate text-[10px] italic text-tesla-muted">{templateLabel}</span>
      </span>
    );
  }

  return (
    <span className={`inline-flex min-w-0 items-baseline gap-1 ${className}`}>
      <span className="truncate">{label}</span>
      <span className="shrink-0 text-[9px] italic text-tesla-muted">({templateLabel})</span>
    </span>
  );
}

export function connectorNodeTitle(label: string, templateLabel?: string | null): string {
  if (!templateLabel) return label;
  return `${label} (${templateLabel})`;
}
