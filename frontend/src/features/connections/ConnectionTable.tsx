import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import {
  assignNetByName,
  connectPins,
  disconnectEdge,
  fetchConnectionScopes,
  fetchConnectionTable,
  type ConnectionDestination,
  type ConnectPinsResult,
  type PinConnectionRow,
} from "@/api/connections";
import { updateEdge } from "@/api/topology";
import { fetchNets, fetchPins, type NetPinInfo } from "@/api/nets";
import { updateNet } from "@/api/nets";
import { updateConnectorPin } from "@/api/instances";
import {
  createPinShort,
  deletePinShort,
  fetchPinShorts,
  type PinShort,
} from "@/api/shorts";
import { useAppStore } from "@/stores/appStore";
import { ConnectorInstanceLabel } from "@/components/library/ConnectorInstanceLabel";
import { WireColorPresetButton, WireColorSwatch } from "@/components/wiring/WireColorSwatch";
import { WIRE_COLOR_PRESETS } from "@/lib/wireColors";
import { useAutoDismiss } from "@/hooks/useAutoDismiss";
import { invalidateRevisionDomains } from "@/lib/revisionInvalidation";

function invalidateAll(qc: QueryClient) {
  invalidateRevisionDomains(qc, [
    "connection-table",
    "connection-scopes",
    "nets",
    "pins",
    "net-detail",
    "shorts",
    "design-projection",
    "topology-summary",
  ]);
}

interface ConnectorBucket {
  connectorId: string;
  label: string;
  kind: string | null;
  slotKey: string | null;
  templateName: string | null;
  container: string | null;
  node: string | null;
  nodeTemplate: string | null;
  enclosure: string | null;
  enclosureTemplate: string | null;
  rows: PinConnectionRow[];
}

interface TableSection {
  key: string;
  title: string | null;
  subtitle?: string;
  connectors: ConnectorBucket[];
}

const KIND_RANK: Record<string, number> = { panel: 0, pigtail: 1, pcb: 2, inline: 3 };

/** Group pins by connector, then into level-appropriate sections that mirror the
 *  flow "bubbling": vehicle -> container, enclosure -> node + panel/pigtail. */
function buildSections(rows: PinConnectionRow[], scopeKind: string): TableSection[] {
  const buckets = new Map<string, ConnectorBucket>();
  for (const r of rows) {
    let b = buckets.get(r.connector_instance_id);
    if (!b) {
      b = {
        connectorId: r.connector_instance_id,
        label: r.connector_label,
        kind: r.connector_kind,
        slotKey: r.slot_key,
        templateName: r.connector_template_name,
        container: r.container_label,
        node: r.node_label,
        nodeTemplate: r.node_template_name,
        enclosure: r.enclosure_label,
        enclosureTemplate: r.enclosure_template_name,
        rows: [],
      };
      buckets.set(r.connector_instance_id, b);
    }
    b.rows.push(r);
  }
  const list = [...buckets.values()];

  if (scopeKind === "node" || scopeKind === "connector") {
    return [{ key: "_", title: null, connectors: list }];
  }

  const sections = new Map<string, TableSection>();
  const order: string[] = [];
  const push = (
    key: string,
    title: string,
    sortHint: number,
    bucket: ConnectorBucket,
    subtitle?: string | null,
  ) => {
    let s = sections.get(key);
    if (!s) {
      s = { key, title, subtitle: subtitle ?? undefined, connectors: [] };
      sections.set(key, s);
      order.push(key);
      (s as TableSection & { _sort?: number })._sort = sortHint;
    }
    s.connectors.push(bucket);
  };

  if (scopeKind === "enclosure") {
    for (const b of list) {
      if (b.kind === "pcb" && b.node) {
        push(`node:${b.node}`, b.node, 1, b, b.nodeTemplate);
      } else {
        push("__panel__", "Panel / Pigtail", 0, b);
      }
    }
  } else {
    // vehicle / all
    for (const b of list) {
      if (b.enclosure) push(`enc:${b.enclosure}`, b.enclosure, 0, b, b.enclosureTemplate);
      else if (b.node) push(`node:${b.node}`, b.node, 1, b, b.nodeTemplate);
      else push("__inline__", "Inline / standalone", 2, b);
    }
  }

  const result = order.map((k) => sections.get(k)!);
  result.sort(
    (a, b) =>
      ((a as TableSection & { _sort?: number })._sort ?? 0) -
        ((b as TableSection & { _sort?: number })._sort ?? 0) ||
      (a.title ?? "").localeCompare(b.title ?? ""),
  );
  for (const s of result) {
    s.connectors.sort(
      (a, b) =>
        (KIND_RANK[a.kind ?? "inline"] ?? 9) - (KIND_RANK[b.kind ?? "inline"] ?? 9) ||
        a.label.localeCompare(b.label),
    );
  }
  return result;
}

