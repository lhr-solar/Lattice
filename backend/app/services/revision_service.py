import hashlib
import json
from datetime import datetime
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.revision_guard import get_revision_or_404
from app.core.time import utc_now
from app.infra.db.enums import EdgeManufacturingState, EntityKind, RevisionStatus
from app.infra.db.models.instances import ConnectorInstance, EnclosureInstance, PcbInstance, Pin
from app.infra.db.models.revision import RevisionChange, RevisionSnapshot
from app.infra.db.models.shorts import ConnectorInstancePinShort
from app.infra.db.models.topology import ConnectionEdge, PinSignalAssignment, Signal
from app.infra.db.models.vehicle import Revision, VehicleHead
from app.schemas.revisions import RevisionDiffItem, RevisionPublishResponse
from app.schemas.vehicles import RevisionResponse
from app.services.revision_sync_service import RevisionSyncService


class RevisionService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_revisions(self, vehicle_id: UUID) -> list[RevisionResponse]:
        result = await self.db.execute(
            select(Revision).where(Revision.vehicle_id == vehicle_id).order_by(Revision.revision_number.desc())
        )
        return [self._to_response(r) for r in result.scalars().all()]

    async def publish(
        self, vehicle_id: UUID, revision_id: UUID, published_by: str | None
    ) -> RevisionPublishResponse:
        revision = await get_revision_or_404(self.db, revision_id, vehicle_id)
        if revision.is_immutable:
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "revision_already_published",
                    "message": "Revision already published",
                },
            )

        snapshot = await self._build_snapshot(revision_id)
        checksum = hashlib.sha256(json.dumps(snapshot, sort_keys=True, default=str).encode()).hexdigest()
        now = utc_now()

        revision.is_immutable = True
        revision.snapshot_taken_at = now
        revision.status = RevisionStatus.RELEASED

        self.db.add(
            RevisionSnapshot(revision_id=revision_id, snapshot_data=snapshot, checksum=checksum, created_at=now)
        )
        self.db.add(
            RevisionChange(
                revision_id=revision_id,
                entity_kind=EntityKind.VEHICLE,
                entity_id=vehicle_id,
                change_type="publish",
                before=None,
                after={"checksum": checksum},
                changed_by=published_by,
                changed_at=now,
            )
        )

        new_revision = Revision(
            vehicle_id=vehicle_id,
            revision_number=revision.revision_number + 1,
            status=RevisionStatus.DRAFT,
            label=f"Draft from R{revision.revision_number}",
            parent_revision_id=revision_id,
            is_immutable=False,
            created_by=published_by,
            created_at=now,
        )
        self.db.add(new_revision)
        await self.db.flush()

        await self._clone_revision_data(revision_id, new_revision.id, vehicle_id)

        head = await self.db.get(VehicleHead, vehicle_id)
        if head:
            head.current_revision_id = new_revision.id

        await self.db.flush()
        await RevisionSyncService(self.db).notify_published(
            vehicle_id=vehicle_id,
            old_revision_id=revision_id,
            new_revision_id=new_revision.id,
            changed_by=published_by,
        )
        return RevisionPublishResponse(
            published_revision=self._to_response(revision),
            new_draft_revision=self._to_response(new_revision),
        )

    async def list_changes(self, revision_id: UUID) -> list[RevisionDiffItem]:
        result = await self.db.execute(
            select(RevisionChange)
            .where(RevisionChange.revision_id == revision_id)
            .order_by(RevisionChange.changed_at.desc())
        )
        return [
            RevisionDiffItem(
                entity_kind=c.entity_kind.value,
                entity_id=c.entity_id,
                change_type=c.change_type,
                changed_at=c.changed_at,
                changed_by=c.changed_by,
            )
            for c in result.scalars().all()
        ]

    async def _build_snapshot(self, revision_id: UUID) -> dict:
        async def dump(model):
            rows = (await self.db.execute(select(model).where(model.revision_id == revision_id))).scalars().all()  # type: ignore
            return [_serialize_row(r) for r in rows]

        return {
            "signals": await dump(Signal),
            "pins": await dump(Pin),
            "connectors": await dump(ConnectorInstance),
            "pcbs": await dump(PcbInstance),
            "enclosures": await dump(EnclosureInstance),
            "edges": await dump(ConnectionEdge),
            "assignments": await dump(PinSignalAssignment),
        }

    async def _clone_revision_data(self, from_revision_id: UUID, to_revision_id: UUID, vehicle_id: UUID) -> None:
        signal_map: dict[UUID, UUID] = {}
        enc_map: dict[UUID, UUID] = {}
        pcb_map: dict[UUID, UUID] = {}
        conn_map: dict[UUID, UUID] = {}
        pin_map: dict[UUID, UUID] = {}

        for sig in (await self.db.execute(select(Signal).where(Signal.revision_id == from_revision_id))).scalars():
            new_sig = Signal(
                revision_id=to_revision_id,
                vehicle_id=vehicle_id,
                name=sig.name,
                signal_kind=sig.signal_kind,
                bus_group_id=sig.bus_group_id,
                default_wire_color=sig.default_wire_color,
                metadata_=sig.metadata_,
            )
            self.db.add(new_sig)
            await self.db.flush()
            signal_map[sig.id] = new_sig.id

        for enc in (
            await self.db.execute(select(EnclosureInstance).where(EnclosureInstance.revision_id == from_revision_id))
        ).scalars():
            new_enc = EnclosureInstance(
                revision_id=to_revision_id,
                vehicle_id=vehicle_id,
                enclosure_template_id=enc.enclosure_template_id,
                nickname=enc.nickname,
                use_template_name=enc.use_template_name,
                metadata_=enc.metadata_,
                created_at=enc.created_at,
            )
            self.db.add(new_enc)
            await self.db.flush()
            enc_map[enc.id] = new_enc.id

        for pcb in (
            await self.db.execute(select(PcbInstance).where(PcbInstance.revision_id == from_revision_id))
        ).scalars():
            new_pcb = PcbInstance(
                revision_id=to_revision_id,
                vehicle_id=vehicle_id,
                pcb_template_id=pcb.pcb_template_id,
                enclosure_instance_id=enc_map.get(pcb.enclosure_instance_id) if pcb.enclosure_instance_id else None,
                nickname=pcb.nickname,
                use_template_name=pcb.use_template_name,
                metadata_=pcb.metadata_,
                created_at=pcb.created_at,
            )
            self.db.add(new_pcb)
            await self.db.flush()
            pcb_map[pcb.id] = new_pcb.id

        for conn in (
            await self.db.execute(select(ConnectorInstance).where(ConnectorInstance.revision_id == from_revision_id))
        ).scalars():
            new_conn = ConnectorInstance(
                revision_id=to_revision_id,
                vehicle_id=vehicle_id,
                connector_template_id=conn.connector_template_id,
                pcb_instance_id=pcb_map.get(conn.pcb_instance_id) if conn.pcb_instance_id else None,
                enclosure_instance_id=enc_map.get(conn.enclosure_instance_id) if conn.enclosure_instance_id else None,
                pcb_template_slot_id=conn.pcb_template_slot_id,
                enclosure_panel_slot_id=conn.enclosure_panel_slot_id,
                is_panel_mount=conn.is_panel_mount,
                nickname=conn.nickname,
                use_template_name=conn.use_template_name,
                role=conn.role,
                metadata_=conn.metadata_,
                created_at=conn.created_at,
            )
            self.db.add(new_conn)
            await self.db.flush()
            conn_map[conn.id] = new_conn.id

        for pin in (await self.db.execute(select(Pin).where(Pin.revision_id == from_revision_id))).scalars():
            new_pin = Pin(
                revision_id=to_revision_id,
                connector_instance_id=conn_map[pin.connector_instance_id],
                connector_template_pin_id=pin.connector_template_pin_id,
                pin_number=pin.pin_number,
                name=pin.name,
                role=pin.role,
                metadata_=pin.metadata_,
            )
            self.db.add(new_pin)
            await self.db.flush()
            pin_map[pin.id] = new_pin.id

        for a in (
            await self.db.execute(
                select(PinSignalAssignment).where(PinSignalAssignment.revision_id == from_revision_id)
            )
        ).scalars():
            self.db.add(
                PinSignalAssignment(
                    revision_id=to_revision_id,
                    pin_id=pin_map[a.pin_id],
                    signal_id=signal_map[a.signal_id],
                    assignment_role=a.assignment_role,
                )
            )

        for edge in (
            await self.db.execute(select(ConnectionEdge).where(ConnectionEdge.revision_id == from_revision_id))
        ).scalars():
            self.db.add(
                ConnectionEdge(
                    revision_id=to_revision_id,
                    vehicle_id=vehicle_id,
                    pin_a_id=pin_map[edge.pin_a_id],
                    pin_b_id=pin_map[edge.pin_b_id],
                    signal_id=signal_map.get(edge.signal_id) if edge.signal_id else None,
                    gauge_awg=edge.gauge_awg,
                    wire_color=edge.wire_color,
                    twisted_pair_group_id=edge.twisted_pair_group_id,
                    shield_group_id=edge.shield_group_id,
                    signal_type=edge.signal_type,
                    notes=edge.notes,
                    manufacturing_state=EdgeManufacturingState.PLANNED,
                    manufacturing_metadata={},
                    enclosure_a_id=enc_map.get(edge.enclosure_a_id) if edge.enclosure_a_id else None,
                    enclosure_b_id=enc_map.get(edge.enclosure_b_id) if edge.enclosure_b_id else None,
                    harness_scope=edge.harness_scope,
                    created_at=edge.created_at,
                )
            )

        for short in (
            await self.db.execute(
                select(ConnectorInstancePinShort).where(
                    ConnectorInstancePinShort.revision_id == from_revision_id
                )
            )
        ).scalars():
            self.db.add(
                ConnectorInstancePinShort(
                    revision_id=to_revision_id,
                    connector_instance_id=conn_map[short.connector_instance_id],
                    pin_a_id=pin_map[short.pin_a_id],
                    pin_b_id=pin_map[short.pin_b_id],
                )
            )
        await self.db.flush()

    @staticmethod
    def _to_response(revision: Revision) -> RevisionResponse:
        return RevisionResponse(
            id=revision.id,
            vehicle_id=revision.vehicle_id,
            revision_number=revision.revision_number,
            status=revision.status,
            label=revision.label,
            is_immutable=revision.is_immutable,
            created_at=revision.created_at,
            edit_sequence=revision.edit_sequence,
        )


def _serialize_row(row) -> dict:
    out = {}
    for col in row.__table__.columns:
        val = getattr(row, col.key)
        if isinstance(val, UUID):
            val = str(val)
        elif hasattr(val, "value"):
            val = val.value
        elif isinstance(val, datetime):
            val = val.isoformat()
        out[col.key] = val
    return out
