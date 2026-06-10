import clsx from "clsx";

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  className?: string;
  size?: "sm" | "md";
}

export function Checkbox({
  checked,
  onChange,
  disabled = false,
  label,
  className,
  size = "md",
}: CheckboxProps) {
  const box = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
  const icon = size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3";

  const control = (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(
        "inline-flex shrink-0 items-center justify-center rounded border transition",
        box,
        checked
          ? "border-tesla-accent bg-tesla-accent text-white"
          : "border-tesla-border bg-tesla-bg text-transparent hover:border-tesla-muted",
        disabled && "cursor-not-allowed opacity-40",
        !disabled && "cursor-pointer",
        className,
      )}
    >
      <svg viewBox="0 0 12 12" className={icon} fill="none" aria-hidden>
        <path
          d="M2.5 6L5 8.5L9.5 3.5"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );

  if (!label) return control;

  return (
    <label
      className={clsx(
        "inline-flex items-center gap-2",
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
      )}
    >
      {control}
      <span className="text-sm text-tesla-muted">{label}</span>
    </label>
  );
}
