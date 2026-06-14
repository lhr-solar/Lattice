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
        "relative inline-flex h-8 shrink-0 rounded-md border border-tesla-border bg-tesla-bg p-1",
        className,
      )}
    >
      <span
        aria-hidden
        className="absolute bottom-1 left-1 top-1 rounded bg-tesla-accent transition-transform duration-200 ease-out"
        style={{
          width: `calc((100% - 0.5rem) / ${options.length})`,
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
            "relative z-10 flex flex-1 items-center justify-center whitespace-nowrap rounded px-4 text-xs font-medium transition-colors",
            value === option.value
              ? "text-white"
              : "text-tesla-muted hover:bg-tesla-accent/10 hover:text-tesla-accent",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
