import clsx from "clsx";
import { useAppStore, type AppMode } from "@/stores/appStore";

const modes: { id: AppMode; label: string }[] = [
  { id: "design", label: "Design" },
  { id: "manufacturing", label: "Manufacturing" },
];

export function ModeSwitch() {
  const mode = useAppStore((s) => s.mode);
  const setMode = useAppStore((s) => s.setMode);
  const selectedIndex = modes.findIndex((m) => m.id === mode);

  return (
    <div
      role="group"
      aria-label="Application mode"
      className="relative inline-flex h-7 w-[17rem] shrink-0 rounded-full border border-tesla-border bg-tesla-bg p-0.5"
    >
      <span
        aria-hidden
        className="absolute bottom-0.5 left-0.5 top-0.5 rounded-full bg-tesla-accent shadow-sm transition-transform duration-200 ease-out"
        style={{
          width: `calc((100% - 0.25rem) / ${modes.length})`,
          transform: `translateX(${Math.max(selectedIndex, 0) * 100}%)`,
        }}
      />
      {modes.map((m) => (
        <button
          key={m.id}
          type="button"
          role="radio"
          aria-checked={mode === m.id}
          onClick={() => setMode(m.id)}
          className={clsx(
            "relative z-10 flex flex-1 items-center justify-center whitespace-nowrap rounded-full px-2 text-xs font-medium leading-none transition-colors",
            mode === m.id ? "text-white" : "text-tesla-muted hover:text-tesla-text",
          )}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
