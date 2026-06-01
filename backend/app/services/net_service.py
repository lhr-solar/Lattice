from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.revision_guard import ensure_mutable_revision
from app.domains.topology.net_naming import (
    NET_ARROW,
    derive_lone_pin_net_name,
    derive_pair_net_name_for_pins,
    ensure_unique_net_name,
    is_auto_net_name,
)
from app.domains.topology.pin_shorts import expand_pins_with_shorts
from app.infrastructure.db.enums import SignalKind
from app.infrastructure.db.models.catalog import ConnectorTemplate
from app.infrastructure.db.models.instances import ConnectorInstance, Pin
from app.infrastructure.db.models.topology import ConnectionEdge, PinSignalAssignment, Signal
from app.schemas.nets import (
    NetCreate,
    NetDeleteResult,
    NetDetail,
    NetPinInfo,
    NetSummary,
    NetUpdate,
    PinPairRequest,
    PinPairResponse,
)
from app.services.topology_service import TopologyService


class NetService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self._topology = TopologyService(db)

    async def list_nets(
        self, revision_id: UUID, search: str | None = None, auto_named_only: bool | None = None
    ) -> list[NetSummary]:
        q = select(Signal).where(Signal.revision_id == revision_id)
        if search:
            q = q.where(Signal.name.ilike(f"%{search}%"))
        if auto_named_only is True:
            q = q.where(Signal.name.contains(NET_ARROW))
        elif auto_named_only is False:
            q = q.where(~Signal.name.contains(NET_ARROW))
        q = q.order_by(Signal.name)
        signals = (await self.db.execute(q)).scalars().all()

        counts: dict[UUID, int] = {}
        count_rows = await self.db.execute(
            select(PinSignalAssignment.signal_id, func.count())
            .where(
                PinSignalAssignment.revision_id == revision_id,
                PinSignalAssignment.assignment_role == "primary",
            )
            .group_by(PinSignalAssignment.signal_id)
        )
        for sid, cnt in count_rows.all():
            counts[sid] = cnt

        return [
            NetSummary(
                id=s.id,
                name=s.name,
                signal_kind=s.signal_kind,
                is_auto_named=is_auto_net_name(s.name),
                pin_count=counts.get(s.id, 0),
            )
            for s in signals
        ]

    async def get_net(self, revision_id: UUID, net_id: UUID) -> NetDetail:
        signal = await self._get_net_or_404(revision_id, net_id)
        return await self._build_net_detail(signal)

    async def create_net(self, vehicle_id: UUID, revision_id: UUID, payload: NetCreate) -> NetDetail:
        await ensure_mutable_revision(self.db, revision_id, vehicle_id)
        await self._ensure_unique_name(revision_id, payload.name)
        signal = Signal(
            revision_id=revision_id,
            vehicle_id=vehicle_id,
            name=payload.name.strip(),
            signal_kind=payload.signal_kind,
        )
        self.db.add(signal)
        await self.db.flush()
        return await self._build_net_detail(signal)

    async def update_net(
        self, vehicle_id: UUID, revision_id: UUID, net_id: UUID, payload: NetUpdate
    ) -> NetDetail:
        await ensure_mutable_revision(self.db, revision_id, vehicle_id)
        signal = await self._get_net_or_404(revision_id, net_id)
        if payload.name is not None:
            name = payload.name.strip()
            if name != signal.name:
                await self._ensure_unique_name(revision_id, name, exclude_id=net_id)
            signal.name = name
        if payload.signal_kind is not None:
            signal.signal_kind = payload.signal_kind
        await self.db.flush()
        return await self._build_net_detail(signal)

    async def delete_net(self, vehicle_id: UUID, revision_id: UUID, net_id: UUID) -> NetDeleteResult:
        await ensure_mutable_revision(self.db, revision_id, vehicle_id)
        signal = await self._get_net_or_404(revision_id, net_id)
        net_name = signal.name

        assignments = (
            await self.db.execute(
                select(PinSignalAssignment).where(
                    PinSignalAssignment.revision_id == revision_id,
                    PinSignalAssignment.signal_id == net_id,
                )
            )
        ).scalars().all()

        affected_pin_ids = list({a.pin_id for a in assignments})

        await self.db.execute(
            delete(PinSignalAssignment).where(
                PinSignalAssignment.revision_id == revision_id,
                PinSignalAssignment.signal_id == net_id,
            )
        )

        edges = (
            await self.db.execute(
                select(ConnectionEdge).where(
                    ConnectionEdge.revision_id == revision_id,
                    ConnectionEdge.signal_id == net_id,
                )
            )
        ).scalars().all()
        for edge in edges:
            edge.signal_id = None

        await self.db.delete(signal)
        await self.db.flush()

        created_auto: list[str] = []
        for pin_id in affected_pin_ids:
            remaining = await self.db.execute(
                select(PinSignalAssignment).where(
                    PinSignalAssignment.revision_id == revision_id,
                    PinSignalAssignment.pin_id == pin_id,
                    PinSignalAssignment.assignment_role == "primary",
                )
            )
            if remaining.scalars().first():
                continue

            auto_name = await ensure_unique_net_name(
                self.db, revision_id, await derive_lone_pin_net_name(self.db, pin_id)
            )
            auto_net = Signal(
                revision_id=revision_id,
                vehicle_id=vehicle_id,
                name=auto_name,
                signal_kind=SignalKind.CUSTOM,
                metadata_={"auto_created": True, "reason": "net_deleted"},
            )
            self.db.add(auto_net)
            await self.db.flush()
            self.db.add(
                PinSignalAssignment(
                    revision_id=revision_id,
                    pin_id=pin_id,
                    signal_id=auto_net.id,
                    assignment_role="primary",
                )
            )
            created_auto.append(auto_name)

        await self.db.flush()
        return NetDeleteResult(
            deleted_net_id=net_id,
            deleted_net_name=net_name,
            pins_reassigned=len(created_auto),
            created_auto_nets=created_auto,
        )

    async def assign_pin_to_net(
        self,
        vehicle_id: UUID,
        revision_id: UUID,
        net_id: UUID,
        pin_id: UUID,
        replace_existing_primary: bool = True,
    ) -> NetDetail:
        await ensure_mutable_revision(self.db, revision_id, vehicle_id)
        await self._get_net_or_404(revision_id, net_id)
        pin = await self.db.get(Pin, pin_id)
        if not pin or pin.revision_id != revision_id:
            raise HTTPException(status_code=404, detail="Pin not found")

        pin_ids = await expand_pins_with_shorts(self.db, revision_id, [pin_id])
        for expanded_pin in pin_ids:
            if replace_existing_primary:
                await self.db.execute(
                    delete(PinSignalAssignment).where(
                        PinSignalAssignment.revision_id == revision_id,
                        PinSignalAssignment.pin_id == expanded_pin,
                        PinSignalAssignment.assignment_role == "primary",
                    )
                )
            dup = await self.db.execute(
                select(PinSignalAssignment).where(
                    PinSignalAssignment.pin_id == expanded_pin,
                    PinSignalAssignment.signal_id == net_id,
                    PinSignalAssignment.assignment_role == "primary",
                )
            )
            if not dup.scalar_one_or_none():
                self.db.add(
                    PinSignalAssignment(
                        revision_id=revision_id,
                        pin_id=expanded_pin,
                        signal_id=net_id,
                        assignment_role="primary",
                    )
                )
        await self.db.flush()

        signal = await self._get_net_or_404(revision_id, net_id)
        return await self._build_net_detail(signal)

    async def pair_pins(
        self, vehicle_id: UUID, revision_id: UUID, payload: PinPairRequest
    ) -> PinPairResponse:
        await ensure_mutable_revision(self.db, revision_id, vehicle_id)
        if payload.pin_a_id == payload.pin_b_id:
            raise HTTPException(status_code=400, detail="Cannot pair a pin with itself")

        for pin_id in (payload.pin_a_id, payload.pin_b_id):
            pin = await self.db.get(Pin, pin_id)
            if not pin or pin.revision_id != revision_id:
                raise HTTPException(status_code=404, detail=f"Pin {pin_id} not found")

        if payload.net_id:
            signal = await self._get_net_or_404(revision_id, payload.net_id)
        elif payload.net_name:
            name = payload.net_name.strip()
            await self._ensure_unique_name(revision_id, name)
            signal = Signal(
                revision_id=revision_id,
                vehicle_id=vehicle_id,
                name=name,
                signal_kind=payload.signal_kind,
            )
            self.db.add(signal)
            await self.db.flush()
        else:
            base = await derive_pair_net_name_for_pins(self.db, payload.pin_a_id, payload.pin_b_id)
            name = await ensure_unique_net_name(self.db, revision_id, base)
            signal = Signal(
                revision_id=revision_id,
                vehicle_id=vehicle_id,
                name=name,
                signal_kind=payload.signal_kind,
                metadata_={"auto_created": True, "reason": "pin_pair"},
            )
            self.db.add(signal)
            await self.db.flush()

        pin_targets = await expand_pins_with_shorts(
            self.db, revision_id, [payload.pin_a_id, payload.pin_b_id]
        )
        assignments_created = 0
        for pin_id in pin_targets:
            if payload.replace_existing_primary:
                await self.db.execute(
                    delete(PinSignalAssignment).where(
                        PinSignalAssignment.revision_id == revision_id,
                        PinSignalAssignment.pin_id == pin_id,
                        PinSignalAssignment.assignment_role == "primary",
                    )
                )
            dup = await self.db.execute(
                select(PinSignalAssignment).where(
                    PinSignalAssignment.pin_id == pin_id,
                    PinSignalAssignment.signal_id == signal.id,
                    PinSignalAssignment.assignment_role == "primary",
                )
            )
            if not dup.scalar_one_or_none():
                self.db.add(
                    PinSignalAssignment(
                        revision_id=revision_id,
                        pin_id=pin_id,
                        signal_id=signal.id,
                        assignment_role="primary",
                    )
                )
                assignments_created += 1

        await self.db.flush()

        edge_response = None
        if payload.create_edge:
            edge_result = await self.db.execute(
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
            existing_edge = edge_result.scalar_one_or_none()
            if existing_edge:
                existing_edge.signal_id = signal.id
                if payload.wire_color:
                    existing_edge.wire_color = payload.wire_color
                if payload.gauge_awg is not None:
                    existing_edge.gauge_awg = payload.gauge_awg
                await self.db.flush()
                edge_response = self._topology._edge_response(existing_edge)
            else:
                from app.schemas.topology import ConnectionEdgeCreate

                edge_response = await self._topology.create_edge(
                    vehicle_id,
                    revision_id,
                    ConnectionEdgeCreate(
                        pin_a_id=payload.pin_a_id,
                        pin_b_id=payload.pin_b_id,
                        signal_id=signal.id,
                        wire_color=payload.wire_color,
                        gauge_awg=payload.gauge_awg,
                    ),
                )

        detail = await self._build_net_detail(signal)
        return PinPairResponse(
            net=detail,
            edge=edge_response,
            assignments_created=assignments_created,
        )

    async def list_pins(
        self,
        revision_id: UUID,
        connector_instance_id: UUID | None = None,
        search: str | None = None,
    ) -> list[NetPinInfo]:
        q = (
            select(Pin, ConnectorInstance, ConnectorTemplate)
            .join(ConnectorInstance, Pin.connector_instance_id == ConnectorInstance.id)
            .join(ConnectorTemplate, ConnectorInstance.connector_template_id == ConnectorTemplate.id)
            .where(Pin.revision_id == revision_id)
        )
        if connector_instance_id:
            q = q.where(Pin.connector_instance_id == connector_instance_id)
        if search:
            q = q.where(
                or_(
                    Pin.name.ilike(f"%{search}%"),
                    ConnectorTemplate.name.ilike(f"%{search}%"),
                )
            )
        q = q.order_by(ConnectorTemplate.name, Pin.pin_number)
        rows = (await self.db.execute(q)).all()

        pin_ids = [pin.id for pin, _, _ in rows]
        net_by_pin: dict[UUID, tuple[UUID, str]] = {}
        if pin_ids:
            assign_rows = await self.db.execute(
                select(PinSignalAssignment.pin_id, Signal.id, Signal.name)
                .join(Signal, PinSignalAssignment.signal_id == Signal.id)
                .where(
                    PinSignalAssignment.revision_id == revision_id,
                    PinSignalAssignment.pin_id.in_(pin_ids),
                    PinSignalAssignment.assignment_role == "primary",
                )
            )
            for pin_id, net_id, net_name in assign_rows.all():
                net_by_pin[pin_id] = (net_id, net_name)

        result_pins: list[NetPinInfo] = []
        for pin, conn, tmpl in rows:
            net_info = net_by_pin.get(pin.id)
            result_pins.append(
                NetPinInfo(
                    pin_id=pin.id,
                    pin_number=pin.pin_number,
                    pin_name=pin.name,
                    connector_instance_id=conn.id,
                    connector_label=tmpl.name,
                    primary_net_id=net_info[0] if net_info else None,
                    primary_net_name=net_info[1] if net_info else None,
                )
            )
        return result_pins

    async def _build_net_detail(self, signal: Signal) -> NetDetail:
        assignments = (
            await self.db.execute(
                select(PinSignalAssignment).where(
                    PinSignalAssignment.signal_id == signal.id,
                    PinSignalAssignment.assignment_role == "primary",
                )
            )
        ).scalars().all()
        pin_ids = [a.pin_id for a in assignments]
        pins: list[NetPinInfo] = []
        if pin_ids:
            all_pins = await self.list_pins(signal.revision_id)
            pin_map = {p.pin_id: p for p in all_pins}
            pins = [pin_map[pid] for pid in pin_ids if pid in pin_map]

        edge_rows = await self.db.execute(
            select(ConnectionEdge.id).where(ConnectionEdge.signal_id == signal.id)
        )
        return NetDetail(
            id=signal.id,
            name=signal.name,
            signal_kind=signal.signal_kind,
            is_auto_named=is_auto_net_name(signal.name),
            pin_count=len(pins),
            pins=pins,
            edge_ids=list(edge_rows.scalars().all()),
        )

    async def _get_net_or_404(self, revision_id: UUID, net_id: UUID) -> Signal:
        signal = await self.db.get(Signal, net_id)
        if not signal or signal.revision_id != revision_id:
            raise HTTPException(status_code=404, detail="Net not found")
        return signal

    async def _ensure_unique_name(
        self, revision_id: UUID, name: str, exclude_id: UUID | None = None
    ) -> None:
        q = select(Signal.id).where(Signal.revision_id == revision_id, Signal.name == name)
        if exclude_id:
            q = q.where(Signal.id != exclude_id)
        if (await self.db.execute(q)).scalar_one_or_none():
            raise HTTPException(status_code=409, detail=f"Net name '{name}' already exists")
