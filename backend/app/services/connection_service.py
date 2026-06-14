from dataclasses import dataclass
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import String, cast, exists, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.display import (
    resolve_connector_labels,
    resolve_connector_with_slot,
    resolve_display_name,
)
from app.core.revision_guard import ensure_mutable_revision
from app.domains.connectors.export import connector_kind_for_instance
from app.domains.topology.net_merge import absorb_net, get_primary_net, resolve_net_merge
from app.domains.topology.net_naming import is_auto_named_signal
from app.domains.topology.pin_shorts import load_short_indexes_for_connectors
from app.domains.topology.wire_defaults import (
    default_gauge_for_pin_pair,
    effective_wire_color,
    format_gauge_label,
    pin_template_gauges_for_revision,
    resolve_pair_gauge,
)
from app.infra.db.enums import SignalKind
from app.infra.db.models.catalog import ConnectorTemplate
from app.infra.db.models.instances import (
    ConnectorInstance,
    EnclosureInstance,
    PcbInstance,
    Pin,
)
from app.infra.db.models.shorts import ConnectorInstancePinShort
from app.infra.db.models.templates import (
    EnclosureTemplate,
    EnclosureTemplatePanelSlot,
    PcbTemplate,
    PcbTemplateConnectorSlot,
)
from app.infra.db.models.topology import ConnectionEdge, PinSignalAssignment, Signal
from app.schemas.connections import (
    AssignNetByNameRequest,
    ConnectionDestination,
    ConnectionScopeItem,
    ConnectPinsRequest,
    ConnectPinsResult,
    PinConnectionRow,
)
from app.schemas.topology import ConnectionEdgeCreate
from app.services.revision_sync_service import DOMAINS_WIRING, RevisionSyncService
from app.services.net_service import NetService
from app.services.topology_service import TopologyService


@dataclass
class _ConnectorCtx:
    label: str
    connector_kind: str | None
    container_kind: str
    container_label: str | None
    enclosure_id: UUID | None
    enclosure_label: str | None
    node_id: UUID | None
    node_label: str | None
    slot_key: str | None = None
    # Template names shown as muted secondary context when a nickname is in use.
    connector_template_name: str | None = None
    node_template_name: str | None = None
    enclosure_template_name: str | None = None


