import clsx from "clsx";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentOption<T>[];
  className?: string;
  ariaLabel?: string;
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  className,
  ariaLabel,
}: SegmentedControlProps<T>) {
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={clsx(
        "relative inline-flex h-6 shrink-0 rounded border border-tesla-border bg-tesla-bg p-0.5",
        className,
      )}
    >
      <span
        aria-hidden
        className="absolute bottom-0.5 left-0.5 top-0.5 rounded bg-tesla-accent transition-transform duration-200 ease-out"
        style={{
          width: `calc((100% - 0.25rem) / ${options.length})`,
          transform: `translateX(${selectedIndex * 100}%)`,
        }}
      />
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={clsx(
            "relative z-10 flex flex-1 items-center justify-center rounded px-2 text-xs transition-colors",
            value === option.value
              ? "text-white"
              : "text-tesla-muted hover:bg-tesla-accent/20 hover:text-tesla-accent",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
