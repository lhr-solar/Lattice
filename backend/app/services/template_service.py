from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError
from app.domains.connectors.export import (
    supports_enclosure_panel_template,
    supports_node_slot_template,
)
from app.domains.connectors.pin_mapping import normalize_pin_mapping
from app.infra.db.models.catalog import ConnectorTemplate
from app.infra.db.models.instances import EnclosureInstance, PcbInstance
from app.infra.db.models.vehicle import Revision
from app.infra.db.models.templates import (
    EnclosureTemplate,
    EnclosureTemplatePcbSlot,
    EnclosureTemplatePanelSlot,
    PcbTemplate,
    PcbTemplateConnectorSlot,
)
from app.schemas.templates import (
    EnclosureTemplateCreate,
    EnclosureTemplateUpdate,
    EnclosurePcbSlotResponse,
    EnclosureTemplateResponse,
    PanelSlotResponse,
    PcbSlotResponse,
    PcbTemplateCreate,
    PcbTemplateUpdate,
    PcbTemplateResponse,
    PinMappingEntry,
)
from app.services.connector_reconcile_service import ConnectorReconcileService
from app.services.revision_sync_service import RevisionSyncService


class TemplateService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_pcb_template(self, vehicle_id: UUID, payload: PcbTemplateCreate) -> PcbTemplateResponse:
        template = PcbTemplate(vehicle_id=vehicle_id, name=payload.name, description=payload.description)
        self.db.add(template)
        await self.db.flush()
        for slot in payload.slots:
            await self._validate_node_slot_connector(slot.connector_template_id, slot.slot_key)
            self.db.add(
                PcbTemplateConnectorSlot(
                    pcb_template_id=template.id,
                    slot_key=slot.slot_key,
                    connector_template_id=slot.connector_template_id,
                    position_index=slot.position_index,
                    default_role=slot.default_role,
                    export_to_enclosure=slot.export_to_enclosure,
                    nickname=slot.nickname,
                    description=slot.description,
                    pin_mapping=normalize_pin_mapping(slot.pin_mapping),
                )
            )
        await self.db.flush()
        return await self.get_pcb_template(template.id)

    async def update_pcb_template(
        self, vehicle_id: UUID, template_id: UUID, payload: PcbTemplateUpdate
    ) -> PcbTemplateResponse:
        template = await self.db.get(PcbTemplate, template_id)
        if not template or template.vehicle_id != vehicle_id:
            raise HTTPException(status_code=404, detail="PCB template not found")
        template.name = payload.name
        template.description = payload.description

        existing_result = await self.db.execute(
            select(PcbTemplateConnectorSlot).where(PcbTemplateConnectorSlot.pcb_template_id == template_id)
        )
        existing_slots = existing_result.scalars().all()
        existing_by_key = {slot.slot_key: slot for slot in existing_slots}
        requested_keys = {slot.slot_key for slot in payload.slots}

        for slot in payload.slots:
            await self._validate_node_slot_connector(slot.connector_template_id, slot.slot_key)
            current = existing_by_key.get(slot.slot_key)
            if current:
                current.connector_template_id = slot.connector_template_id
                current.position_index = slot.position_index
                current.default_role = slot.default_role
                current.export_to_enclosure = slot.export_to_enclosure
                current.nickname = slot.nickname
                current.description = slot.description
                current.pin_mapping = normalize_pin_mapping(slot.pin_mapping)
                continue
            self.db.add(
                PcbTemplateConnectorSlot(
                    pcb_template_id=template.id,
                    slot_key=slot.slot_key,
                    connector_template_id=slot.connector_template_id,
                    position_index=slot.position_index,
                    default_role=slot.default_role,
                    export_to_enclosure=slot.export_to_enclosure,
                    nickname=slot.nickname,
                    description=slot.description,
                    pin_mapping=normalize_pin_mapping(slot.pin_mapping),
                )
            )

        for slot in existing_slots:
            if slot.slot_key in requested_keys:
                continue
            await ConnectorReconcileService(self.db).remove_instances_for_pcb_template_slot(
                slot.id, slot_key=slot.slot_key
            )
            await self.db.delete(slot)

        await self.db.flush()
        await ConnectorReconcileService(self.db).sync_pcb_template_instances(template.id)
        await self._notify_template_change(vehicle_id, template.id, kind="pcb")
        return await self.get_pcb_template(template.id)

    async def list_pcb_templates(self, vehicle_id: UUID) -> list[PcbTemplateResponse]:
        result = await self.db.execute(
            select(PcbTemplate).where(PcbTemplate.vehicle_id == vehicle_id).order_by(PcbTemplate.name)
        )
        templates = result.scalars().all()
        return [await self.get_pcb_template(t.id) for t in templates]

    async def delete_pcb_template(self, vehicle_id: UUID, template_id: UUID) -> None:
        template = await self.db.get(PcbTemplate, template_id)
        if not template or template.vehicle_id != vehicle_id:
            raise HTTPException(status_code=404, detail="PCB template not found")
        try:
            await self.db.delete(template)
            await self.db.flush()
        except IntegrityError as exc:
            raise HTTPException(status_code=409, detail="PCB template is in use and cannot be deleted") from exc

    async def get_pcb_template(self, template_id: UUID) -> PcbTemplateResponse:
        result = await self.db.execute(
            select(PcbTemplate, PcbTemplateConnectorSlot)
            .outerjoin(PcbTemplateConnectorSlot, PcbTemplateConnectorSlot.pcb_template_id == PcbTemplate.id)
            .where(PcbTemplate.id == template_id)
        )
        rows = result.all()
        if not rows:
            raise HTTPException(status_code=404, detail="PCB template not found")
        template = rows[0][0]
        slots = [r[1] for r in rows if r[1] is not None]
        slots_map: dict[UUID, PcbTemplateConnectorSlot] = {s.id: s for s in slots}
        return PcbTemplateResponse(
            id=template.id,
            vehicle_id=template.vehicle_id,
            name=template.name,
            description=template.description,
            slots=[
                PcbSlotResponse(
                    id=s.id,
                    slot_key=s.slot_key,
                    connector_template_id=s.connector_template_id,
                    position_index=s.position_index,
                    default_role=s.default_role,
                    export_to_enclosure=s.export_to_enclosure,
                    nickname=s.nickname,
                    description=s.description,
                    pin_mapping=[
                        PinMappingEntry(**row) for row in normalize_pin_mapping(s.pin_mapping)
                    ],
                )
                for s in slots_map.values()
            ],
            created_at=template.created_at,
            updated_at=template.updated_at,
        )

    async def create_enclosure_template(
        self, vehicle_id: UUID, payload: EnclosureTemplateCreate
    ) -> EnclosureTemplateResponse:
        for pcb_slot in payload.pcb_slots:
            pcb_template = await self.db.get(PcbTemplate, pcb_slot.pcb_template_id)
            if not pcb_template or pcb_template.vehicle_id != vehicle_id:
                raise HTTPException(status_code=404, detail="PCB template not found")
        template = EnclosureTemplate(vehicle_id=vehicle_id, name=payload.name)
        self.db.add(template)
        await self.db.flush()
        for slot in payload.slots:
            await self._validate_enclosure_panel_connector(slot.connector_template_id, slot.slot_key)
            self.db.add(
                EnclosureTemplatePanelSlot(
                    enclosure_template_id=template.id,
                    slot_key=slot.slot_key,
                    connector_template_id=slot.connector_template_id,
                    panel_side=slot.panel_side,
                    pin_mapping=normalize_pin_mapping(slot.pin_mapping),
                )
            )
        for pcb_slot in payload.pcb_slots:
            self.db.add(
                EnclosureTemplatePcbSlot(
                    enclosure_template_id=template.id,
                    slot_key=pcb_slot.slot_key,
                    pcb_template_id=pcb_slot.pcb_template_id,
                    position_index=pcb_slot.position_index,
                )
            )
        await self.db.flush()
        return await self.get_enclosure_template(template.id)

    async def update_enclosure_template(
        self, vehicle_id: UUID, template_id: UUID, payload: EnclosureTemplateUpdate
    ) -> EnclosureTemplateResponse:
        for pcb_slot in payload.pcb_slots:
            pcb_template = await self.db.get(PcbTemplate, pcb_slot.pcb_template_id)
            if not pcb_template or pcb_template.vehicle_id != vehicle_id:
                raise HTTPException(status_code=404, detail="PCB template not found")

        template = await self.db.get(EnclosureTemplate, template_id)
        if not template or template.vehicle_id != vehicle_id:
            raise HTTPException(status_code=404, detail="Enclosure template not found")
        template.name = payload.name

        existing_panels_result = await self.db.execute(
            select(EnclosureTemplatePanelSlot).where(
                EnclosureTemplatePanelSlot.enclosure_template_id == template_id
            )
        )
        existing_panel_slots = existing_panels_result.scalars().all()
        existing_panels_by_key = {slot.slot_key: slot for slot in existing_panel_slots}
        requested_panel_keys = {slot.slot_key for slot in payload.slots}

        existing_pcbs_result = await self.db.execute(
            select(EnclosureTemplatePcbSlot).where(
                EnclosureTemplatePcbSlot.enclosure_template_id == template_id
            )
        )
        existing_pcb_slots = existing_pcbs_result.scalars().all()
        existing_pcbs_by_key = {slot.slot_key: slot for slot in existing_pcb_slots}
        requested_pcb_keys = {slot.slot_key for slot in payload.pcb_slots}

        for slot in payload.slots:
            await self._validate_enclosure_panel_connector(slot.connector_template_id, slot.slot_key)
            current = existing_panels_by_key.get(slot.slot_key)
            if current:
                current.connector_template_id = slot.connector_template_id
                current.panel_side = slot.panel_side
                current.pin_mapping = normalize_pin_mapping(slot.pin_mapping)
                continue
            self.db.add(
                EnclosureTemplatePanelSlot(
                    enclosure_template_id=template.id,
                    slot_key=slot.slot_key,
                    connector_template_id=slot.connector_template_id,
                    panel_side=slot.panel_side,
                    pin_mapping=normalize_pin_mapping(slot.pin_mapping),
                )
            )
        for pcb_slot in payload.pcb_slots:
            current = existing_pcbs_by_key.get(pcb_slot.slot_key)
            if current:
                current.pcb_template_id = pcb_slot.pcb_template_id
                current.position_index = pcb_slot.position_index
                continue
            self.db.add(
                EnclosureTemplatePcbSlot(
                    enclosure_template_id=template.id,
                    slot_key=pcb_slot.slot_key,
                    pcb_template_id=pcb_slot.pcb_template_id,
                    position_index=pcb_slot.position_index,
                )
            )

        for slot in existing_panel_slots:
            if slot.slot_key in requested_panel_keys:
                continue
            await ConnectorReconcileService(self.db).remove_instances_for_enclosure_panel_slot(
                slot.id, slot_key=slot.slot_key
            )
            await self.db.delete(slot)

        for slot in existing_pcb_slots:
            if slot.slot_key in requested_pcb_keys:
                continue
            await self.db.delete(slot)

        await self.db.flush()
        await ConnectorReconcileService(self.db).sync_enclosure_panel_instances(template.id)
        await self._notify_template_change(vehicle_id, template.id, kind="enclosure")
        return await self.get_enclosure_template(template.id)

    async def list_enclosure_templates(self, vehicle_id: UUID) -> list[EnclosureTemplateResponse]:
        result = await self.db.execute(
            select(EnclosureTemplate).where(EnclosureTemplate.vehicle_id == vehicle_id).order_by(EnclosureTemplate.name)
        )
        return [await self.get_enclosure_template(t.id) for t in result.scalars().all()]

    async def delete_enclosure_template(self, vehicle_id: UUID, template_id: UUID) -> None:
        template = await self.db.get(EnclosureTemplate, template_id)
        if not template or template.vehicle_id != vehicle_id:
            raise HTTPException(status_code=404, detail="Enclosure template not found")
        try:
            await self.db.delete(template)
            await self.db.flush()
        except IntegrityError as exc:
            raise HTTPException(
                status_code=409,
                detail="Enclosure template is in use and cannot be deleted",
            ) from exc

    async def get_enclosure_template(self, template_id: UUID) -> EnclosureTemplateResponse:
        result = await self.db.execute(
            select(EnclosureTemplate, EnclosureTemplatePanelSlot, EnclosureTemplatePcbSlot)
            .outerjoin(
                EnclosureTemplatePanelSlot,
                EnclosureTemplatePanelSlot.enclosure_template_id == EnclosureTemplate.id,
            )
            .outerjoin(
                EnclosureTemplatePcbSlot,
                EnclosureTemplatePcbSlot.enclosure_template_id == EnclosureTemplate.id,
            )
            .where(EnclosureTemplate.id == template_id)
        )
        rows = result.all()
        if not rows:
            raise HTTPException(status_code=404, detail="Enclosure template not found")
        template = rows[0][0]
        slots = {r[1].id: r[1] for r in rows if r[1] is not None}
        pcb_slots = {r[2].id: r[2] for r in rows if r[2] is not None}
        return EnclosureTemplateResponse(
            id=template.id,
            vehicle_id=template.vehicle_id,
            name=template.name,
            slots=[
                PanelSlotResponse(
                    id=s.id,
                    slot_key=s.slot_key,
                    connector_template_id=s.connector_template_id,
                    panel_side=s.panel_side,
                    pin_mapping=[
                        PinMappingEntry(**row) for row in normalize_pin_mapping(s.pin_mapping)
                    ],
                )
                for s in slots.values()
            ],
            pcb_slots=[
                EnclosurePcbSlotResponse(
                    id=s.id,
                    slot_key=s.slot_key,
                    pcb_template_id=s.pcb_template_id,
                    position_index=s.position_index,
                )
                for s in pcb_slots.values()
            ],
            created_at=template.created_at,
            updated_at=template.updated_at,
        )

    async def _notify_template_change(
        self,
        vehicle_id: UUID,
        template_id: UUID,
        *,
        kind: str,
    ) -> None:
        if kind == "pcb":
            rows = (
                await self.db.execute(
                    select(PcbInstance.revision_id)
                    .join(Revision, PcbInstance.revision_id == Revision.id)
                    .where(
                        PcbInstance.vehicle_id == vehicle_id,
                        PcbInstance.pcb_template_id == template_id,
                        Revision.is_immutable.is_(False),
                    )
                    .distinct()
                )
            ).all()
        else:
            rows = (
                await self.db.execute(
                    select(EnclosureInstance.revision_id)
                    .join(Revision, EnclosureInstance.revision_id == Revision.id)
                    .where(
                        EnclosureInstance.vehicle_id == vehicle_id,
                        EnclosureInstance.enclosure_template_id == template_id,
                        Revision.is_immutable.is_(False),
                    )
                    .distinct()
                )
            ).all()
        if not rows:
            return
        sync = RevisionSyncService(self.db)
        for (revision_id,) in rows:
            await sync.notify_domains(
                vehicle_id=vehicle_id,
                revision_id=revision_id,
                domains=[
                    "hierarchy",
                    "design-projection",
                    "connection-table",
                    "topology-summary",
                    "pins",
                    "nets",
                    "shorts",
                ],
            )

    async def _validate_enclosure_panel_connector(self, connector_template_id: UUID, slot_key: str) -> None:
        tmpl = await self.db.get(ConnectorTemplate, connector_template_id)
        if not tmpl:
            raise HTTPException(status_code=404, detail="Connector template not found")
        if not supports_enclosure_panel_template(tmpl):
            raise HTTPException(
                status_code=400,
                detail=(
                    f'Enclosure panel slot "{slot_key}" only accepts wire-to-wire panel-mount connector templates'
                ),
            )

    async def _validate_node_slot_connector(self, connector_template_id: UUID, slot_key: str) -> None:
        tmpl = await self.db.get(ConnectorTemplate, connector_template_id)
        if not tmpl:
            raise HTTPException(status_code=404, detail="Connector template not found")
        if not supports_node_slot_template(tmpl):
            raise HTTPException(
                status_code=400,
                detail=(
                    f'Node slot "{slot_key}" only accepts wire-to-board connector templates'
                ),
            )
