import clsx from "clsx";
import { useAppStore, type AppMode } from "@/stores/appStore";

const modes: { id: AppMode; label: string }[] = [
  { id: "design", label: "Design" },
  { id: "manufacturing", label: "Manufacturing" },
];

export function ModeToggle() {
  const mode = useAppStore((s) => s.mode);
  const setMode = useAppStore((s) => s.setMode);
  const selectedIndex = modes.findIndex((m) => m.id === mode);

  return (
    <div className="border-b border-tesla-border p-3">
      <p className="mb-2 text-xs uppercase tracking-wider text-tesla-muted">Mode</p>
      <div className="relative flex rounded-md border border-tesla-border p-0.5">
        <span
          aria-hidden
          className="absolute bottom-0.5 left-0.5 top-0.5 rounded bg-tesla-accent transition-transform duration-200 ease-out"
          style={{
            width: `calc((100% - 0.25rem) / ${modes.length})`,
            transform: `translateX(${Math.max(selectedIndex, 0) * 100}%)`,
          }}
        />
        {modes.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMode(m.id)}
            className={clsx(
              "relative z-10 flex-1 rounded px-2 py-1.5 text-sm transition-colors",
              mode === m.id ? "text-white" : "text-tesla-muted hover:text-tesla-text",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>
    </div>
  );
}
