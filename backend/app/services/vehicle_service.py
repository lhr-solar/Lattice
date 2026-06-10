from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import utc_now
from app.infra.db.models.instances import ConnectorInstance, EnclosureInstance, PcbInstance, Pin
from app.infra.db.models.layout import NodeLayout, SavedView
from app.infra.db.models.manufacturing import (
    ContinuityCheck,
    HarnessGroup,
    HarnessGroupEdge,
    ManufacturingRecord,
)
from app.infra.db.models.revision import RevisionChange, RevisionSnapshot
from app.infra.db.models.shorts import ConnectorInstancePinShort
from app.infra.db.models.templates import (
    EnclosureTemplate,
    EnclosureTemplatePcbSlot,
    EnclosureTemplatePanelSlot,
    PcbTemplate,
    PcbTemplateConnectorSlot,
)
from app.infra.db.models.topology import (
    ConnectionEdge,
    PinSignalAssignment,
    Signal,
    SpliceConnection,
    SpliceNode,
)
from app.infra.db.models.vehicle import Revision, Vehicle, VehicleHead
from app.infra.db.enums import RevisionStatus
from app.schemas.vehicles import VehicleCreate, VehicleResponse, VehicleUpdate


class VehicleService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_vehicle(self, payload: VehicleCreate, created_by: str | None) -> VehicleResponse:
        vehicle = Vehicle(name=payload.name, description=payload.description)
        self.db.add(vehicle)
        await self.db.flush()

        revision = Revision(
            vehicle_id=vehicle.id,
            revision_number=1,
            status=RevisionStatus.DRAFT,
            label="Initial draft",
            is_immutable=False,
            created_by=created_by,
            created_at=utc_now(),
        )
        self.db.add(revision)
        await self.db.flush()

        head = VehicleHead(vehicle_id=vehicle.id, current_revision_id=revision.id)
        self.db.add(head)
        await self.db.flush()

        return VehicleResponse(
            id=vehicle.id,
            name=vehicle.name,
            description=vehicle.description,
            current_revision_id=revision.id,
            created_at=vehicle.created_at,
            updated_at=vehicle.updated_at,
        )

    async def list_vehicles(self) -> list[VehicleResponse]:
        result = await self.db.execute(
            select(Vehicle, VehicleHead.current_revision_id)
            .outerjoin(VehicleHead, VehicleHead.vehicle_id == Vehicle.id)
            .order_by(Vehicle.name)
        )
        rows = result.all()
        return [
            VehicleResponse(
                id=v.id,
                name=v.name,
                description=v.description,
                current_revision_id=rev_id,
                created_at=v.created_at,
                updated_at=v.updated_at,
            )
            for v, rev_id in rows
        ]

    async def get_vehicle(self, vehicle_id: UUID) -> VehicleResponse | None:
        result = await self.db.execute(
            select(Vehicle, VehicleHead.current_revision_id)
            .outerjoin(VehicleHead, VehicleHead.vehicle_id == Vehicle.id)
            .where(Vehicle.id == vehicle_id)
        )
        row = result.one_or_none()
        if not row:
            return None
        v, rev_id = row
        return VehicleResponse(
            id=v.id,
            name=v.name,
            description=v.description,
            current_revision_id=rev_id,
            created_at=v.created_at,
            updated_at=v.updated_at,
        )

    async def update_vehicle(self, vehicle_id: UUID, payload: VehicleUpdate) -> VehicleResponse:
        vehicle = await self.db.get(Vehicle, vehicle_id)
        if not vehicle:
            raise HTTPException(status_code=404, detail="Vehicle not found")
        vehicle.name = payload.name.strip()
        await self.db.flush()
        return await self.get_vehicle(vehicle_id)  # type: ignore[return-value]

    async def clear_vehicle_data(self, vehicle_id: UUID, *, created_by: str | None = None) -> None:
        vehicle = await self.db.get(Vehicle, vehicle_id)
        if not vehicle:
            raise HTTPException(status_code=404, detail="Vehicle not found")

        revision_ids = list(
            (
                await self.db.execute(select(Revision.id).where(Revision.vehicle_id == vehicle_id))
            ).scalars()
        )
        if revision_ids:
            await self._delete_revision_scoped_data(revision_ids)

        await self.db.execute(delete(VehicleHead).where(VehicleHead.vehicle_id == vehicle_id))
        await self._delete_vehicle_templates(vehicle_id)
        await self.db.execute(delete(Revision).where(Revision.vehicle_id == vehicle_id))

        revision = Revision(
            vehicle_id=vehicle.id,
            revision_number=1,
            status=RevisionStatus.DRAFT,
            label="Initial draft",
            is_immutable=False,
            created_by=created_by,
            created_at=utc_now(),
        )
        self.db.add(revision)
        await self.db.flush()
        self.db.add(VehicleHead(vehicle_id=vehicle.id, current_revision_id=revision.id))
        await self.db.flush()

    async def delete_vehicle(self, vehicle_id: UUID) -> None:
        vehicle = await self.db.get(Vehicle, vehicle_id)
        if not vehicle:
            raise HTTPException(status_code=404, detail="Vehicle not found")
        revision_ids = list(
            (
                await self.db.execute(select(Revision.id).where(Revision.vehicle_id == vehicle_id))
            ).scalars()
        )

        if revision_ids:
            await self._delete_revision_scoped_data(revision_ids)

        await self.db.execute(delete(VehicleHead).where(VehicleHead.vehicle_id == vehicle_id))
        await self._delete_vehicle_templates(vehicle_id)
        await self.db.execute(delete(Revision).where(Revision.vehicle_id == vehicle_id))
        await self.db.execute(delete(Vehicle).where(Vehicle.id == vehicle_id))
        await self.db.flush()

    async def _delete_revision_scoped_data(self, revision_ids: list[UUID]) -> None:
        # Delete revision-scoped rows first because many FK columns do not use DB-level cascade.
        await self.db.execute(
            delete(HarnessGroupEdge).where(
                HarnessGroupEdge.connection_edge_id.in_(
                    select(ConnectionEdge.id).where(ConnectionEdge.revision_id.in_(revision_ids))
                )
            )
        )
        await self.db.execute(
            delete(HarnessGroupEdge).where(
                HarnessGroupEdge.harness_group_id.in_(
                    select(HarnessGroup.id).where(HarnessGroup.revision_id.in_(revision_ids))
                )
            )
        )
        await self.db.execute(
            delete(ContinuityCheck).where(
                ContinuityCheck.manufacturing_record_id.in_(
                    select(ManufacturingRecord.id).where(
                        ManufacturingRecord.revision_id.in_(revision_ids)
                    )
                )
            )
        )
        await self.db.execute(
            delete(ManufacturingRecord).where(ManufacturingRecord.revision_id.in_(revision_ids))
        )
        await self.db.execute(delete(HarnessGroup).where(HarnessGroup.revision_id.in_(revision_ids)))
        await self.db.execute(
            delete(ConnectorInstancePinShort).where(
                ConnectorInstancePinShort.revision_id.in_(revision_ids)
            )
        )
        await self.db.execute(
            delete(PinSignalAssignment).where(PinSignalAssignment.revision_id.in_(revision_ids))
        )
        await self.db.execute(
            delete(SpliceConnection).where(SpliceConnection.revision_id.in_(revision_ids))
        )
        await self.db.execute(delete(ConnectionEdge).where(ConnectionEdge.revision_id.in_(revision_ids)))
        await self.db.execute(delete(SpliceNode).where(SpliceNode.revision_id.in_(revision_ids)))
        await self.db.execute(delete(Signal).where(Signal.revision_id.in_(revision_ids)))
        await self.db.execute(delete(Pin).where(Pin.revision_id.in_(revision_ids)))
        await self.db.execute(
            delete(ConnectorInstance).where(ConnectorInstance.revision_id.in_(revision_ids))
        )
        await self.db.execute(delete(PcbInstance).where(PcbInstance.revision_id.in_(revision_ids)))
        await self.db.execute(
            delete(EnclosureInstance).where(EnclosureInstance.revision_id.in_(revision_ids))
        )
        await self.db.execute(delete(NodeLayout).where(NodeLayout.revision_id.in_(revision_ids)))
        await self.db.execute(delete(SavedView).where(SavedView.revision_id.in_(revision_ids)))
        await self.db.execute(
            delete(RevisionSnapshot).where(RevisionSnapshot.revision_id.in_(revision_ids))
        )
        await self.db.execute(delete(RevisionChange).where(RevisionChange.revision_id.in_(revision_ids)))

    async def _delete_vehicle_templates(self, vehicle_id: UUID) -> None:
        await self.db.execute(
            delete(PcbTemplateConnectorSlot).where(
                PcbTemplateConnectorSlot.pcb_template_id.in_(
                    select(PcbTemplate.id).where(PcbTemplate.vehicle_id == vehicle_id)
                )
            )
        )
        await self.db.execute(
            delete(EnclosureTemplatePanelSlot).where(
                EnclosureTemplatePanelSlot.enclosure_template_id.in_(
                    select(EnclosureTemplate.id).where(EnclosureTemplate.vehicle_id == vehicle_id)
                )
            )
        )
        await self.db.execute(
            delete(EnclosureTemplatePcbSlot).where(
                EnclosureTemplatePcbSlot.enclosure_template_id.in_(
                    select(EnclosureTemplate.id).where(EnclosureTemplate.vehicle_id == vehicle_id)
                )
            )
        )
        await self.db.execute(delete(PcbTemplate).where(PcbTemplate.vehicle_id == vehicle_id))
        await self.db.execute(delete(EnclosureTemplate).where(EnclosureTemplate.vehicle_id == vehicle_id))