class ConnectionService:
    """Spreadsheet-style harnessing: per-pin destinations + smart net pickup."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self._net = NetService(db)
        self._topology = TopologyService(db)

    async def _sync(
        self,
        vehicle_id: UUID,
        revision_id: UUID,
        *,
        changed_by: str | None = None,
    ) -> None:
        await RevisionSyncService(self.db).bump_and_notify(
            vehicle_id=vehicle_id,
            revision_id=revision_id,
            domains=DOMAINS_WIRING,
            changed_by=changed_by,
        )

    # ----------------------------------------------------------------- context

    async def _connector_context(self, revision_id: UUID) -> dict[UUID, _ConnectorCtx]:
        node_rows = (
            await self.db.execute(
                select(PcbInstance, PcbTemplate)
                .join(PcbTemplate, PcbInstance.pcb_template_id == PcbTemplate.id)
                .where(PcbInstance.revision_id == revision_id)
            )
        ).all()
        node_label: dict[UUID, str] = {}
        node_template: dict[UUID, str | None] = {}
        node_enclosure: dict[UUID, UUID | None] = {}
        for node, tmpl in node_rows:
            primary, subtitle = resolve_connector_labels(
                template_name=tmpl.name, nickname=node.nickname, use_template_name=node.use_template_name
            )
            node_label[node.id] = primary
            node_template[node.id] = subtitle
            node_enclosure[node.id] = node.enclosure_instance_id

        enc_rows = (
            await self.db.execute(
                select(EnclosureInstance, EnclosureTemplate)
                .join(EnclosureTemplate, EnclosureInstance.enclosure_template_id == EnclosureTemplate.id)
                .where(EnclosureInstance.revision_id == revision_id)
            )
        ).all()
        enc_label: dict[UUID, str] = {}
        enc_template: dict[UUID, str | None] = {}
        for enc, tmpl in enc_rows:
            primary, subtitle = resolve_connector_labels(
                template_name=tmpl.name, nickname=enc.nickname, use_template_name=enc.use_template_name
            )
            enc_label[enc.id] = primary
            enc_template[enc.id] = subtitle

        pcb_slots: dict[UUID, tuple[str, str | None]] = {
            row[0]: (row[1], row[2])
            for row in (
                await self.db.execute(
                    select(
                        PcbTemplateConnectorSlot.id,
                        PcbTemplateConnectorSlot.slot_key,
                        PcbTemplateConnectorSlot.nickname,
                    ).where(
                        PcbTemplateConnectorSlot.pcb_template_id.in_(
                            select(PcbInstance.pcb_template_id).where(
                                PcbInstance.revision_id == revision_id
                            )
                        )
                    )
                )
            ).all()
        }
        panel_slot_keys: dict[UUID, str] = dict(
            (
                await self.db.execute(
                    select(EnclosureTemplatePanelSlot.id, EnclosureTemplatePanelSlot.slot_key).where(
                        EnclosureTemplatePanelSlot.enclosure_template_id.in_(
                            select(EnclosureInstance.enclosure_template_id).where(
                                EnclosureInstance.revision_id == revision_id
                            )
                        )
                    )
                )
            ).all()
        )

        conn_rows = (
            await self.db.execute(
                select(ConnectorInstance, ConnectorTemplate)
                .join(ConnectorTemplate, ConnectorInstance.connector_template_id == ConnectorTemplate.id)
                .where(ConnectorInstance.revision_id == revision_id)
            )
        ).all()
        ctx: dict[UUID, _ConnectorCtx] = {}
        for conn, tmpl in conn_rows:
            slot_key: str | None = None
            slot_nickname: str | None = None
            for slot_id in (
                conn.pcb_template_slot_id,
                conn.enclosure_panel_slot_id,
                conn.source_pcb_template_slot_id,
            ):
                if slot_id and slot_id in pcb_slots:
                    slot_key, slot_nickname = pcb_slots[slot_id]
                    break
                if slot_id and slot_id in panel_slot_keys:
                    slot_key = panel_slot_keys[slot_id]
                    break
            label, conn_template, _ = resolve_connector_with_slot(
                template_name=tmpl.name,
                instance_nickname=conn.nickname,
                use_template_name=conn.use_template_name,
                slot_key=slot_key,
                slot_nickname=slot_nickname,
            )
            connector_kind = connector_kind_for_instance(conn, tmpl)
            if conn.pcb_instance_id and conn.pcb_instance_id in node_label:
                node_id = conn.pcb_instance_id
                enc_id = node_enclosure.get(node_id)
                container = node_label[node_id]
                if enc_id and enc_id in enc_label:
                    container = f"{enc_label[enc_id]} / {container}"
                ctx[conn.id] = _ConnectorCtx(
                    label=label,
                    connector_kind=connector_kind,
                    container_kind="node",
                    container_label=container,
                    enclosure_id=enc_id,
                    enclosure_label=enc_label.get(enc_id) if enc_id else None,
                    node_id=node_id,
                    node_label=node_label[node_id],
                    slot_key=slot_key,
                    connector_template_name=conn_template,
                    node_template_name=node_template.get(node_id),
                    enclosure_template_name=enc_template.get(enc_id) if enc_id else None,
                )
            elif conn.enclosure_instance_id and conn.enclosure_instance_id in enc_label:
                enc_id = conn.enclosure_instance_id
                ctx[conn.id] = _ConnectorCtx(
                    label=label,
                    connector_kind=connector_kind,
                    container_kind="enclosure",
                    container_label=f"{enc_label[enc_id]} / Panel",
                    enclosure_id=enc_id,
                    enclosure_label=enc_label[enc_id],
                    node_id=None,
                    node_label=None,
                    slot_key=slot_key,
                    connector_template_name=conn_template,
                    enclosure_template_name=enc_template.get(enc_id),
                )
            else:
                ctx[conn.id] = _ConnectorCtx(
                    label=label,
                    connector_kind=connector_kind,
                    container_kind="inline",
                    container_label="Inline connectors",
                    enclosure_id=None,
                    enclosure_label=None,
                    node_id=None,
                    node_label=None,
                    slot_key=slot_key,
                    connector_template_name=conn_template,
                )
        return ctx

    @staticmethod
    def _path_label(cctx: "_ConnectorCtx | None", pin: Pin) -> str:
        """enclosure / board / connector (or slot #) / pin name (or #pin)."""
        pin_seg = pin.name if pin.name and pin.name.strip() != str(pin.pin_number) else f"#{pin.pin_number}"
        if cctx is None:
            return pin_seg
        name = cctx.label or cctx.slot_key or "connector"
        if cctx.slot_key and cctx.slot_key != name:
            connector_seg = f"{cctx.slot_key} {name}"
        else:
            connector_seg = name
        parts = [
            cctx.enclosure_label,
            cctx.node_label,
            connector_seg,
            pin_seg,
        ]
        return " / ".join(p for p in parts if p)

    def _scope_connector_ids(
        self,
        ctx: dict[UUID, _ConnectorCtx],
        *,
        connector_instance_id: UUID | None,
        pcb_instance_id: UUID | None,
        enclosure_instance_id: UUID | None,
        vehicle_level: bool = False,
    ) -> set[UUID] | None:
        if connector_instance_id:
            return {connector_instance_id}
        if pcb_instance_id:
            return {cid for cid, c in ctx.items() if c.node_id == pcb_instance_id}
        if enclosure_instance_id:
            return {cid for cid, c in ctx.items() if c.enclosure_id == enclosure_instance_id}
        if vehicle_level:
            # Vehicle-level harnessing surface: enclosure-facing connectors
            # (panel mounts + pigtails) plus connectors on standalone nodes.
            # Internal node connectors inside enclosures are excluded so vehicle
            # and enclosure harnessing stay separate.
            return {
                cid
                for cid, c in ctx.items()
                if c.connector_kind in ("panel", "pigtail")
                or (c.node_id is not None and c.enclosure_id is None)
            }
        return None  # all

    @staticmethod
    def _build_scoped_pin_stmt(
        revision_id: UUID,
        *,
        scope_ids: set[UUID] | None,
        search: str | None,
    ):
        pin_stmt = select(Pin).where(Pin.revision_id == revision_id)
        if scope_ids is not None:
            if not scope_ids:
                return None
            pin_stmt = pin_stmt.where(Pin.connector_instance_id.in_(scope_ids))

        query = (search or "").strip()
        if query:
            pattern = f"%{query}%"
            has_primary_signal_match = exists(
                select(PinSignalAssignment.id)
                .join(Signal, PinSignalAssignment.signal_id == Signal.id)
                .where(
                    PinSignalAssignment.revision_id == revision_id,
                    PinSignalAssignment.pin_id == Pin.id,
                    PinSignalAssignment.assignment_role == "primary",
                    Signal.name.ilike(pattern),
                )
            )
            pin_stmt = pin_stmt.where(
                or_(
                    Pin.name.ilike(pattern),
                    cast(Pin.pin_number, String).ilike(pattern),
                    has_primary_signal_match,
                )
            )
        return pin_stmt

    async def count_table_rows(
        self,
        revision_id: UUID,
        *,
        connector_instance_id: UUID | None = None,
        pcb_instance_id: UUID | None = None,
        enclosure_instance_id: UUID | None = None,
        vehicle_level: bool = False,
        search: str | None = None,
    ) -> int:
        ctx = await self._connector_context(revision_id)
        scope_ids = self._scope_connector_ids(
            ctx,
            connector_instance_id=connector_instance_id,
            pcb_instance_id=pcb_instance_id,
            enclosure_instance_id=enclosure_instance_id,
            vehicle_level=vehicle_level,
        )
        pin_stmt = self._build_scoped_pin_stmt(
            revision_id,
            scope_ids=scope_ids,
            search=search,
        )
        if pin_stmt is None:
            return 0
        count_stmt = select(func.count()).select_from(pin_stmt.order_by(None).subquery())
        total = (await self.db.execute(count_stmt)).scalar_one()
        return int(total)

    # ------------------------------------------------------------------- table

    async def build_table(
        self,
        revision_id: UUID,
        *,
        connector_instance_id: UUID | None = None,
        pcb_instance_id: UUID | None = None,
        enclosure_instance_id: UUID | None = None,
        vehicle_level: bool = False,
        search: str | None = None,
        limit: int | None = None,
        offset: int = 0,
    ) -> list[PinConnectionRow]:
        ctx = await self._connector_context(revision_id)
        scope_ids = self._scope_connector_ids(
            ctx,
            connector_instance_id=connector_instance_id,
            pcb_instance_id=pcb_instance_id,
            enclosure_instance_id=enclosure_instance_id,
            vehicle_level=vehicle_level,
        )

        pin_stmt = self._build_scoped_pin_stmt(
            revision_id,
            scope_ids=scope_ids,
            search=search,
        )
        if pin_stmt is None:
            return []
        pin_stmt = pin_stmt.order_by(Pin.connector_instance_id, Pin.pin_number, Pin.id)
        if offset > 0:
            pin_stmt = pin_stmt.offset(offset)
        if limit is not None:
            pin_stmt = pin_stmt.limit(limit)

        scoped_pin_rows = (await self.db.execute(pin_stmt)).scalars().all()
        if not scoped_pin_rows:
            return []

        scoped_pin_ids = [pin.id for pin in scoped_pin_rows]

        signal_defaults = {
            sid: color
            for sid, color in (
                await self.db.execute(
                    select(Signal.id, Signal.default_wire_color).where(
                        Signal.revision_id == revision_id
                    )
                )
            ).all()
        }
        pin_template_gauges = await pin_template_gauges_for_revision(self.db, revision_id)

        # Only load edges touching pins in the current result set.
        edges = (
            await self.db.execute(
                select(ConnectionEdge).where(
                    ConnectionEdge.revision_id == revision_id,
                    or_(
                        ConnectionEdge.pin_a_id.in_(scoped_pin_ids),
                        ConnectionEdge.pin_b_id.in_(scoped_pin_ids),
                    ),
                )
            )
        ).scalars().all()

        related_pin_ids: set[UUID] = set(scoped_pin_ids)
        for edge in edges:
            related_pin_ids.add(edge.pin_a_id)
            related_pin_ids.add(edge.pin_b_id)

        pin_rows = (
            await self.db.execute(
                select(Pin).where(Pin.id.in_(related_pin_ids)).order_by(Pin.pin_number)
            )
        ).scalars().all()
        pin_by_id: dict[UUID, Pin] = {p.id: p for p in pin_rows}

        net_by_pin = await self._net_by_pin(revision_id, list(related_pin_ids))

        edges_by_pin: dict[UUID, list[ConnectionEdge]] = {}
        for e in edges:
            edges_by_pin.setdefault(e.pin_a_id, []).append(e)
            edges_by_pin.setdefault(e.pin_b_id, []).append(e)

        # Shorts per connector for partner lookup.
        short_partners = await self._short_partners(revision_id, scope_ids, ctx)

        def _net_default_for_edge(edge: ConnectionEdge, this_pin_id: UUID) -> str | None:
            net_id = edge.signal_id
            if net_id is None:
                pin_net = net_by_pin.get(this_pin_id)
                net_id = pin_net[0] if pin_net else None
            return signal_defaults.get(net_id) if net_id else None

        def dest_for(edge: ConnectionEdge, this_pin_id: UUID) -> ConnectionDestination | None:
            other_id = edge.pin_b_id if edge.pin_a_id == this_pin_id else edge.pin_a_id
            other = pin_by_id.get(other_id)
            if other is None:
                return None
            octx = ctx.get(other.connector_instance_id)
            template_gauge = resolve_pair_gauge(
                pin_template_gauges.get(edge.pin_a_id),
                pin_template_gauges.get(edge.pin_b_id),
            )
            display_gauge = edge.gauge_awg if edge.gauge_awg is not None else template_gauge
            net_default = _net_default_for_edge(edge, this_pin_id)
            return ConnectionDestination(
                edge_id=edge.id,
                other_pin_id=other.id,
                other_pin_number=other.pin_number,
                other_pin_name=other.name,
                other_connector_instance_id=other.connector_instance_id,
                other_connector_label=octx.label if octx else "?",
                other_container_label=octx.container_label if octx else None,
                other_node_label=octx.node_label if octx else None,
                other_enclosure_label=octx.enclosure_label if octx else None,
                other_connector_kind=octx.connector_kind if octx else None,
                other_slot_key=octx.slot_key if octx else None,
                other_path_label=self._path_label(octx, other),


                wire_color=edge.wire_color,
                effective_wire_color=effective_wire_color(edge.wire_color, net_default),
                net_default_wire_color=net_default,
                gauge_awg=edge.gauge_awg,
                gauge_label=format_gauge_label(display_gauge),
            )

        rows: list[PinConnectionRow] = []
        for pin in scoped_pin_rows:
            cctx = ctx.get(pin.connector_instance_id)
            net = net_by_pin.get(pin.id)
            destinations = [
                d
                for d in (dest_for(e, pin.id) for e in edges_by_pin.get(pin.id, []))
                if d is not None
            ]
            destinations.sort(key=lambda d: (d.other_container_label or "", d.other_connector_label, d.other_pin_number))
            rows.append(
                PinConnectionRow(
                    pin_id=pin.id,
                    pin_number=pin.pin_number,
                    pin_name=pin.name,
                    connector_instance_id=pin.connector_instance_id,
                    connector_label=cctx.label if cctx else "?",
                    connector_kind=cctx.connector_kind if cctx else None,
                    slot_key=cctx.slot_key if cctx else None,
                    connector_template_name=cctx.connector_template_name if cctx else None,
                    node_template_name=cctx.node_template_name if cctx else None,
                    enclosure_template_name=cctx.enclosure_template_name if cctx else None,
                    container_label=cctx.container_label if cctx else None,
                    container_kind=cctx.container_kind if cctx else None,
                    node_label=cctx.node_label if cctx else None,
                    enclosure_label=cctx.enclosure_label if cctx else None,
                    primary_net_id=net[0] if net else None,
                    primary_net_name=net[1] if net else None,
                    is_auto_net=is_auto_named_signal(net[2], net[1]) if net else False,
                    destinations=destinations,
                    short_partner_pin_ids=sorted(short_partners.get(pin.id, set()), key=str),
                )
            )

        return rows

    async def list_scopes(self, revision_id: UUID) -> list[ConnectionScopeItem]:
        ctx = await self._connector_context(revision_id)
        pin_counts = dict(
            (
                await self.db.execute(
                    select(Pin.connector_instance_id, func.count())
                    .where(Pin.revision_id == revision_id)
                    .group_by(Pin.connector_instance_id)
                )
            ).all()
        )

        enc_rows = (
            await self.db.execute(
                select(EnclosureInstance, EnclosureTemplate)
                .join(EnclosureTemplate, EnclosureInstance.enclosure_template_id == EnclosureTemplate.id)
                .where(EnclosureInstance.revision_id == revision_id)
            )
        ).all()
        enc_label = {
            enc.id: resolve_display_name(
                template_name=tmpl.name, nickname=enc.nickname, use_template_name=enc.use_template_name
            )
            for enc, tmpl in enc_rows
        }
        node_rows = (
            await self.db.execute(
                select(PcbInstance, PcbTemplate)
                .join(PcbTemplate, PcbInstance.pcb_template_id == PcbTemplate.id)
                .where(PcbInstance.revision_id == revision_id)
            )
        ).all()

        def conn_stats(predicate) -> tuple[int, int]:
            pins = sum(pin_counts.get(cid, 0) for cid, c in ctx.items() if predicate(c))
            conns = sum(1 for c in ctx.values() if predicate(c))
            return pins, conns

        scopes: list[ConnectionScopeItem] = []
        for enc, tmpl in enc_rows:
            pins, conns = conn_stats(lambda c, eid=enc.id: c.enclosure_id == eid)
            scopes.append(
                ConnectionScopeItem(
                    id=enc.id,
                    kind="enclosure",
                    label=enc_label[enc.id],
                    parent_label=None,
                    pin_count=pins,
                    connector_count=conns,
                )
            )
        for node, tmpl in node_rows:
            label = resolve_display_name(
                template_name=tmpl.name, nickname=node.nickname, use_template_name=node.use_template_name
            )
            pins, conns = conn_stats(lambda c, nid=node.id: c.node_id == nid)
            scopes.append(
                ConnectionScopeItem(
                    id=node.id,
                    kind="node",
                    label=label,
                    parent_label=enc_label.get(node.enclosure_instance_id),
                    pin_count=pins,
                    connector_count=conns,
                )
            )
        return scopes

    # ------------------------------------------------------------------ mutate

    async def connect_pins(
        self,
        vehicle_id: UUID,
        revision_id: UUID,
        payload: ConnectPinsRequest,
        *,
        changed_by: str | None = None,
    ) -> ConnectPinsResult:
        await ensure_mutable_revision(self.db, revision_id, vehicle_id)
        await RevisionSyncService(self.db).check_expected_sequence(
            revision_id, payload.expected_edit_sequence, vehicle_id
        )
        if payload.pin_a_id == payload.pin_b_id:
            raise HTTPException(status_code=400, detail="Cannot connect a pin to itself")

        pin_ids = sorted((payload.pin_a_id, payload.pin_b_id), key=str)
        # Pessimistically lock the pins to prevent concurrent wiring race conditions
        pins = (
            await self.db.execute(
                select(Pin)
                .where(Pin.id.in_(pin_ids))
                .with_for_update()
            )
        ).scalars().all()

        if len(pins) != 2 or any(p.revision_id != revision_id for p in pins):
            raise HTTPException(status_code=404, detail="One or both pins not found")

        existing = (
            await self.db.execute(
                select(ConnectionEdge).where(
                    ConnectionEdge.revision_id == revision_id,
                    or_(
                        (ConnectionEdge.pin_a_id == payload.pin_a_id)
                        & (ConnectionEdge.pin_b_id == payload.pin_b_id),
                        (ConnectionEdge.pin_a_id == payload.pin_b_id)
                        & (ConnectionEdge.pin_b_id == payload.pin_a_id),
                    ),
                )
            )
        ).scalar_one_or_none()

        if existing:
            edge = existing
            created_edge = False
            if payload.wire_color is not None:
                edge.wire_color = payload.wire_color
            if payload.gauge_awg is not None:
                edge.gauge_awg = payload.gauge_awg
            await self.db.flush()
        else:
            gauge_awg = payload.gauge_awg
            if gauge_awg is None:
                gauge_awg = await default_gauge_for_pin_pair(
                    self.db, payload.pin_a_id, payload.pin_b_id
                )
            created = await self._topology.create_edge(
                vehicle_id,
                revision_id,
                ConnectionEdgeCreate(
                    pin_a_id=payload.pin_a_id,
                    pin_b_id=payload.pin_b_id,
                    wire_color=payload.wire_color,
                    gauge_awg=gauge_awg,
                ),
                sync=False,
            )
            edge = await self.db.get(ConnectionEdge, created.id)
            created_edge = True

        net_a = await get_primary_net(self.db, revision_id, payload.pin_a_id)
        net_b = await get_primary_net(self.db, revision_id, payload.pin_b_id)

        action = "none"
        result_net: Signal | None = None
        conflict: tuple[Signal, Signal] | None = None
        message = "Wire created. Neither pin has a net yet — name one to group the bus."

        if net_a and net_b:
            if net_a.id == net_b.id:
                action, result_net = "already_same", net_a
                message = f"Wire created on net {net_a.name}."
            else:
                target, loser = resolve_net_merge(net_a, net_b, payload.merge_target_net_id)
                if target is None:
                    # Both pins are on different user-named nets: leave them
                    # untouched and ask the caller to pick which name survives.
                    action = "conflict"
                    conflict = (net_a, net_b)
                    message = (
                        f"Wire created, but {net_a.name} and {net_b.name} are both named "
                        "nets. Pick which net to keep."
                    )
                else:
                    await absorb_net(self.db, revision_id, loser.id, target.id)
                    action, result_net = "merged", target
                    message = f"Wire created — merged onto net {target.name}."
        elif net_a and not net_b:
            await self._net.assign_pin_to_net(
                vehicle_id, revision_id, net_a.id, payload.pin_b_id, sync=False
            )
            action, result_net = "picked_up", net_a
            message = f"Picked up net {net_a.name} for the destination pin."
        elif net_b and not net_a:
            await self._net.assign_pin_to_net(
                vehicle_id, revision_id, net_b.id, payload.pin_a_id, sync=False
            )
            action, result_net = "picked_up", net_b
            message = f"Picked up net {net_b.name} for the source pin."

        if result_net is not None:
            edge.signal_id = result_net.id
        await self.db.flush()
        await self._net.prune_stale_auto_nets(
            vehicle_id, revision_id, sync=False, changed_by=changed_by
        )

        result = ConnectPinsResult(
            edge=self._topology._edge_response(edge),
            net_action=action,
            net_id=result_net.id if result_net else None,
            net_name=result_net.name if result_net else None,
            message=message,
            conflict_net_a_id=conflict[0].id if conflict else None,
            conflict_net_a_name=conflict[0].name if conflict else None,
            conflict_net_b_id=conflict[1].id if conflict else None,
            conflict_net_b_name=conflict[1].name if conflict else None,
        )
        sync = RevisionSyncService(self.db)
        edit_sequence = await sync.bump_and_notify(
            vehicle_id=vehicle_id,
            revision_id=revision_id,
            domains=DOMAINS_WIRING,
            changed_by=changed_by,
        )
        if created_edge:
            await sync.queue_mutation_patch(
                vehicle_id=vehicle_id,
                revision_id=revision_id,
                edit_sequence=edit_sequence,
                domains=DOMAINS_WIRING,
                covered_domains=["design-projection", "topology-summary"],
                changed_by=changed_by,
                patch={
                    "kind": "edge_created",
                    "edge_id": str(edge.id),
                    "pin_a_id": str(edge.pin_a_id),
                    "pin_b_id": str(edge.pin_b_id),
                },
            )
        return result

    async def disconnect(
        self,
        vehicle_id: UUID,
        revision_id: UUID,
        edge_id: UUID,
        *,
        expected_edit_sequence: int | None = None,
        changed_by: str | None = None,
    ) -> None:
        await RevisionSyncService(self.db).check_expected_sequence(
            revision_id, expected_edit_sequence, vehicle_id
        )
        edge = await self.db.get(ConnectionEdge, edge_id)
        if not edge or edge.revision_id != revision_id:
            raise HTTPException(status_code=404, detail="Edge not found")
        deleted_pin_a_id = edge.pin_a_id
        deleted_pin_b_id = edge.pin_b_id
        await self._topology.delete_edge(vehicle_id, revision_id, edge_id, sync=False)
        await self._net.prune_stale_auto_nets(
            vehicle_id, revision_id, sync=False, changed_by=changed_by
        )
        sync = RevisionSyncService(self.db)
        edit_sequence = await sync.bump_and_notify(
            vehicle_id=vehicle_id,
            revision_id=revision_id,
            domains=DOMAINS_WIRING,
            changed_by=changed_by,
        )
        await sync.queue_mutation_patch(
            vehicle_id=vehicle_id,
            revision_id=revision_id,
            edit_sequence=edit_sequence,
            domains=DOMAINS_WIRING,
            covered_domains=["design-projection", "topology-summary"],
            changed_by=changed_by,
            patch={
                "kind": "edge_deleted",
                "edge_id": str(edge_id),
                "pin_a_id": str(deleted_pin_a_id),
                "pin_b_id": str(deleted_pin_b_id),
            },
        )

    async def assign_net_by_name(
        self,
        vehicle_id: UUID,
        revision_id: UUID,
        pin_id: UUID,
        payload: AssignNetByNameRequest,
        *,
        changed_by: str | None = None,
    ) -> dict:
        await ensure_mutable_revision(self.db, revision_id, vehicle_id)
        pin = await self.db.get(Pin, pin_id)
        if not pin or pin.revision_id != revision_id:
            raise HTTPException(status_code=404, detail="Pin not found")

        name = (payload.net_name or "").strip()
        if not name:
            await self._net.assign_pin_to_net(vehicle_id, revision_id, None, pin_id, sync=False)
            await self._sync(vehicle_id, revision_id, changed_by=changed_by)
            return {"net_id": None, "net_name": None, "unassigned": True}

        signal = (
            await self.db.execute(
                select(Signal).where(Signal.revision_id == revision_id, Signal.name == name)
            )
        ).scalar_one_or_none()
        if signal is None:
            signal = Signal(
                revision_id=revision_id,
                vehicle_id=vehicle_id,
                name=name,
                signal_kind=SignalKind.CUSTOM,
            )
            self.db.add(signal)
            await self.db.flush()

        await self._net.assign_pin_to_net(vehicle_id, revision_id, signal.id, pin_id, sync=False)
        await self._sync(vehicle_id, revision_id, changed_by=changed_by)
        return {"net_id": signal.id, "net_name": signal.name, "unassigned": False}

    # ------------------------------------------------------------------ helpers

    async def _net_by_pin(
        self, revision_id: UUID, pin_ids: list[UUID]
    ) -> dict[UUID, tuple[UUID, str, dict]]:
        if not pin_ids:
            return {}
        rows = (
            await self.db.execute(
                select(PinSignalAssignment.pin_id, Signal.id, Signal.name, Signal.metadata_)
                .join(Signal, PinSignalAssignment.signal_id == Signal.id)
                .where(
                    PinSignalAssignment.revision_id == revision_id,
                    PinSignalAssignment.assignment_role == "primary",
                    PinSignalAssignment.pin_id.in_(pin_ids),
                )
            )
        ).all()
        return {
            pin_id: (net_id, net_name, metadata_ or {})
            for pin_id, net_id, net_name, metadata_ in rows
        }

    async def _short_partners(
        self,
        revision_id: UUID,
        scope_ids: set[UUID] | None,
        ctx: dict[UUID, _ConnectorCtx],
    ) -> dict[UUID, set[UUID]]:
        connector_ids = list(scope_ids) if scope_ids is not None else list(ctx.keys())
        partners: dict[UUID, set[UUID]] = {}
        short_indexes = await load_short_indexes_for_connectors(
            self.db, revision_id, connector_ids
        )
        for index in short_indexes.values():
            seen_roots: set[UUID] = set()
            for pid in list(index.parent.keys()):
                root = index.find(pid)
                if root in seen_roots:
                    continue
                seen_roots.add(root)
                component = index.component(pid)
                for member in component:
                    partners[member] = component - {member}
        return partners
