import { useEffect, useMemo, useRef, useState } from "react";
import type { ConnectorTemplate } from "@/api/connectorTemplates";
import type { EnclosureTemplate, PcbTemplate } from "@/api/templates";

export function connectorSubtitle(connector: ConnectorTemplate) {
  return [`${connector.pin_count} pins`, connector.manufacturer, connector.key_code]
    .filter(Boolean)
    .join(" · ");
}

export function pcbSubtitle(pcb: PcbTemplate) {
  return [`${pcb.slots.length} connector slots`, pcb.description].filter(Boolean).join(" · ");
}

export function enclosureSubtitle(enclosure: EnclosureTemplate) {
  return [
    `${enclosure.slots.length} panel connectors`,
    `${enclosure.pcb_slots?.length ?? 0} nodes`,
  ].join(" · ");
}

interface PickerItem {
  id: string;
  title: string;
  subtitle?: string;
}

function SearchablePicker({
  label,
  items,
  value,
  onChange,
  placeholder,
  searchPlaceholder,
  emptyMessage,
  addActionLabel,
  onAddAction,
}: {
  label: string;
  items: PickerItem[];
  value: string;
  onChange: (id: string) => void;
  placeholder: string;
  searchPlaceholder: string;
  emptyMessage: string;
  addActionLabel?: string;
  onAddAction?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = items.find((item) => item.id === value) ?? null;

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return items;
    return items.filter((item) => {
      const haystack = [item.title, item.subtitle].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(query);
    });
  }, [items, search]);

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  return (
    <div ref={containerRef} className="relative flex flex-col gap-1 text-xs text-tesla-muted">
      {label}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="rounded border border-tesla-border bg-tesla-bg px-2 py-1.5 text-left text-sm text-tesla-text transition hover:border-tesla-accent"
      >
        {selected ? (
          <span className="block truncate">
            <span className="text-tesla-text">{selected.title}</span>
            {selected.subtitle ? (
              <span className="ml-2 text-xs text-tesla-muted">{selected.subtitle}</span>
            ) : null}
          </span>
        ) : (
          <span className="text-tesla-muted">{placeholder}</span>
        )}
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-md border border-tesla-border bg-tesla-surface shadow-xl">
          <div className="border-b border-tesla-border p-2">
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full rounded border border-tesla-border bg-tesla-bg px-2 py-1.5 text-sm text-tesla-text outline-none focus:border-tesla-accent"
            />
          </div>
          <ul className="max-h-48 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-tesla-muted">{emptyMessage}</li>
            ) : (
              filtered.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(item.id);
                      setOpen(false);
                      setSearch("");
                    }}
                    className={`w-full px-3 py-2 text-left transition hover:bg-tesla-border/40 ${
                      item.id === value ? "bg-tesla-accent/10" : ""
                    }`}
                  >
                    <p className="truncate text-sm text-tesla-text">{item.title}</p>
                    {item.subtitle ? (
                      <p className="truncate text-xs text-tesla-muted">{item.subtitle}</p>
                    ) : null}
                  </button>
                </li>
              ))
            )}
          </ul>
          {onAddAction && addActionLabel && (
            <div className="border-t border-tesla-border p-2">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setSearch("");
                  onAddAction();
                }}
                className="w-full rounded border border-tesla-border px-2 py-1.5 text-left text-sm text-tesla-muted transition hover:border-tesla-accent hover:text-tesla-text"
              >
                + {addActionLabel}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ConnectorTemplatePicker({
  connectors,
  value,
  onChange,
  label = "Connector",
  onAddAction,
}: {
  connectors: ConnectorTemplate[];
  value: string;
  onChange: (id: string) => void;
  label?: string;
  onAddAction?: () => void;
}) {
  const items = useMemo(
    () =>
      connectors.map((connector) => ({
        id: connector.id,
        title: connector.name,
        subtitle: connectorSubtitle(connector),
      })),
    [connectors],
  );

  return (
    <SearchablePicker
      label={label}
      items={items}
      value={value}
      onChange={onChange}
      placeholder="Select connector…"
      searchPlaceholder="Search by name, manufacturer, key, pins…"
      emptyMessage="No connectors match."
      addActionLabel="Add connector template"
      onAddAction={onAddAction}
    />
  );
}

export function PcbTemplatePicker({
  pcbs,
  value,
  onChange,
  label = "Node",
  onAddAction,
}: {
  pcbs: PcbTemplate[];
  value: string;
  onChange: (id: string) => void;
  label?: string;
  onAddAction?: () => void;
}) {
  const items = useMemo(
    () =>
      pcbs.map((pcb) => ({
        id: pcb.id,
        title: pcb.name,
        subtitle: pcbSubtitle(pcb),
      })),
    [pcbs],
  );

  return (
    <SearchablePicker
      label={label}
      items={items}
      value={value}
      onChange={onChange}
      placeholder="Select node…"
      searchPlaceholder="Search by name, description, slots…"
      emptyMessage="No nodes match."
      addActionLabel="Add node template"
      onAddAction={onAddAction}
    />
  );
}

export function EnclosureTemplatePicker({
  enclosures,
  value,
  onChange,
  label = "Enclosure",
  onAddAction,
}: {
  enclosures: EnclosureTemplate[];
  value: string;
  onChange: (id: string) => void;
  label?: string;
  onAddAction?: () => void;
}) {
  const items = useMemo(
    () =>
      enclosures.map((enclosure) => ({
        id: enclosure.id,
        title: enclosure.name,
        subtitle: enclosureSubtitle(enclosure),
      })),
    [enclosures],
  );

  return (
    <SearchablePicker
      label={label}
      items={items}
      value={value}
      onChange={onChange}
      placeholder="Select enclosure…"
      searchPlaceholder="Search by name, slots…"
      emptyMessage="No enclosures match."
      addActionLabel="Add enclosure template"
      onAddAction={onAddAction}
    />
  );
}

export function InstancePicker({
  instances,
  value,
  onChange,
  label,
  placeholder,
  onAddAction,
  addActionLabel,
}: {
  instances: Array<{ id: string; label: string }>;
  value: string;
  onChange: (id: string) => void;
  label: string;
  placeholder: string;
  onAddAction?: () => void;
  addActionLabel?: string;
}) {
  const items = useMemo(
    () => instances.map((instance) => ({ id: instance.id, title: instance.label })),
    [instances],
  );

  return (
    <SearchablePicker
      label={label}
      items={items}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      searchPlaceholder="Search instances…"
      emptyMessage="No instances match."
      onAddAction={onAddAction}
      addActionLabel={addActionLabel}
    />
  );
}
