import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { fetchConnectionScopes } from "@/api/connections";
import {
  fetchWireTable,
  updateEdgeManufacturing,
  type WireRow,
} from "@/api/manufacturing";
import { useAppStore } from "@/stores/appStore";
import { invalidateRevisionDomains } from "@/lib/revisionInvalidation";
import { isBlueSectionTitle } from "@/lib/tableSectionStyles";
import { WireColorSwatch } from "@/components/wiring/WireColorSwatch";

type SortKey =
  | "signal_name"
  | "source_connector"
  | "destination_connector"
  | "wire_color"
  | "gauge_label"
  | "manufactured"
  | "continuity_checked";

type GroupMode = "section" | "signal" | "none";

/** Backend stores naive UTC datetimes; JS would otherwise treat them as local. */
function parseApiTimestamp(iso: string | null): Date | null {
  if (!iso) return null;
  const hasTimezone = /[zZ]$|[+-]\d{2}:\d{2}$/.test(iso);
  const normalized = hasTimezone ? iso : iso.includes("T") ? `${iso}Z` : iso;
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatTime12h(d: Date): string {
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "pm" : "am";
  hours = hours % 12;
  hours = hours ? hours : 12;
  return `${hours}:${minutes} ${ampm}`;
}

function formatTimestampFull(iso: string | null): string {
  const d = parseApiTimestamp(iso);
  if (!d) return iso ?? "";
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const month = months[d.getMonth()];
  const day = d.getDate();
  const year = d.getFullYear();
  return `${month} ${day}, ${year} ${formatTime12h(d)}`;
}

function formatTimestampShort(iso: string | null): string {
  const d = parseApiTimestamp(iso);
  if (!d) return iso ?? "";

  const now = new Date();
  if (isSameLocalDay(d, now)) {
    return formatTime12h(d);
  }

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = months[d.getMonth()];
  const day = d.getDate();
  if (d.getFullYear() !== now.getFullYear()) {
    return `${month} ${day}, ${d.getFullYear()}`;
  }
  return `${month} ${day}`;
}

function wireSearchHay(row: WireRow): string {
  return [
    row.signal_name,
    row.source_node,
    row.source_connector,
    row.source_pin,
    row.destination_node,
    row.destination_enclosure,
    row.destination_connector,
    row.destination_pin,
    row.effective_wire_color,
    row.wire_color,
    row.gauge_label,
    row.notes,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function sortRows(rows: WireRow[], key: SortKey, asc: boolean): WireRow[] {
  const dir = asc ? 1 : -1;
  return [...rows].sort((a, b) => {
    let av: string | number | boolean = "";
    let bv: string | number | boolean = "";
    switch (key) {
      case "signal_name":
        av = a.signal_name ?? "";
        bv = b.signal_name ?? "";
        break;
      case "source_connector":
        av = `${a.source_connector} ${a.source_pin}`;
        bv = `${b.source_connector} ${b.source_pin}`;
        break;
      case "destination_connector":
        av = `${a.destination_connector} ${a.destination_pin}`;
        bv = `${b.destination_connector} ${b.destination_pin}`;
        break;
      case "wire_color":
        av = a.effective_wire_color ?? a.wire_color ?? "";
        bv = b.effective_wire_color ?? b.wire_color ?? "";
        break;
      case "gauge_label":
        av = a.gauge_label;
        bv = b.gauge_label;
        break;
      case "manufactured":
        av = a.manufactured ? 1 : 0;
        bv = b.manufactured ? 1 : 0;
        break;
      case "continuity_checked":
        av = a.continuity_checked ? 1 : 0;
        bv = b.continuity_checked ? 1 : 0;
        break;
    }
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return a.edge_id.localeCompare(b.edge_id);
  });
}

interface RowGroup {
  key: string;
  title: string;
  rows: WireRow[];
}

function groupRows(rows: WireRow[], mode: GroupMode): RowGroup[] {
  if (mode === "none") {
    return [{ key: "_all", title: "All wires", rows }];
  }
  const buckets = new Map<string, RowGroup>();
  for (const row of rows) {
    const key =
      mode === "signal"
        ? `sig:${row.signal_name ?? "(no signal)"}`
        : `sec:${row.section_key}`;
    const title =
      mode === "signal" ? (row.signal_name ?? "(no signal)") : (row.section_title ?? "Other");
    const existing = buckets.get(key);
    if (existing) {
      existing.rows.push(row);
    } else {
      buckets.set(key, { key, title, rows: [row] });
    }
  }
  return [...buckets.values()].sort((a, b) => a.title.localeCompare(b.title));
}

export function WireTableView({
  staleCount,
  setStaleCount,
}: {
  staleCount: number;
  setStaleCount: (n: number) => void;
}) {
  const queryClient = useQueryClient();
  const vehicleId = useAppStore((s) => s.selectedVehicleId);
  const revisionId = useAppStore((s) => s.selectedRevisionId);
  const scope = useAppStore((s) => s.connectionScope);
  const setScope = useAppStore((s) => s.setConnectionScope);

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("source_connector");
  const [sortAsc, setSortAsc] = useState(true);
  const [groupMode, setGroupMode] = useState<GroupMode>("section");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "complete">("all");

  const scopeParams = useMemo(() => {
    if (scope.kind === "vehicle") return { vehicle_level: true };
    if (scope.kind === "enclosure" && scope.id) return { enclosure_instance_id: scope.id };
    if (scope.kind === "node" && scope.id) return { pcb_instance_id: scope.id };
    if (scope.kind === "connector" && scope.id) return { connector_instance_id: scope.id };
    return {};
  }, [scope]);

  const { data: scopes = [] } = useQuery({
    queryKey: ["connection-scopes", vehicleId, revisionId],
    queryFn: () => fetchConnectionScopes(vehicleId!, revisionId!),
    enabled: Boolean(vehicleId && revisionId),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["manufacturing-wire-table", vehicleId, revisionId, scopeParams, search],
    queryFn: () =>
      fetchWireTable(vehicleId!, revisionId!, { ...scopeParams, search: search || undefined }),
    enabled: Boolean(vehicleId && revisionId),
  });

  const [pendingEdgeIds, setPendingEdgeIds] = useState<Set<string>>(new Set());

  const updateMutation = useMutation({
    mutationFn: ({
      edgeId,
      payload,
    }: {
      edgeId: string;
      payload: { manufactured?: boolean; continuity_checked?: boolean };
    }) => updateEdgeManufacturing(vehicleId!, revisionId!, edgeId, payload),
    onMutate: ({ edgeId }) => {
      setPendingEdgeIds((prev) => new Set(prev).add(edgeId));
    },
    onSuccess: () =>
      invalidateRevisionDomains(queryClient, ["manufacturing-wire-table"]),
    onSettled: (_data, _error, { edgeId }) => {
      setPendingEdgeIds((prev) => {
        const next = new Set(prev);
        next.delete(edgeId);
        return next;
      });
    },
  });

  const processedRows = useMemo(() => {
    let rows = data?.rows ?? [];
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter((r) => wireSearchHay(r).includes(q));
    }
    if (statusFilter === "pending") {
      rows = rows.filter((r) => !r.manufactured || !r.continuity_checked);
    } else if (statusFilter === "complete") {
      rows = rows.filter((r) => r.manufactured && r.continuity_checked);
    }
    return sortRows(rows, sortKey, sortAsc);
  }, [data?.rows, search, sortKey, sortAsc, statusFilter]);

  const groups = useMemo(() => groupRows(processedRows, groupMode), [processedRows, groupMode]);

  const currentStaleCount = useMemo(
    () =>
      (data?.rows ?? []).filter((r) => r.manufactured_stale || r.continuity_checked_stale).length,
    [data?.rows],
  );

  useMemo(() => {
    setStaleCount(currentStaleCount);
  }, [currentStaleCount, setStaleCount]);

  return (
    <div className="flex min-h-0 flex-1">
      <ScopeSidebar scopes={scopes} scope={scope} onPick={setScope} />

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-tesla-border p-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search signal, connector, pin, color…"
            className="w-full max-w-xs rounded-md border border-tesla-border bg-tesla-bg px-3 py-1.5 text-sm outline-none focus:border-tesla-accent"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="rounded-md border border-tesla-border bg-tesla-bg px-2 py-1.5 text-sm"
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending work</option>
            <option value="complete">Fully complete</option>
          </select>
          <select
            value={groupMode}
            onChange={(e) => setGroupMode(e.target.value as GroupMode)}
            className="rounded-md border border-tesla-border bg-tesla-bg px-2 py-1.5 text-sm"
          >
            <option value="section">Group by section</option>
            <option value="signal">Group by signal</option>
            <option value="none">No grouping</option>
          </select>
          <span className="ml-auto text-xs text-tesla-muted">
            {processedRows.length} wire{processedRows.length === 1 ? "" : "s"}
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {isLoading && <p className="p-4 text-sm text-tesla-muted">Loading wire table…</p>}
          {!isLoading && processedRows.length === 0 && (
            <p className="p-4 text-sm text-tesla-muted">
              No wires in this scope. Add connections in Design mode first.
            </p>
          )}

          {groups.map((group) => (
            <div key={group.key}>
              {groupMode !== "none" && (
                <div className="sticky top-0 z-[2] border-b border-tesla-border bg-tesla-surface/95 px-3 py-1.5 backdrop-blur">
                  <span
                    className={clsx(
                      "text-xs font-semibold uppercase tracking-wide",
                      isBlueSectionTitle(group.key) ? "text-tesla-accent" : "text-tesla-text",
                    )}
                  >
                    {group.title}
                  </span>
                  <span className="ml-2 text-[11px] text-tesla-muted">
                    {group.rows.length} wire{group.rows.length === 1 ? "" : "s"}
                  </span>
                </div>
              )}
              <table className="w-full min-w-[1240px] text-left text-xs">
                <thead className="sticky top-0 z-[1] bg-tesla-surface/95 text-tesla-muted backdrop-blur">
                  <tr className="border-b border-tesla-border">
                    <SortHeader label="Signal" col="signal_name" sortKey={sortKey} sortAsc={sortAsc} onSort={(k, a) => { setSortKey(k); setSortAsc(a); }} />
                    <th className="px-2 py-2 pr-3 font-medium">Source node</th>
                    <SortHeader label="Source connector" col="source_connector" sortKey={sortKey} sortAsc={sortAsc} onSort={(k, a) => { setSortKey(k); setSortAsc(a); }} />
                    <th className="px-2 py-2 font-medium">Source pin</th>
                    <th className="px-2 py-2 font-medium">Dest enclosure</th>
                    <th className="px-2 py-2 font-medium">Dest node</th>
                    <SortHeader label="Dest connector" col="destination_connector" sortKey={sortKey} sortAsc={sortAsc} onSort={(k, a) => { setSortKey(k); setSortAsc(a); }} />
                    <th className="px-2 py-2 font-medium">Dest pin</th>
                    <SortHeader label="Color" col="wire_color" sortKey={sortKey} sortAsc={sortAsc} onSort={(k, a) => { setSortKey(k); setSortAsc(a); }} />
                    <SortHeader label="Gauge" col="gauge_label" sortKey={sortKey} sortAsc={sortAsc} onSort={(k, a) => { setSortKey(k); setSortAsc(a); }} />
                    <th className="px-2 py-2 font-medium">Notes</th>
                    <SortHeader label="Manufactured" col="manufactured" sortKey={sortKey} sortAsc={sortAsc} onSort={(k, a) => { setSortKey(k); setSortAsc(a); }} width="w-[180px]" />
                    <SortHeader label="Continuity" col="continuity_checked" sortKey={sortKey} sortAsc={sortAsc} onSort={(k, a) => { setSortKey(k); setSortAsc(a); }} width="w-[180px]" />
                  </tr>
                </thead>
                <tbody>
                  {group.rows.map((row) => (
                    <WireRowView
                      key={row.edge_id}
                      row={row}
                      busy={pendingEdgeIds.has(row.edge_id)}
                      onToggle={(payload) =>
                        updateMutation.mutate({ edgeId: row.edge_id, payload })
                      }
                    />
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function connectorKindLabel(kind: string | null | undefined): string | null {
  if (kind === "panel") return "panel mount";
  if (kind === "pigtail") return "pigtail";
  return null;
}

function PinCell({ number, name }: { number: number; name: string }) {
  const trimmed = name.trim();
  return (
    <div className="leading-snug">
      <span className="font-semibold text-tesla-text">{number}</span>
      {trimmed && (
        <span className="mt-0.5 block text-[10px] text-tesla-muted">{trimmed}</span>
      )}
    </div>
  );
}

function EndpointNodeCell({
  node,
  connectorKind,
}: {
  node: string | null;
  connectorKind: string | null;
}) {
  const kindLabel = connectorKindLabel(connectorKind);
  if (!node && !kindLabel) {
    return <span className="text-tesla-muted">—</span>;
  }
  return (
    <div className="leading-snug">
      {node && <span className="text-tesla-muted">{node}</span>}
      {kindLabel && (
        <span
          className={clsx(
            "text-[10px] italic text-tesla-muted/80",
            node && "mt-0.5 block",
          )}
        >
          {kindLabel}
        </span>
      )}
    </div>
  );
}

function SortHeader({
  label,
  col,
  sortKey,
  sortAsc,
  onSort,
  width,
}: {
  label: string;
  col: SortKey;
  sortKey: SortKey;
  sortAsc: boolean;
  onSort: (key: SortKey, asc: boolean) => void;
  width?: string;
}) {
  const active = sortKey === col;
  return (
    <th className={clsx("px-2 py-2 font-medium", width)}>
      <button
        type="button"
        onClick={() => onSort(col, active ? !sortAsc : true)}
        className={clsx("flex items-center gap-1 transition hover:text-tesla-text", active && "text-tesla-text")}
      >
        {label}
        {active && <span>{sortAsc ? "↑" : "↓"}</span>}
      </button>
    </th>
  );
}

function ConnectorCell({ name, slotId }: { name: string; slotId: string | null }) {
  return (
    <div className="flex items-center gap-1.5">
      {slotId && (
        <span className="shrink-0 rounded border border-tesla-border bg-tesla-border/25 px-1 py-px text-xs font-medium tabular-nums text-tesla-text">
          {slotId}
        </span>
      )}
      <span>{name}</span>
    </div>
  );
}

function WireRowView({
  row,
  busy,
  onToggle,
}: {
  row: WireRow;
  busy: boolean;
  onToggle: (payload: { manufactured?: boolean; continuity_checked?: boolean }) => void;
}) {
  return (
    <tr className="h-[48px] border-b border-tesla-border/40 hover:bg-tesla-border/20">
      <td className="px-2 py-2 pr-3">{row.signal_name ?? "—"}</td>
      <td className="px-2 py-2 text-tesla-muted">{row.source_node ?? "—"}</td>
      <td className="px-2 py-2">
        <ConnectorCell name={row.source_connector} slotId={row.source_slot_id} />
      </td>
      <td className="px-2 py-2">
        <PinCell number={row.source_pin_number} name={row.source_pin_name} />
      </td>
      <td className="px-2 py-2 text-tesla-muted">{row.destination_enclosure ?? "—"}</td>
      <td className="px-2 py-2">
        <EndpointNodeCell
          node={row.destination_node}
          connectorKind={row.destination_connector_kind}
        />
      </td>
      <td className="px-2 py-2">
        <ConnectorCell name={row.destination_connector} slotId={row.destination_slot_id} />
      </td>
      <td className="px-2 py-2">
        <PinCell number={row.destination_pin_number} name={row.destination_pin_name} />
      </td>
      <td className="px-2 py-2">
        <WireColorSwatch label={row.effective_wire_color ?? row.wire_color} />
      </td>
      <td className="px-2 py-2">{row.gauge_label}</td>
      <td className="max-w-[120px] truncate px-2 py-2 text-tesla-muted" title={row.notes ?? undefined}>
        {row.notes ?? "—"}
      </td>
      <td className="w-[180px] overflow-visible px-2 py-0">
        <StatusCell
          checked={row.manufactured}
          stale={row.manufactured_stale}
          by={row.manufactured_by?.username ?? null}
          at={row.manufactured_at}
          busy={busy}
          label="Built"
          onChange={(v) => {
            const payload: { manufactured: boolean; continuity_checked?: boolean } = { manufactured: v };
            // If unbuilding, must also uncheck tested
            if (!v) payload.continuity_checked = false;
            onToggle(payload);
          }}
        />
      </td>
      <td className="w-[180px] overflow-visible px-2 py-0">
        <StatusCell
          checked={row.continuity_checked}
          stale={row.continuity_checked_stale}
          by={row.continuity_checked_by?.username ?? null}
          at={row.continuity_checked_at}
          busy={busy}
          disabled={!row.manufactured}
          label="Tested"
          onChange={(v) => onToggle({ continuity_checked: v })}
        />
      </td>
    </tr>
  );
}

function StatusCell({
  checked,
  stale,
  by,
  at,
  disabled = false,
  busy = false,
  label,
  onChange,
}: {
  checked: boolean;
  stale: boolean;
  by: string | null;
  at: string | null;
  disabled?: boolean;
  busy?: boolean;
  label: string;
  onChange: (value: boolean) => void;
}) {
  const metaShort =
    checked && by && at ? `${by} • ${formatTimestampShort(at)}` : null;
  const metaFull =
    checked && by && at ? `${by} • ${formatTimestampFull(at)}` : undefined;

  function handleChange(value: boolean) {
    if (disabled || busy) return;
    onChange(value);
  }

  return (
    <div className="relative z-0 h-[48px] w-[180px] hover:z-20">
      <label
        className={clsx(
          "block h-full w-full",
          disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer",
        )}
      >
        <span
          className={clsx(
            "absolute left-0 top-1/2 z-10 -translate-y-1/2",
            disabled ? "cursor-not-allowed" : "cursor-pointer",
          )}
        >
          <span className="relative flex h-4 w-4 items-center justify-center">
            <input
              type="checkbox"
              checked={checked}
              disabled={disabled}
              onChange={(e) => handleChange(e.target.checked)}
              className={clsx(
                "m-0 h-4 w-4 shrink-0 appearance-none rounded border border-tesla-border bg-white/5 p-0 transition-colors checked:border-emerald-500 checked:bg-emerald-500",
                disabled ? "cursor-not-allowed" : "cursor-pointer",
              )}
            />
            <svg
              className={clsx(
                "pointer-events-none absolute inset-0 m-auto h-3 w-3 fill-none stroke-white stroke-[2.5] transition-opacity",
                checked ? "opacity-100" : "opacity-0",
              )}
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden
            >
              <path d="M20 6L9 17L4 12" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </span>

        <span
          className={clsx(
            "absolute left-[22px] right-0 flex flex-col pl-0.5 transition-[top] duration-200 ease-out",
            checked ? "top-2" : "top-4",
          )}
        >
          <span
            className={clsx(
              "truncate text-sm font-medium leading-4 transition-colors duration-150",
              checked ? (stale ? "text-amber-400" : "text-emerald-400") : "text-tesla-muted",
            )}
          >
            {label}
          </span>
          <span
            className={clsx(
              "group/meta relative min-w-0 transition-[height,opacity] duration-200 ease-out",
              checked ? "h-4 opacity-100" : "h-0 overflow-hidden opacity-0",
            )}
            aria-hidden={!checked}
          >
            <span
              className={clsx(
                "block truncate rounded px-0.5 text-xs leading-4 text-tesla-muted/80 transition-colors",
                "hover:bg-tesla-border/50 hover:text-tesla-text",
              )}
            >
              {metaShort ?? "\u00a0"}
            </span>
            {metaFull && (
              <span
                role="tooltip"
                className="pointer-events-none absolute bottom-full left-0 z-30 mb-1 hidden max-w-[260px] whitespace-normal rounded border border-tesla-border bg-tesla-surface px-2.5 py-1.5 text-base leading-snug text-tesla-text shadow-lg group-hover/meta:block"
              >
                {metaFull}
              </span>
            )}
          </span>
        </span>
      </label>
    </div>
  );
}

function ScopeSidebar({
  scopes,
  scope,
  onPick,
}: {
  scopes: { id: string; kind: string; label: string; parent_label: string | null; pin_count: number }[];
  scope: { kind: string; id: string | null };
  onPick: (next: {
    kind: "all" | "vehicle" | "enclosure" | "node" | "connector";
    id: string | null;
  }) => void;
}) {
  const enclosures = scopes.filter((s) => s.kind === "enclosure");
  const nodes = scopes.filter((s) => s.kind === "node");
  const nodesByParent = useMemo(() => {
    const m = new Map<string, typeof nodes>();
    for (const n of nodes) {
      const key = n.parent_label ?? "__loose__";
      m.set(key, [...(m.get(key) ?? []), n]);
    }
    return m;
  }, [nodes]);

  const itemCls = (active: boolean) =>
    clsx(
      "flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm transition",
      active ? "bg-tesla-accent/15 text-tesla-text" : "text-tesla-muted hover:bg-tesla-border/50",
    );

  return (
    <div className="flex w-64 shrink-0 flex-col overflow-y-auto border-r border-tesla-border p-2">
      <p className="mb-2 px-2 text-[10px] uppercase tracking-wide text-tesla-muted">Harness scope</p>
      <button
        type="button"
        className={itemCls(scope.kind === "vehicle")}
        onClick={() => onPick({ kind: "vehicle", id: null })}
      >
        <span>Vehicle level</span>
      </button>
      <button
        type="button"
        className={itemCls(scope.kind === "all")}
        onClick={() => onPick({ kind: "all", id: null })}
      >
        <span>All wires</span>
      </button>

      {enclosures.map((enc) => (
        <div key={enc.id} className="mt-2">
          <button
            type="button"
            className={itemCls(scope.kind === "enclosure" && scope.id === enc.id)}
            onClick={() => onPick({ kind: "enclosure", id: enc.id })}
          >
            <span className="truncate">{enc.label}</span>
          </button>
          {(nodesByParent.get(enc.label) ?? []).map((node) => (
            <button
              key={node.id}
              type="button"
              className={clsx(itemCls(scope.kind === "node" && scope.id === node.id), "ml-3 mt-0.5")}
              onClick={() => onPick({ kind: "node", id: node.id })}
            >
              <span className="truncate">{node.label}</span>
            </button>
          ))}
        </div>
      ))}

      {(nodesByParent.get("__loose__") ?? []).map((node) => (
        <button
          key={node.id}
          type="button"
          className={clsx(itemCls(scope.kind === "node" && scope.id === node.id), "mt-2")}
          onClick={() => onPick({ kind: "node", id: node.id })}
        >
          <span className="truncate">{node.label}</span>
        </button>
      ))}
    </div>
  );
}
