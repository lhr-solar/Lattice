import clsx from "clsx";
import {
  resolveWireColorCss,
  wireColorNeedsBorder,
  wireColorTextContrast,
} from "@/lib/wireColors";

interface WireColorSwatchProps {
  label: string | null | undefined;
  className?: string;
  emptyLabel?: string;
}

export function WireColorSwatch({
  label,
  className,
  emptyLabel = "—",
}: WireColorSwatchProps) {
  if (!label?.trim()) {
    return <span className={clsx("text-tesla-muted", className)}>{emptyLabel}</span>;
  }

  const bg = resolveWireColorCss(label);
  const text = wireColorTextContrast(bg);

  return (
    <span
      className={clsx(
        "inline-flex min-w-[2.75rem] items-center justify-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        wireColorNeedsBorder(bg) && "border border-tesla-border",
        className,
      )}
      style={{ backgroundColor: bg, color: text }}
      title={label}
    >
      {label}
    </span>
  );
}

interface WireColorPresetButtonProps {
  code: string;
  onClick: () => void;
}

export function WireColorPresetButton({ code, onClick }: WireColorPresetButtonProps) {
  const bg = resolveWireColorCss(code);
  const text = wireColorTextContrast(bg);

  return (
    <button
      type="button"
      onClick={onClick}
      title={code}
      className={clsx(
        "inline-flex h-7 min-w-[2.25rem] items-center justify-center rounded px-1.5 text-[10px] font-semibold uppercase tracking-wide transition hover:ring-2 hover:ring-tesla-accent/60",
        wireColorNeedsBorder(bg) && "border border-tesla-border",
      )}
      style={{ backgroundColor: bg, color: text }}
    >
      {code}
    </button>
  );
}