export function ConnectionTable() {
  const qc = useQueryClient();
  const vehicleId = useAppStore((s) => s.selectedVehicleId);
  const revisionId = useAppStore((s) => s.selectedRevisionId);
  const show = useAppStore((s) => s.showConnectionTable);
  const setShow = useAppStore((s) => s.setShowConnectionTable);
  const scope = useAppStore((s) => s.connectionScope);
  const setScope = useAppStore((s) => s.setConnectionScope);

  const [search, setSearch] = useState("");
  const [flash, setFlash] = useState<{ kind: ConnectPinsResult["net_action"]; text: string } | null>(
    null,
  );

  useAutoDismiss(flash, () => setFlash(null));

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
    enabled: Boolean(show && vehicleId && revisionId),
  });

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["connection-table", vehicleId, revisionId, scopeParams, search],
    queryFn: () =>
      fetchConnectionTable(vehicleId!, revisionId!, { ...scopeParams, search: search || undefined }),
    enabled: Boolean(show && vehicleId && revisionId),
  });

  // Global pin list powers the destination picker (cross-connector targets).
  const { data: allPins = [] } = useQuery({
    queryKey: ["pins", vehicleId, revisionId, "all"],
    queryFn: () => fetchPins(vehicleId!, revisionId!),
    enabled: Boolean(show && vehicleId && revisionId),
  });

  const { data: nets = [] } = useQuery({
    queryKey: ["nets", vehicleId, revisionId, "all"],
    queryFn: () => fetchNets(vehicleId!, revisionId!),
    enabled: Boolean(show && vehicleId && revisionId),
  });

  const sections = useMemo(() => buildSections(rows, scope.kind), [rows, scope.kind]);

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 panel-fade-in">
      <div className="flex h-[min(860px,94vh)] w-full max-w-[1400px] flex-col overflow-hidden rounded-lg border border-tesla-border bg-tesla-surface shadow-2xl">
        <header className="flex items-center justify-between border-b border-tesla-border px-4 py-3">
          <div>
            <h2 className="text-lg font-semibold">Connection table</h2>
            <p className="text-xs text-tesla-muted">
              Set each pin&apos;s destination — wires auto-mirror on the other pin and pick up its net.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShow(false)}
            className="rounded px-2 py-1 text-tesla-muted transition hover:bg-tesla-border hover:text-tesla-text"
          >
            ✕
          </button>
        </header>

        <div className="flex min-h-0 flex-1">
          <ScopeSidebar
            scopes={scopes}
            scope={scope}
            onPick={(next) => setScope(next)}
          />

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center gap-2 border-b border-tesla-border p-3">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter pins, nets, connectors…"
                className="w-full max-w-sm rounded-md border border-tesla-border bg-tesla-bg px-3 py-1.5 text-sm outline-none focus:border-tesla-accent"
              />
              {flash && (
                <span
                  className={clsx(
                    "ml-auto rounded px-2 py-1 text-xs",
                    flash.kind === "conflict"
                      ? "bg-amber-500/15 text-amber-300"
                      : flash.kind === "picked_up" || flash.kind === "merged"
                        ? "bg-emerald-500/15 text-emerald-300"
                        : "bg-tesla-border/40 text-tesla-muted",
                  )}
                >
                  {flash.text}
                </span>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-auto">
              {isLoading && <p className="p-4 text-sm text-tesla-muted">Loading…</p>}
              {!isLoading && rows.length === 0 && (
                <p className="p-4 text-sm text-tesla-muted">
                  No pins in this scope. Build instances in Design first, or pick another scope.
                </p>
              )}

              {sections.map((section) => (
                <div key={section.key}>
                  {section.title && (
                    <div className="sticky top-0 z-[2] flex items-baseline gap-2 border-b border-tesla-border bg-tesla-surface/95 px-3 py-1.5 backdrop-blur">
                      <span className="text-xs font-semibold uppercase tracking-wide text-tesla-text">
                        {section.title}
                      </span>
                      {section.subtitle && (
                        <span className="text-[11px] text-tesla-muted">{section.subtitle}</span>
                      )}
                    </div>
                  )}
                  {section.connectors.map((group) => (
                    <ConnectorGroup
                      key={group.connectorId}
                      connectorId={group.connectorId}
                      label={group.label}
                      container={group.container}
                      kindTag={group.kind}
                      slotKey={group.slotKey}
                      templateName={group.templateName}
                      rows={group.rows}
                      allPins={allPins}
                      nets={nets}
                      vehicleId={vehicleId!}
                      revisionId={revisionId!}
                      onFlash={setFlash}
                      onChanged={() => invalidateAll(qc)}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
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
        <span>All pins</span>
      </button>

      {enclosures.map((enc) => (
        <div key={enc.id} className="mt-2">
          <button
            type="button"
            className={itemCls(scope.kind === "enclosure" && scope.id === enc.id)}
            onClick={() => onPick({ kind: "enclosure", id: enc.id })}
          >
            <span className="truncate font-medium">{enc.label}</span>
            <span className="text-xs">{enc.pin_count}</span>
          </button>
          <div className="ml-3 border-l border-tesla-border/60 pl-1">
            {(nodesByParent.get(enc.label) ?? []).map((node) => (
              <button
                key={node.id}
                type="button"
                className={itemCls(scope.kind === "node" && scope.id === node.id)}
                onClick={() => onPick({ kind: "node", id: node.id })}
              >
                <span className="truncate">{node.label}</span>
                <span className="text-xs">{node.pin_count}</span>
              </button>
            ))}
          </div>
        </div>
      ))}

      {(nodesByParent.get("__loose__") ?? []).length > 0 && (
        <div className="mt-2">
          <p className="px-2 py-1 text-[11px] uppercase tracking-wide text-tesla-muted">Standalone nodes</p>
          {(nodesByParent.get("__loose__") ?? []).map((node) => (
            <button
              key={node.id}
              type="button"
              className={itemCls(scope.kind === "node" && scope.id === node.id)}
              onClick={() => onPick({ kind: "node", id: node.id })}
            >
              <span className="truncate">{node.label}</span>
              <span className="text-xs">{node.pin_count}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ConnectorGroup({
  connectorId,
  label,
  container,
  kindTag,
  slotKey,
  templateName,
  rows,
  allPins,
  nets,
  vehicleId,
  revisionId,
  onFlash,
  onChanged,
}: {
  connectorId: string;
  label: string;
  container: string | null;
  kindTag?: string | null;
  slotKey?: string | null;
  templateName?: string | null;
  rows: PinConnectionRow[];
  allPins: NetPinInfo[];
  nets: { id: string; name: string }[];
  vehicleId: string;
  revisionId: string;
  onFlash: (f: { kind: ConnectPinsResult["net_action"]; text: string }) => void;
  onChanged: () => void;
}) {
  const [showShorts, setShowShorts] = useState(false);
  const groupPins = rows.map((r) => ({ pin_id: r.pin_id, pin_number: r.pin_number, pin_name: r.pin_name }));
  const hasShorts = rows.some((r) => r.short_partner_pin_ids.length > 0);

  return (
    <div className="border-b border-tesla-border/60">
      <div className="sticky top-0 z-[1] flex items-center gap-2 bg-tesla-bg/95 px-3 py-2 backdrop-blur">
        {slotKey && (
          <span className="rounded bg-tesla-border/50 px-1.5 py-0.5 font-mono text-[11px] text-tesla-text">
            {slotKey}
          </span>
        )}
        <ConnectorInstanceLabel
          label={label}
          templateLabel={templateName}
          className="text-sm font-semibold text-tesla-text"
        />
        {kindTag && (
          <span
            className={clsx(
              "rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide",
              kindTag === "pigtail"
                ? "bg-amber-500/15 text-amber-300"
                : kindTag === "panel"
                  ? "bg-sky-500/15 text-sky-300"
                  : "bg-tesla-border/40 text-tesla-muted",
            )}
          >
            {kindTag}
          </span>
        )}
        {container && <span className="text-xs text-tesla-muted">{container}</span>}
        <button
          type="button"
          onClick={() => setShowShorts((v) => !v)}
          className={clsx(
            "ml-auto rounded border px-2 py-0.5 text-xs transition",
            showShorts || hasShorts
              ? "border-amber-500/40 text-amber-300"
              : "border-tesla-border text-tesla-muted hover:border-tesla-accent",
          )}
        >
          Shorts{hasShorts ? " ●" : ""}
        </button>
      </div>

      {showShorts && (
        <ShortsEditor
          connectorId={connectorId}
          pins={groupPins}
          vehicleId={vehicleId}
          revisionId={revisionId}
          onChanged={onChanged}
        />
      )}

      <table className="w-full table-fixed text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-tesla-muted">
            <th className="w-44 px-3 py-1 font-medium">Pin</th>
            <th className="w-56 px-3 py-1 font-medium">Net</th>
            <th className="px-3 py-1 font-medium">Destinations</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <PinRow
              key={row.pin_id}
              row={row}
              allPins={allPins}
              nets={nets}
              vehicleId={vehicleId}
              revisionId={revisionId}
              onFlash={onFlash}
              onChanged={onChanged}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PinRow({
  row,
  allPins,
  nets,
  vehicleId,
  revisionId,
  onFlash,
  onChanged,
}: {
  row: PinConnectionRow;
  allPins: NetPinInfo[];
  nets: { id: string; name: string }[];
  vehicleId: string;
  revisionId: string;
  onFlash: (f: { kind: ConnectPinsResult["net_action"]; text: string }) => void;
  onChanged: () => void;
}) {
  return (
    <tr className="border-t border-tesla-border/30 align-top hover:bg-tesla-border/10">
      <td className="px-3 py-2">
        <div className="font-mono text-xs text-tesla-muted">#{row.pin_number}</div>
        <PinNameCell row={row} vehicleId={vehicleId} revisionId={revisionId} onChanged={onChanged} />
        {row.short_partner_pin_ids.length > 0 && (
          <div className="mt-0.5 text-[11px] text-amber-300">
            shorted ×{row.short_partner_pin_ids.length}
          </div>
        )}
      </td>
      <td className="px-3 py-2">
        <NetCell
          row={row}
          nets={nets}
          vehicleId={vehicleId}
          revisionId={revisionId}
          onChanged={onChanged}
        />
      </td>
      <td className="px-3 py-2">
        <DestinationsCell
          row={row}
          allPins={allPins}
          vehicleId={vehicleId}
          revisionId={revisionId}
          onFlash={onFlash}
          onChanged={onChanged}
        />
      </td>
    </tr>
  );
}

function PinNameCell({
  row,
  vehicleId,
  revisionId,
  onChanged,
}: {
  row: PinConnectionRow;
  vehicleId: string;
  revisionId: string;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(row.pin_name);
  const isDefaultName = row.pin_name.trim() === String(row.pin_number);

  useEffect(() => {
    if (!editing) setText(row.pin_name);
  }, [row.pin_name, editing]);

  const save = useMutation({
    mutationFn: (name: string) =>
      updateConnectorPin(vehicleId, revisionId, row.connector_instance_id, row.pin_id, { name }),
    onSuccess: () => {
      setEditing(false);
      onChanged();
    },
  });

  function commit() {
    const next = text.trim();
    if (!next || next === row.pin_name) {
      setEditing(false);
      setText(row.pin_name);
      return;
    }
    save.mutate(next);
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setEditing(false);
            setText(row.pin_name);
          }
        }}
        className="w-full rounded border border-tesla-accent bg-tesla-bg px-1.5 py-0.5 text-sm outline-none"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title="Click to rename pin"
      className={clsx(
        "w-full truncate rounded px-1 py-0.5 text-left text-sm transition hover:bg-tesla-border/30",
        isDefaultName && "text-tesla-muted",
      )}
    >
      {row.pin_name}
    </button>
  );
}

function NetCell({
  row,
  nets,
  vehicleId,
  revisionId,
  onChanged,
}: {
  row: PinConnectionRow;
  nets: { id: string; name: string }[];
  vehicleId: string;
  revisionId: string;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const assign = useMutation({
    mutationFn: (name: string | null) => assignNetByName(vehicleId, revisionId, row.pin_id, name),
    onSuccess: () => {
      setOpen(false);
      setText("");
      onChanged();
    },
  });
  const rename = useMutation({
    mutationFn: (name: string) => updateNet(vehicleId, revisionId, row.primary_net_id!, { name }),
    onSuccess: () => {
      setOpen(false);
      setText("");
      onChanged();
    },
  });

  const query = text.trim().toLowerCase();
  const matches = nets.filter((n) => (query ? n.name.toLowerCase().includes(query) : true)).slice(0, 30);
  const exact = nets.some((n) => n.name.toLowerCase() === query);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          "w-full truncate rounded border px-2 py-1 text-left text-xs transition",
          row.primary_net_name
            ? row.is_auto_net
              ? "border-tesla-border bg-tesla-bg text-tesla-muted hover:border-tesla-accent"
              : "border-tesla-accent/40 bg-tesla-accent/5 text-tesla-text hover:border-tesla-accent"
            : "border-dashed border-tesla-border text-tesla-muted hover:border-tesla-accent",
        )}
        title={row.primary_net_name ?? "Assign net"}
      >
        {row.primary_net_name ?? "— assign net"}
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 rounded-md border border-tesla-border bg-tesla-surface shadow-xl">
          <div className="border-b border-tesla-border p-2">
            <input
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Search or type a net name…"
              className="w-full rounded border border-tesla-border bg-tesla-bg px-2 py-1 text-xs outline-none focus:border-tesla-accent"
              onKeyDown={(e) => {
                if (e.key === "Enter" && query && !exact) assign.mutate(text.trim());
              }}
            />
          </div>
          <ul className="max-h-48 overflow-y-auto py-1 text-xs">
            {query && !exact && (
              <li>
                <button
                  type="button"
                  onClick={() => assign.mutate(text.trim())}
                  className="w-full px-3 py-1.5 text-left text-tesla-accent hover:bg-tesla-border/40"
                >
                  + Create &amp; assign “{text.trim()}”
                </button>
              </li>
            )}
            {row.primary_net_id && query && !exact && (
              <li>
                <button
                  type="button"
                  onClick={() => rename.mutate(text.trim())}
                  className="w-full px-3 py-1.5 text-left text-tesla-muted hover:bg-tesla-border/40"
                >
                  ✎ Rename current net → “{text.trim()}”
                </button>
              </li>
            )}
            {matches.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => assign.mutate(n.name)}
                  className={clsx(
                    "w-full truncate px-3 py-1.5 text-left hover:bg-tesla-border/40",
                    n.id === row.primary_net_id && "bg-tesla-accent/10 text-tesla-text",
                  )}
                >
                  {n.name}
                </button>
              </li>
            ))}
            {row.primary_net_id && (
              <li className="border-t border-tesla-border/50">
                <button
                  type="button"
                  onClick={() => assign.mutate(null)}
                  className="w-full px-3 py-1.5 text-left text-tesla-muted hover:bg-tesla-border/40"
                >
                  Unassign net
                </button>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}


function WireDestinationChip({
  dest,
  vehicleId,
  revisionId,
  onChanged,
  onRemove,
}: {
  dest: ConnectionDestination;
  vehicleId: string;
  revisionId: string;
  onChanged: () => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [gaugeText, setGaugeText] = useState("");
  const [colorText, setColorText] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setGaugeText(dest.gauge_awg ?? "");
      setColorText(dest.wire_color ?? "");
    }
  }, [open, dest.gauge_awg, dest.wire_color]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const save = useMutation({
    mutationFn: () => {
      const body: { gauge_awg?: number | null; wire_color?: string | null } = {};
      const gaugeTrim = gaugeText.trim();
      const newGauge = gaugeTrim ? Number(gaugeTrim) : null;
      if (newGauge !== null && Number.isNaN(newGauge)) {
        return Promise.resolve(null);
      }
      const currentGauge = dest.gauge_awg ? Number(dest.gauge_awg) : null;
      if (newGauge !== currentGauge) body.gauge_awg = newGauge;
      const newColor = colorText.trim() || null;
      if (newColor !== dest.wire_color) body.wire_color = newColor;
      if (Object.keys(body).length === 0) return Promise.resolve(null);
      return updateEdge(vehicleId, revisionId, dest.edge_id, body);
    },
    onSuccess: () => {
      setOpen(false);
      onChanged();
    },
  });

  const hasColorOverride = dest.wire_color !== null;
  const displayColor = dest.effective_wire_color;
  const pathLabel =
    dest.other_path_label || `${dest.other_connector_label} / #${dest.other_pin_number}`;

  return (
    <div ref={ref} className="relative inline-flex max-w-full items-center gap-0.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex max-w-full items-center gap-1 rounded border border-tesla-border bg-tesla-bg px-2 py-0.5 text-xs transition hover:border-tesla-accent"
        title={`${pathLabel} · ${dest.gauge_label}${displayColor ? ` · ${displayColor}` : ""}`}
      >
        <span className="truncate">{pathLabel}</span>
        <span className="shrink-0 text-tesla-muted">· {dest.gauge_label}</span>
        {displayColor && (
          <span className="shrink-0">
            <WireColorSwatch
              label={displayColor}
              className={clsx(!hasColorOverride && "opacity-80")}
            />
            {!hasColorOverride && (
              <span className="ml-0.5 text-[10px] italic text-tesla-muted">(net)</span>
            )}
          </span>
        )}
      </button>
      <button
        type="button"
        className="shrink-0 rounded px-0.5 text-tesla-muted hover:text-tesla-accent"
        onClick={onRemove}
      >
        ×
      </button>

      {open && (
        <div className="absolute left-0 top-full z-40 mt-1 w-64 rounded-md border border-tesla-border bg-tesla-surface p-3 shadow-xl">
          <p className="mb-2 truncate text-xs font-medium">{pathLabel}</p>
          <label className="mb-0.5 block text-[11px] uppercase tracking-wide text-tesla-muted">
            Gauge (AWG)
          </label>
          <input
            value={gaugeText}
            onChange={(e) => setGaugeText(e.target.value)}
            placeholder={dest.gauge_label}
            className="mb-1 w-full rounded border border-tesla-border bg-tesla-bg px-2 py-1 text-sm outline-none focus:border-tesla-accent"
          />
          <p className="mb-2 text-[10px] text-tesla-muted">
            Empty = no gauge on this wire. Display falls back to connector template when unset.
          </p>
          <label className="mb-0.5 block text-[11px] uppercase tracking-wide text-tesla-muted">
            Wire color
          </label>
          <input
            value={colorText}
            onChange={(e) => setColorText(e.target.value)}
            placeholder={dest.net_default_wire_color ?? "No net default"}
            className="mb-1 w-full rounded border border-tesla-border bg-tesla-bg px-2 py-1 text-sm outline-none focus:border-tesla-accent"
          />
          <div className="mb-2 flex flex-wrap gap-1">
            {WIRE_COLOR_PRESETS.map((c) => (
              <WireColorPresetButton key={c} code={c} onClick={() => setColorText(c)} />
            ))}
          </div>
          {dest.net_default_wire_color && (
            <button
              type="button"
              onClick={() => setColorText("")}
              className="mb-2 flex items-center gap-1.5 text-[11px] text-tesla-muted hover:text-tesla-text"
            >
              Use net default
              <WireColorSwatch label={dest.net_default_wire_color} />
            </button>
          )}
          <button
            type="button"
            disabled={save.isPending}
            onClick={() => save.mutate()}
            className="w-full rounded border border-tesla-border px-2 py-1 text-xs transition hover:border-tesla-accent disabled:opacity-40"
          >
            {save.isPending ? "Saving…" : "Save wire"}
          </button>
        </div>
      )}
    </div>
  );
}

function DestinationsCell({
  row,
  allPins,
  vehicleId,
  revisionId,
  onFlash,
  onChanged,
}: {
  row: PinConnectionRow;
  allPins: NetPinInfo[];
  vehicleId: string;
  revisionId: string;
  onFlash: (f: { kind: ConnectPinsResult["net_action"]; text: string }) => void;
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [connId, setConnId] = useState("");
  const [conflict, setConflict] = useState<{
    pinBId: string;
    a: { id: string; name: string };
    b: { id: string; name: string };
  } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!adding) return;
    function onDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) {
        setAdding(false);
        setConnId("");
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [adding]);

  const connectors = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of allPins) {
      if (p.connector_instance_id === row.connector_instance_id) continue;
      if (!m.has(p.connector_instance_id)) m.set(p.connector_instance_id, p.connector_label);
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [allPins, row.connector_instance_id]);

  const targetPins = useMemo(
    () => allPins.filter((p) => p.connector_instance_id === connId),
    [allPins, connId],
  );
  const existingTargets = new Set(row.destinations.map((d) => d.other_pin_id));

  const connect = useMutation({
    mutationFn: (v: { pinBId: string; mergeTargetNetId?: string }) =>
      connectPins(vehicleId, revisionId, {
        pin_a_id: row.pin_id,
        pin_b_id: v.pinBId,
        merge_target_net_id: v.mergeTargetNetId,
      }),
    onSuccess: (res, v) => {
      onFlash({ kind: res.net_action, text: res.message });
      if (
        res.net_action === "conflict" &&
        res.conflict_net_a_id &&
        res.conflict_net_b_id
      ) {
        setConflict({
          pinBId: v.pinBId,
          a: { id: res.conflict_net_a_id, name: res.conflict_net_a_name ?? "Net A" },
          b: { id: res.conflict_net_b_id, name: res.conflict_net_b_name ?? "Net B" },
        });
      } else {
        setConflict(null);
        setAdding(false);
        setConnId("");
      }
      onChanged();
    },
  });
  const remove = useMutation({
    mutationFn: (edgeId: string) => disconnectEdge(vehicleId, revisionId, edgeId),
    onSuccess: onChanged,
  });

  return (
    <div ref={ref} className="relative flex flex-wrap items-center gap-1.5">
      {row.destinations.map((d) => (
        <WireDestinationChip
          key={d.edge_id}
          dest={d}
          vehicleId={vehicleId}
          revisionId={revisionId}
          onChanged={onChanged}
          onRemove={() => remove.mutate(d.edge_id)}
        />
      ))}

      <button
        type="button"
        onClick={() => setAdding((v) => !v)}
        className="rounded border border-dashed border-tesla-border px-2 py-0.5 text-xs text-tesla-muted transition hover:border-tesla-accent hover:text-tesla-text"
      >
        + destination
      </button>

      {adding && (
        <div className="absolute left-0 top-full z-30 mt-1 w-80 rounded-md border border-tesla-border bg-tesla-surface p-2 shadow-xl">
          <p className="mb-1 text-[11px] uppercase tracking-wide text-tesla-muted">Target connector</p>
          <select
            value={connId}
            onChange={(e) => setConnId(e.target.value)}
            className="mb-2 w-full rounded border border-tesla-border bg-tesla-bg px-2 py-1 text-sm outline-none focus:border-tesla-accent"
          >
            <option value="">Select connector…</option>
            {connectors.map(([id, lbl]) => (
              <option key={id} value={id}>
                {lbl}
              </option>
            ))}
          </select>
          {connId && (
            <>
              <p className="mb-1 text-[11px] uppercase tracking-wide text-tesla-muted">Target pin</p>
              <ul className="max-h-48 overflow-y-auto">
                {targetPins.map((p) => {
                  const already = existingTargets.has(p.pin_id);
                  return (
                    <li key={p.pin_id}>
                      <button
                        type="button"
                        disabled={already || connect.isPending}
                        onClick={() => connect.mutate({ pinBId: p.pin_id })}
                        className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-sm transition hover:bg-tesla-border/40 disabled:opacity-40"
                      >
                        <span>
                          #{p.pin_number} {p.pin_name}
                        </span>
                        <span className="text-xs text-tesla-muted">
                          {already ? "linked" : (p.primary_net_name ?? "")}
                        </span>
                      </button>
                    </li>
                  );
                })}
                {targetPins.length === 0 && (
                  <li className="px-2 py-1 text-xs text-tesla-muted">No pins</li>
                )}
              </ul>
            </>
          )}
        </div>
      )}

      {conflict && (
        <div className="absolute left-0 top-full z-40 mt-1 w-80 rounded-md border border-amber-500/40 bg-tesla-surface p-3 shadow-xl">
          <p className="mb-1 text-xs font-medium text-amber-300">Both pins are on named nets</p>
          <p className="mb-2 text-[11px] text-tesla-muted">
            Wire created. Pick which net to keep — the other net&apos;s pins move onto it.
          </p>
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              disabled={connect.isPending}
              onClick={() => connect.mutate({ pinBId: conflict.pinBId, mergeTargetNetId: conflict.a.id })}
              className="truncate rounded border border-tesla-border px-2 py-1 text-left text-xs transition hover:border-tesla-accent disabled:opacity-40"
            >
              Keep <span className="text-tesla-text">{conflict.a.name}</span>
            </button>
            <button
              type="button"
              disabled={connect.isPending}
              onClick={() => connect.mutate({ pinBId: conflict.pinBId, mergeTargetNetId: conflict.b.id })}
              className="truncate rounded border border-tesla-border px-2 py-1 text-left text-xs transition hover:border-tesla-accent disabled:opacity-40"
            >
              Keep <span className="text-tesla-text">{conflict.b.name}</span>
            </button>
            <button
              type="button"
              onClick={() => setConflict(null)}
              className="mt-0.5 text-left text-[11px] text-tesla-muted hover:text-tesla-text"
            >
              Leave both nets as-is
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ShortsEditor({
  connectorId,
  pins,
  vehicleId,
  revisionId,
  onChanged,
}: {
  connectorId: string;
  pins: { pin_id: string; pin_number: number; pin_name: string }[];
  vehicleId: string;
  revisionId: string;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const [pinA, setPinA] = useState("");
  const [pinB, setPinB] = useState("");

  const { data: shorts = [] } = useQuery({
    queryKey: ["shorts", vehicleId, revisionId, connectorId],
    queryFn: () => fetchPinShorts(vehicleId, revisionId, connectorId),
    enabled: Boolean(vehicleId && revisionId && connectorId),
  });

  const pinLabel = (id: string) => {
    const p = pins.find((x) => x.pin_id === id);
    return p ? `#${p.pin_number} ${p.pin_name}` : "?";
  };

  const add = useMutation({
    mutationFn: () => createPinShort(vehicleId, revisionId, connectorId, pinA, pinB),
    onSuccess: () => {
      setPinA("");
      setPinB("");
      qc.invalidateQueries({ queryKey: ["shorts"] });
      onChanged();
    },
  });
  const del = useMutation({
    mutationFn: (id: string) => deletePinShort(vehicleId, revisionId, connectorId, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shorts"] });
      onChanged();
    },
  });

  return (
    <div className="border-y border-amber-500/20 bg-amber-500/5 px-3 py-2">
      <p className="mb-2 text-[11px] uppercase tracking-wide text-amber-300/80">
        Internal pin shorts (continuity, no harness wire)
      </p>
      {shorts.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {(shorts as PinShort[]).map((s) => (
            <span
              key={s.id}
              className="inline-flex items-center gap-1 rounded border border-amber-500/30 bg-tesla-bg px-2 py-0.5 text-xs"
            >
              {pinLabel(s.pin_a_id)} ↔ {pinLabel(s.pin_b_id)}
              <button
                type="button"
                className="text-tesla-muted hover:text-tesla-accent"
                onClick={() => del.mutate(s.id)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2 text-sm">
        <select
          value={pinA}
          onChange={(e) => setPinA(e.target.value)}
          className="rounded border border-tesla-border bg-tesla-bg px-2 py-1 text-xs"
        >
          <option value="">Pin A…</option>
          {pins.map((p) => (
            <option key={p.pin_id} value={p.pin_id}>
              #{p.pin_number} {p.pin_name}
            </option>
          ))}
        </select>
        <span className="text-tesla-muted">↔</span>
        <select
          value={pinB}
          onChange={(e) => setPinB(e.target.value)}
          className="rounded border border-tesla-border bg-tesla-bg px-2 py-1 text-xs"
        >
          <option value="">Pin B…</option>
          {pins.map((p) => (
            <option key={p.pin_id} value={p.pin_id}>
              #{p.pin_number} {p.pin_name}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!pinA || !pinB || pinA === pinB || add.isPending}
          onClick={() => add.mutate()}
          className="rounded bg-amber-500/80 px-2 py-1 text-xs text-black transition hover:bg-amber-400 disabled:opacity-40"
        >
          Short
        </button>
      </div>
    </div>
  );
}
