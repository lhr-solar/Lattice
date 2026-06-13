import { useEffect, useMemo, useRef, useState } from "react";
import type { PinNameEntry } from "@/api/pinNames";

export function PinNamePicker({
  value,
  onChange,
  entries,
  onManageLibrary,
  placeholder = "Pin name",
}: {
  value: string;
  onChange: (name: string) => void;
  entries: PinNameEntry[];
  onManageLibrary?: () => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const query = value.trim().toLowerCase();
    if (!query) return entries;
    return entries.filter((entry) => {
      const haystack = [entry.name, entry.description].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(query);
    });
  }, [entries, value]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  return (
    <div ref={containerRef} className="relative flex min-w-0">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className={`min-w-0 flex-1 rounded-l border border-tesla-border bg-tesla-bg px-2 py-1 text-sm outline-none focus:border-tesla-accent ${
          value.trim() ? "text-tesla-text" : "text-tesla-muted"
        }`}
      />
      <button
        type="button"
        title="Pick saved pin name"
        onClick={() => setOpen((prev) => !prev)}
        className="shrink-0 rounded-r border border-l-0 border-tesla-border bg-tesla-bg px-2 text-xs text-tesla-muted transition hover:border-tesla-accent hover:text-tesla-text"
      >
        ▾
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 rounded-md border border-tesla-border bg-tesla-surface shadow-xl">
          <ul className="max-h-44 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-tesla-muted">No saved names match</li>
            ) : (
              filtered.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(entry.name);
                      setOpen(false);
                    }}
                    className={`w-full px-3 py-2 text-left transition hover:bg-tesla-border/40 ${
                      entry.name === value ? "bg-tesla-accent/10" : ""
                    }`}
                  >
                    <p className="truncate text-sm text-tesla-text">{entry.name}</p>
                    {entry.description ? (
                      <p className="truncate text-xs text-tesla-muted">{entry.description}</p>
                    ) : null}
                  </button>
                </li>
              ))
            )}
          </ul>
          {onManageLibrary && (
            <div className="border-t border-tesla-border p-2">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onManageLibrary();
                }}
                className="w-full rounded border border-tesla-border px-2 py-1.5 text-left text-sm text-tesla-muted transition hover:border-tesla-accent hover:text-tesla-text"
              >
                Manage saved names…
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
