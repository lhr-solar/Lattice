from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.display import resolve_display_name
from app.core.revision_guard import ensure_mutable_revision
from app.domains.topology.net_naming import is_auto_net_name
from app.domains.topology.pin_shorts import load_short_index
from app.infrastructure.db.enums import SignalKind
from app.infrastructure.db.models.catalog import ConnectorTemplate
from app.infrastructure.db.models.instances import (
    ConnectorInstance,
    EnclosureInstance,
    PcbInstance,
    Pin,
)
from app.infrastructure.db.models.shorts import ConnectorInstancePinShort
from app.infrastructure.db.models.templates import EnclosureTemplate, PcbTemplate
from app.infrastructure.db.models.topology import ConnectionEdge, PinSignalAssignment, Signal
from app.schemas.connections import (
    AssignNetByNameRequest,
    ConnectionDestination,
    ConnectionScopeItem,
    ConnectPinsRequest,
    ConnectPinsResult,
    PinConnectionRow,
)
from app.schemas.topology import ConnectionEdgeCreate
from app.services.net_service import NetService
from app.services.topology_service import TopologyService


class _ConnectorCtx:
    __slots__ = (
        "label",
        "connector_kind",
        "container_kind",
        "container_label",
        "enclosure_id",
        "enclosure_label",
        "node_id",
        "node_label",
    )

    def __init__(
        self,
        label,
        connector_kind,
        container_kind,
        container_label,
        enclosure_id,
        enclosure_label,
        node_id,
        node_label,
    ):
        self.label = label
        self.connector_kind = connector_kind
        self.container_kind = container_kind
        self.container_label = container_label
        self.enclosure_id = enclosure_id
        self.enclosure_label = enclosure_label
        self.node_id = node_id
        self.node_label = node_label


