from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import delete, select, update
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
from app.infra.db.models.pin_names import PinNameLibraryEntry
from app.infra.db.models.pin_templates import PinTemplate
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

    def _vehicle_response(
        self,
        vehicle: Vehicle,
        current_revision_id: UUID | None,
        revision_number: int | None = None,
        revision_label: str | None = None,
    ) -> VehicleResponse:
        return VehicleResponse(
            id=vehicle.id,
            name=vehicle.name,
            description=vehicle.description,
            current_revision_id=current_revision_id,
            current_revision_number=revision_number,
            current_revision_label=revision_label,
            created_at=vehicle.created_at,
            updated_at=vehicle.updated_at,
        )

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

        return self._vehicle_response(
            vehicle,
            revision.id,
            revision.revision_number,
            revision.label,
        )

    async def list_vehicles(self) -> list[VehicleResponse]:
        result = await self.db.execute(
            select(
                Vehicle,
                VehicleHead.current_revision_id,
                Revision.revision_number,
                Revision.label,
            )
            .outerjoin(VehicleHead, VehicleHead.vehicle_id == Vehicle.id)
            .outerjoin(Revision, Revision.id == VehicleHead.current_revision_id)
            .order_by(Vehicle.name)
        )
        return [
            self._vehicle_response(v, rev_id, rev_num, rev_label)
            for v, rev_id, rev_num, rev_label in result.all()
        ]

    async def get_vehicle(self, vehicle_id: UUID) -> VehicleResponse | None:
        result = await self.db.execute(
            select(
                Vehicle,
                VehicleHead.current_revision_id,
                Revision.revision_number,
                Revision.label,
            )
            .outerjoin(VehicleHead, VehicleHead.vehicle_id == Vehicle.id)
            .outerjoin(Revision, Revision.id == VehicleHead.current_revision_id)
            .where(Vehicle.id == vehicle_id)
        )
        row = result.one_or_none()
        if not row:
            return None
        v, rev_id, rev_num, rev_label = row
        return self._vehicle_response(v, rev_id, rev_num, rev_label)

    async def update_vehicle(self, vehicle_id: UUID, payload: VehicleUpdate) -> VehicleResponse:
        vehicle = await self.db.get(Vehicle, vehicle_id)
        if not vehicle:
            raise HTTPException(status_code=404, detail="Vehicle not found")
        vehicle.name = payload.name.strip()
        await self.db.flush()
        return await self.get_vehicle(vehicle_id)  # type: ignore[return-value]

    async def clear_vehicle_wires(self, vehicle_id: UUID) -> None:
        vehicle = await self.db.get(Vehicle, vehicle_id)
        if not vehicle:
            raise HTTPException(status_code=404, detail="Vehicle not found")

        revision_ids = await self._revision_ids_for_vehicle(vehicle_id)
        if revision_ids:
            await self._delete_revision_wire_data(revision_ids)
        await self.db.flush()

    async def clear_vehicle_topology(self, vehicle_id: UUID) -> None:
        vehicle = await self.db.get(Vehicle, vehicle_id)
        if not vehicle:
            raise HTTPException(status_code=404, detail="Vehicle not found")

        head = await self.db.get(VehicleHead, vehicle_id)
        if not head or not head.current_revision_id:
            raise HTTPException(status_code=404, detail="No current revision for vehicle")

        revision_id = head.current_revision_id
        await self._delete_revision_wire_data([revision_id])
        await self._delete_revision_instances([revision_id])
        await self.db.flush()

    async def clear_vehicle_revisions(self, vehicle_id: UUID, *, created_by: str | None = None) -> None:
        vehicle = await self.db.get(Vehicle, vehicle_id)
        if not vehicle:
            raise HTTPException(status_code=404, detail="Vehicle not found")

        head = await self.db.get(VehicleHead, vehicle_id)
        current_revision_id = head.current_revision_id if head else None
        all_revision_ids = await self._revision_ids_for_vehicle(vehicle_id)

        if not all_revision_ids:
            revision = Revision(
                vehicle_id=vehicle.id,
                revision_number=1,
                status=RevisionStatus.DRAFT,
                label="Draft",
                is_immutable=False,
                created_by=created_by,
                created_at=utc_now(),
            )
            self.db.add(revision)
            await self.db.flush()
            if head:
                head.current_revision_id = revision.id
            else:
                self.db.add(VehicleHead(vehicle_id=vehicle.id, current_revision_id=revision.id))
            await self.db.flush()
            return

        if not current_revision_id or current_revision_id not in all_revision_ids:
            await self.db.execute(delete(VehicleHead).where(VehicleHead.vehicle_id == vehicle_id))
            if all_revision_ids:
                await self._delete_revisions(all_revision_ids)
            revision = Revision(
                vehicle_id=vehicle.id,
                revision_number=1,
                status=RevisionStatus.DRAFT,
                label="Draft",
                is_immutable=False,
                created_by=created_by,
                created_at=utc_now(),
            )
            self.db.add(revision)
            await self.db.flush()
            self.db.add(VehicleHead(vehicle_id=vehicle.id, current_revision_id=revision.id))
            await self.db.flush()
            return

        current = await self.db.get(Revision, current_revision_id)
        if not current:
            raise HTTPException(status_code=404, detail="Current revision not found")

        current.parent_revision_id = None
        await self.db.flush()

        old_revision_ids = [rid for rid in all_revision_ids if rid != current_revision_id]
        if old_revision_ids:
            await self._delete_revisions(old_revision_ids)

        current.revision_number = 1
        current.label = "Draft"
        current.is_immutable = False
        current.snapshot_taken_at = None
        current.status = RevisionStatus.DRAFT
        await self.db.flush()

    async def clear_vehicle_data(self, vehicle_id: UUID, *, created_by: str | None = None) -> None:
        vehicle = await self.db.get(Vehicle, vehicle_id)
        if not vehicle:
            raise HTTPException(status_code=404, detail="Vehicle not found")

        revision_ids = await self._revision_ids_for_vehicle(vehicle_id)
        await self.db.execute(delete(VehicleHead).where(VehicleHead.vehicle_id == vehicle_id))
        if revision_ids:
            await self._delete_revisions(revision_ids)
        await self._delete_vehicle_libraries(vehicle_id)

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
        revision_ids = await self._revision_ids_for_vehicle(vehicle_id)
        await self.db.execute(delete(VehicleHead).where(VehicleHead.vehicle_id == vehicle_id))
        if revision_ids:
            await self._delete_revisions(revision_ids)
        await self._delete_vehicle_libraries(vehicle_id)
        await self.db.execute(delete(Vehicle).where(Vehicle.id == vehicle_id))
        await self.db.flush()

    async def _revision_ids_for_vehicle(self, vehicle_id: UUID) -> list[UUID]:
        return list(
            (
                await self.db.execute(select(Revision.id).where(Revision.vehicle_id == vehicle_id))
            ).scalars()
        )

    async def _break_revision_parent_links(self, revision_ids: list[UUID]) -> None:
        if not revision_ids:
            return
        await self.db.execute(
            update(Revision)
            .where(Revision.id.in_(revision_ids))
            .values(parent_revision_id=None)
        )
        await self.db.execute(
            update(Revision)
            .where(Revision.parent_revision_id.in_(revision_ids))
            .values(parent_revision_id=None)
        )
        await self.db.flush()

    async def _delete_revisions(self, revision_ids: list[UUID]) -> None:
        if not revision_ids:
            return
        await self._break_revision_parent_links(revision_ids)
        await self._delete_revision_scoped_data(revision_ids)
        await self.db.execute(delete(Revision).where(Revision.id.in_(revision_ids)))

    async def _delete_revision_scoped_data(self, revision_ids: list[UUID]) -> None:
        await self._delete_revision_wire_data(revision_ids)
        await self._delete_revision_instances(revision_ids)
        await self._delete_revision_metadata(revision_ids)

    async def _delete_revision_wire_data(self, revision_ids: list[UUID]) -> None:
        # Delete wire/topology rows first because many FK columns do not use DB-level cascade.
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

    async def _delete_revision_instances(self, revision_ids: list[UUID]) -> None:
        await self.db.execute(delete(Pin).where(Pin.revision_id.in_(revision_ids)))
        await self.db.execute(
            delete(ConnectorInstance).where(ConnectorInstance.revision_id.in_(revision_ids))
        )
        await self.db.execute(delete(PcbInstance).where(PcbInstance.revision_id.in_(revision_ids)))
        await self.db.execute(
            delete(EnclosureInstance).where(EnclosureInstance.revision_id.in_(revision_ids))
        )
        await self.db.execute(delete(NodeLayout).where(NodeLayout.revision_id.in_(revision_ids)))

    async def _delete_revision_metadata(self, revision_ids: list[UUID]) -> None:
        await self.db.execute(delete(SavedView).where(SavedView.revision_id.in_(revision_ids)))
        await self.db.execute(
            delete(RevisionSnapshot).where(RevisionSnapshot.revision_id.in_(revision_ids))
        )
        await self.db.execute(delete(RevisionChange).where(RevisionChange.revision_id.in_(revision_ids)))

    async def _delete_vehicle_libraries(self, vehicle_id: UUID) -> None:
        await self._delete_vehicle_templates(vehicle_id)
        await self.db.execute(delete(PinTemplate).where(PinTemplate.vehicle_id == vehicle_id))
        await self.db.execute(
            delete(PinNameLibraryEntry).where(PinNameLibraryEntry.vehicle_id == vehicle_id)
        )

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