class ConnectionService:
    """Spreadsheet-style harnessing: per-pin destinations + smart net pickup."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self._net = NetService(db)
        self._topology = TopologyService(db)

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
        node_enclosure: dict[UUID, UUID | None] = {}
        for node, tmpl in node_rows:
            node_label[node.id] = resolve_display_name(
                template_name=tmpl.name, nickname=node.nickname, use_template_name=node.use_template_name
            )
            node_enclosure[node.id] = node.enclosure_instance_id

        enc_rows = (
            await self.db.execute(
                select(EnclosureInstance, EnclosureTemplate)
                .join(EnclosureTemplate, EnclosureInstance.enclosure_template_id == EnclosureTemplate.id)
                .where(EnclosureInstance.revision_id == revision_id)
            )
        ).all()
        enc_label: dict[UUID, str] = {}
        for enc, tmpl in enc_rows:
            enc_label[enc.id] = resolve_display_name(
                template_name=tmpl.name, nickname=enc.nickname, use_template_name=enc.use_template_name
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
            label = resolve_display_name(
                template_name=tmpl.name, nickname=conn.nickname, use_template_name=conn.use_template_name
            )
            if conn.source_pcb_instance_id is not None:
                connector_kind = "pigtail"
            elif conn.is_panel_mount:
                connector_kind = "panel"
            elif conn.pcb_instance_id is not None:
                connector_kind = "pcb"
            else:
                connector_kind = "inline"
            if conn.pcb_instance_id and conn.pcb_instance_id in node_label:
                node_id = conn.pcb_instance_id
                enc_id = node_enclosure.get(node_id)
                container = node_label[node_id]
                if enc_id and enc_id in enc_label:
                    container = f"{enc_label[enc_id]} / {container}"
                ctx[conn.id] = _ConnectorCtx(
                    label,
                    connector_kind,
                    "node",
                    container,
                    enc_id,
                    enc_label.get(enc_id) if enc_id else None,
                    node_id,
                    node_label[node_id],
                )
            elif conn.enclosure_instance_id and conn.enclosure_instance_id in enc_label:
                enc_id = conn.enclosure_instance_id
                ctx[conn.id] = _ConnectorCtx(
                    label,
                    connector_kind,
                    "enclosure",
                    f"{enc_label[enc_id]} / Panel",
                    enc_id,
                    enc_label[enc_id],
                    None,
                    None,
                )
            else:
                ctx[conn.id] = _ConnectorCtx(
                    label, connector_kind, "inline", "Inline connectors", None, None, None, None
                )
        return ctx

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
    ) -> list[PinConnectionRow]:
        ctx = await self._connector_context(revision_id)
        scope_ids = self._scope_connector_ids(
            ctx,
            connector_instance_id=connector_instance_id,
            pcb_instance_id=pcb_instance_id,
            enclosure_instance_id=enclosure_instance_id,
            vehicle_level=vehicle_level,
        )

        # Full pin map for the revision so destinations can be labelled even when
        # the other end is outside the current scope.
        pin_rows = (
            await self.db.execute(
                select(Pin).where(Pin.revision_id == revision_id).order_by(Pin.pin_number)
            )
        ).scalars().all()
        pin_by_id: dict[UUID, Pin] = {p.id: p for p in pin_rows}

        net_by_pin = await self._net_by_pin(revision_id, [p.id for p in pin_rows])

        # Edges keyed by pin so we can list destinations per pin.
        edges = (
            await self.db.execute(
                select(ConnectionEdge).where(ConnectionEdge.revision_id == revision_id)
            )
        ).scalars().all()
        edges_by_pin: dict[UUID, list[ConnectionEdge]] = {}
        for e in edges:
            edges_by_pin.setdefault(e.pin_a_id, []).append(e)
            edges_by_pin.setdefault(e.pin_b_id, []).append(e)

        # Shorts per connector for partner lookup.
        short_partners = await self._short_partners(revision_id, scope_ids, ctx)

        def dest_for(edge: ConnectionEdge, this_pin_id: UUID) -> ConnectionDestination | None:
            other_id = edge.pin_b_id if edge.pin_a_id == this_pin_id else edge.pin_a_id
            other = pin_by_id.get(other_id)
            if other is None:
                return None
            octx = ctx.get(other.connector_instance_id)
            return ConnectionDestination(
                edge_id=edge.id,
                other_pin_id=other.id,
                other_pin_number=other.pin_number,
                other_pin_name=other.name,
                other_connector_instance_id=other.connector_instance_id,
                other_connector_label=octx.label if octx else "?",
                other_container_label=octx.container_label if octx else None,
                wire_color=edge.wire_color,
                gauge_awg=edge.gauge_awg,
            )

        query = (search or "").strip().lower()
        rows: list[PinConnectionRow] = []
        for pin in pin_rows:
            if scope_ids is not None and pin.connector_instance_id not in scope_ids:
                continue
            cctx = ctx.get(pin.connector_instance_id)
            net = net_by_pin.get(pin.id)
            if query:
                hay = " ".join(
                    filter(
                        None,
                        [
                            pin.name,
                            str(pin.pin_number),
                            cctx.label if cctx else "",
                            cctx.container_label if cctx else "",
                            net[1] if net else "",
                        ],
                    )
                ).lower()
                if query not in hay:
                    continue
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
                    container_label=cctx.container_label if cctx else None,
                    container_kind=cctx.container_kind if cctx else None,
                    node_label=cctx.node_label if cctx else None,
                    enclosure_label=cctx.enclosure_label if cctx else None,
                    primary_net_id=net[0] if net else None,
                    primary_net_name=net[1] if net else None,
                    is_auto_net=is_auto_net_name(net[1]) if net else False,
                    destinations=destinations,
                    short_partner_pin_ids=sorted(short_partners.get(pin.id, set()), key=str),
                )
            )

        rows.sort(
            key=lambda r: (
                r.container_label or "",
                r.connector_label,
                r.pin_number,
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
        self, vehicle_id: UUID, revision_id: UUID, payload: ConnectPinsRequest
    ) -> ConnectPinsResult:
        await ensure_mutable_revision(self.db, revision_id, vehicle_id)
        if payload.pin_a_id == payload.pin_b_id:
            raise HTTPException(status_code=400, detail="Cannot connect a pin to itself")
        for pid in (payload.pin_a_id, payload.pin_b_id):
            pin = await self.db.get(Pin, pid)
            if not pin or pin.revision_id != revision_id:
                raise HTTPException(status_code=404, detail=f"Pin {pid} not found")

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
            if payload.wire_color is not None:
                edge.wire_color = payload.wire_color
            if payload.gauge_awg is not None:
                edge.gauge_awg = payload.gauge_awg
            await self.db.flush()
        else:
            created = await self._topology.create_edge(
                vehicle_id,
                revision_id,
                ConnectionEdgeCreate(
                    pin_a_id=payload.pin_a_id,
                    pin_b_id=payload.pin_b_id,
                    wire_color=payload.wire_color,
                    gauge_awg=payload.gauge_awg,
                ),
            )
            edge = await self.db.get(ConnectionEdge, created.id)

        net_a = await self._primary_net(revision_id, payload.pin_a_id)
        net_b = await self._primary_net(revision_id, payload.pin_b_id)

        action = "none"
        result_net: Signal | None = None
        conflict: tuple[Signal, Signal] | None = None
        message = "Wire created. Neither pin has a net yet — name one to group the bus."

        if net_a and net_b:
            if net_a.id == net_b.id:
                action, result_net = "already_same", net_a
                message = f"Wire created on net {net_a.name}."
            else:
                target, loser = self._resolve_merge(net_a, net_b, payload.merge_target_net_id)
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
                    await self._absorb_net(revision_id, loser.id, target.id)
                    action, result_net = "merged", target
                    message = f"Wire created — merged onto net {target.name}."
        elif net_a and not net_b:
            await self._net.assign_pin_to_net(vehicle_id, revision_id, net_a.id, payload.pin_b_id)
            action, result_net = "picked_up", net_a
            message = f"Picked up net {net_a.name} for the destination pin."
        elif net_b and not net_a:
            await self._net.assign_pin_to_net(vehicle_id, revision_id, net_b.id, payload.pin_a_id)
            action, result_net = "picked_up", net_b
            message = f"Picked up net {net_b.name} for the source pin."

        if result_net is not None:
            edge.signal_id = result_net.id
        await self.db.flush()

        return ConnectPinsResult(
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

    @staticmethod
    def _resolve_merge(
        net_a: Signal, net_b: Signal, merge_target_net_id: UUID | None
    ) -> tuple[Signal | None, Signal | None]:
        """Decide which of two distinct nets survives when joining their pins.

        Returns (target, loser). (None, None) means an unresolved conflict that
        needs the caller to choose (both nets are user-named).
        """
        if merge_target_net_id is not None:
            if merge_target_net_id == net_a.id:
                return net_a, net_b
            if merge_target_net_id == net_b.id:
                return net_b, net_a
            raise HTTPException(
                status_code=400, detail="merge_target_net_id must be one of the two pins' nets"
            )

        a_auto = is_auto_net_name(net_a.name)
        b_auto = is_auto_net_name(net_b.name)
        if a_auto and not b_auto:
            return net_b, net_a  # named net wins
        if b_auto and not a_auto:
            return net_a, net_b
        if a_auto and b_auto:
            return net_a, net_b  # both auto-named: collapse onto one silently
        return None, None  # both user-named and different: needs a choice

    async def _absorb_net(self, revision_id: UUID, loser_id: UUID, target_id: UUID) -> None:
        """Move every pin and edge off ``loser`` onto ``target`` and delete loser."""
        target_pins = set(
            (
                await self.db.execute(
                    select(PinSignalAssignment.pin_id).where(
                        PinSignalAssignment.revision_id == revision_id,
                        PinSignalAssignment.signal_id == target_id,
                        PinSignalAssignment.assignment_role == "primary",
                    )
                )
            ).scalars().all()
        )
        loser_assignments = (
            await self.db.execute(
                select(PinSignalAssignment).where(
                    PinSignalAssignment.revision_id == revision_id,
                    PinSignalAssignment.signal_id == loser_id,
                    PinSignalAssignment.assignment_role == "primary",
                )
            )
        ).scalars().all()
        for assignment in loser_assignments:
            if assignment.pin_id in target_pins:
                await self.db.delete(assignment)
            else:
                assignment.signal_id = target_id
                target_pins.add(assignment.pin_id)

        await self.db.execute(
            update(ConnectionEdge)
            .where(
                ConnectionEdge.revision_id == revision_id,
                ConnectionEdge.signal_id == loser_id,
            )
            .values(signal_id=target_id)
        )

        loser = await self.db.get(Signal, loser_id)
        if loser is not None:
            await self.db.delete(loser)
        await self.db.flush()

    async def disconnect(self, vehicle_id: UUID, revision_id: UUID, edge_id: UUID) -> None:
        await self._topology.delete_edge(vehicle_id, revision_id, edge_id)

    async def assign_net_by_name(
        self, vehicle_id: UUID, revision_id: UUID, pin_id: UUID, payload: AssignNetByNameRequest
    ) -> dict:
        await ensure_mutable_revision(self.db, revision_id, vehicle_id)
        pin = await self.db.get(Pin, pin_id)
        if not pin or pin.revision_id != revision_id:
            raise HTTPException(status_code=404, detail="Pin not found")

        name = (payload.net_name or "").strip()
        if not name:
            await self._net.assign_pin_to_net(vehicle_id, revision_id, None, pin_id)
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

        await self._net.assign_pin_to_net(vehicle_id, revision_id, signal.id, pin_id)
        return {"net_id": signal.id, "net_name": signal.name, "unassigned": False}

    # ------------------------------------------------------------------ helpers

    async def _net_by_pin(
        self, revision_id: UUID, pin_ids: list[UUID]
    ) -> dict[UUID, tuple[UUID, str]]:
        if not pin_ids:
            return {}
        rows = (
            await self.db.execute(
                select(PinSignalAssignment.pin_id, Signal.id, Signal.name)
                .join(Signal, PinSignalAssignment.signal_id == Signal.id)
                .where(
                    PinSignalAssignment.revision_id == revision_id,
                    PinSignalAssignment.assignment_role == "primary",
                    PinSignalAssignment.pin_id.in_(pin_ids),
                )
            )
        ).all()
        return {pin_id: (net_id, net_name) for pin_id, net_id, net_name in rows}

    async def _primary_net(self, revision_id: UUID, pin_id: UUID) -> Signal | None:
        return (
            await self.db.execute(
                select(Signal)
                .join(PinSignalAssignment, PinSignalAssignment.signal_id == Signal.id)
                .where(
                    PinSignalAssignment.revision_id == revision_id,
                    PinSignalAssignment.pin_id == pin_id,
                    PinSignalAssignment.assignment_role == "primary",
                )
            )
        ).scalars().first()

    async def _short_partners(
        self,
        revision_id: UUID,
        scope_ids: set[UUID] | None,
        ctx: dict[UUID, _ConnectorCtx],
    ) -> dict[UUID, set[UUID]]:
        connector_ids = list(scope_ids) if scope_ids is not None else list(ctx.keys())
        partners: dict[UUID, set[UUID]] = {}
        for cid in connector_ids:
            index = await load_short_index(self.db, revision_id, cid)
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
