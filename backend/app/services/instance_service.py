from datetime import datetime
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.display import resolve_display_name
from app.core.time import utc_now
from app.core.revision_guard import ensure_mutable_revision
from app.infrastructure.db.models.catalog import ConnectorTemplate, ConnectorTemplatePin
from app.infrastructure.db.models.instances import (
    ConnectorInstance,
    EnclosureInstance,
    PcbInstance,
    Pin,
)
from app.infrastructure.db.models.templates import (
    EnclosureTemplate,
    EnclosureTemplatePcbSlot,
    EnclosureTemplatePanelSlot,
    PcbTemplate,
    PcbTemplateConnectorSlot,
)
from app.schemas.instances import (
    ConnectorInstanceCreate,
    ConnectorInstanceResponse,
    EnclosureInstanceCreate,
    EnclosureInstanceResponse,
    PcbInstanceCreate,
    PcbInstanceResponse,
)
from app.services.short_service import ShortService


class InstanceService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def instantiate_enclosure(
        self,
        vehicle_id: UUID,
        revision_id: UUID,
        payload: EnclosureInstanceCreate,
    ) -> EnclosureInstanceResponse:
        await ensure_mutable_revision(self.db, revision_id, vehicle_id)
        template = await self.db.get(EnclosureTemplate, payload.enclosure_template_id)
        if not template or template.vehicle_id != vehicle_id:
            raise HTTPException(status_code=404, detail="Enclosure template not found")

        now = utc_now()
        instance = EnclosureInstance(
            revision_id=revision_id,
            vehicle_id=vehicle_id,
            enclosure_template_id=template.id,
            nickname=payload.nickname,
            use_template_name=payload.use_template_name,
            created_at=now,
        )
        self.db.add(instance)
        await self.db.flush()

        slots_result = await self.db.execute(
            select(EnclosureTemplatePanelSlot).where(
                EnclosureTemplatePanelSlot.enclosure_template_id == template.id
            )
        )
        pcb_slots_result = await self.db.execute(
            select(EnclosureTemplatePcbSlot).where(
                EnclosureTemplatePcbSlot.enclosure_template_id == template.id
            )
        )
        connector_ids: list[UUID] = []
        pcb_ids: list[UUID] = []
        for slot in slots_result.scalars().all():
            conn = await self._create_connector_from_slot(
                revision_id=revision_id,
                vehicle_id=vehicle_id,
                connector_template_id=slot.connector_template_id,
                enclosure_instance_id=instance.id,
                enclosure_panel_slot_id=slot.id,
                is_panel_mount=True,
                now=now,
            )
            connector_ids.append(conn.id)
        for pcb_slot in pcb_slots_result.scalars().all():
            pcb_response = await self.instantiate_pcb(
                vehicle_id=vehicle_id,
                revision_id=revision_id,
                payload=PcbInstanceCreate(
                    pcb_template_id=pcb_slot.pcb_template_id,
                    enclosure_instance_id=instance.id,
                ),
            )
            pcb_ids.append(pcb_response.id)
            connector_ids.extend(pcb_response.connector_instance_ids)

        display = resolve_display_name(
            template_name=template.name,
            nickname=payload.nickname,
            use_template_name=payload.use_template_name,
        )
        return EnclosureInstanceResponse(
            id=instance.id,
            revision_id=revision_id,
            vehicle_id=vehicle_id,
            display_name=display,
            nickname=payload.nickname,
            use_template_name=payload.use_template_name,
            created_at=now,
            enclosure_template_id=template.id,
            connector_instance_ids=connector_ids,
            pcb_instance_ids=pcb_ids,
        )

    async def instantiate_pcb(
        self,
        vehicle_id: UUID,
        revision_id: UUID,
        payload: PcbInstanceCreate,
    ) -> PcbInstanceResponse:
        await ensure_mutable_revision(self.db, revision_id, vehicle_id)
        template = await self.db.get(PcbTemplate, payload.pcb_template_id)
        if not template or template.vehicle_id != vehicle_id:
            raise HTTPException(status_code=404, detail="PCB template not found")

        if payload.enclosure_instance_id:
            enc = await self.db.get(EnclosureInstance, payload.enclosure_instance_id)
            if not enc or enc.revision_id != revision_id:
                raise HTTPException(status_code=404, detail="Enclosure instance not found")

        now = utc_now()
        instance = PcbInstance(
            revision_id=revision_id,
            vehicle_id=vehicle_id,
            pcb_template_id=template.id,
            enclosure_instance_id=payload.enclosure_instance_id,
            nickname=payload.nickname,
            use_template_name=payload.use_template_name,
            created_at=now,
        )
        self.db.add(instance)
        await self.db.flush()

        slots_result = await self.db.execute(
            select(PcbTemplateConnectorSlot).where(PcbTemplateConnectorSlot.pcb_template_id == template.id)
        )
        connector_ids: list[UUID] = []
        for slot in slots_result.scalars().all():
            conn = await self._create_connector_from_slot(
                revision_id=revision_id,
                vehicle_id=vehicle_id,
                connector_template_id=slot.connector_template_id,
                pcb_instance_id=instance.id,
                pcb_template_slot_id=slot.id,
                enclosure_instance_id=payload.enclosure_instance_id,
                is_panel_mount=bool(slot.export_to_enclosure),
                role=slot.default_role,
                source_pcb_template_slot_id=slot.id if slot.export_to_enclosure else None,
                source_pcb_instance_id=instance.id if slot.export_to_enclosure else None,
                pin_origin_note="Exposed from PCB connector slot" if slot.export_to_enclosure else None,
                now=now,
            )
            connector_ids.append(conn.id)

        display = resolve_display_name(
            template_name=template.name,
            nickname=payload.nickname,
            use_template_name=payload.use_template_name,
        )
        return PcbInstanceResponse(
            id=instance.id,
            revision_id=revision_id,
            vehicle_id=vehicle_id,
            display_name=display,
            nickname=payload.nickname,
            use_template_name=payload.use_template_name,
            created_at=now,
            pcb_template_id=template.id,
            enclosure_instance_id=payload.enclosure_instance_id,
            connector_instance_ids=connector_ids,
        )

    async def create_connector(
        self,
        vehicle_id: UUID,
        revision_id: UUID,
        payload: ConnectorInstanceCreate,
    ) -> ConnectorInstanceResponse:
        await ensure_mutable_revision(self.db, revision_id, vehicle_id)
        template = await self.db.get(ConnectorTemplate, payload.connector_template_id)
        if not template:
            raise HTTPException(status_code=404, detail="Connector template not found")
        if payload.inline_gender is not None and not template.is_inline_template:
            raise HTTPException(
                status_code=400,
                detail="Inline gender can only be set for inline connector templates",
            )
        if payload.is_panel_mount and payload.inline_gender is not None:
            raise HTTPException(
                status_code=400,
                detail="Panel mount connectors cannot specify inline gender",
            )
        inline_gender = payload.inline_gender
        if template.is_inline_template and inline_gender is None:
            raise HTTPException(
                status_code=400,
                detail="Inline connector templates require inline gender",
            )

        now = utc_now()
        instance = ConnectorInstance(
            revision_id=revision_id,
            vehicle_id=vehicle_id,
            connector_template_id=template.id,
            enclosure_instance_id=payload.enclosure_instance_id,
            pcb_instance_id=payload.pcb_instance_id,
            is_panel_mount=payload.is_panel_mount,
            inline_gender=inline_gender,
            nickname=payload.nickname,
            use_template_name=payload.use_template_name,
            role=payload.role or template.default_role,
            created_at=now,
        )
        self.db.add(instance)
        await self.db.flush()
        pin_ids = await self._spawn_pins(revision_id, instance.id, template.id)
        await ShortService(self.db).apply_template_shorts_to_instance(
            revision_id, instance.id, template.id, vehicle_id
        )

        display = resolve_display_name(
            template_name=template.name,
            nickname=payload.nickname,
            use_template_name=payload.use_template_name,
        )
        return ConnectorInstanceResponse(
            id=instance.id,
            revision_id=revision_id,
            vehicle_id=vehicle_id,
            display_name=display,
            nickname=payload.nickname,
            use_template_name=payload.use_template_name,
            created_at=now,
            connector_template_id=template.id,
            pcb_instance_id=payload.pcb_instance_id,
            enclosure_instance_id=payload.enclosure_instance_id,
            source_pcb_template_slot_id=instance.source_pcb_template_slot_id,
            source_pcb_instance_id=instance.source_pcb_instance_id,
            pin_origin_note=instance.pin_origin_note,
            is_panel_mount=payload.is_panel_mount,
            inline_gender=instance.inline_gender,
            role=instance.role,
            pin_ids=pin_ids,
        )

    async def list_enclosures(self, revision_id: UUID) -> list[EnclosureInstanceResponse]:
        result = await self.db.execute(
            select(EnclosureInstance).where(EnclosureInstance.revision_id == revision_id)
        )
        items = []
        for enc in result.scalars().all():
            template = await self.db.get(EnclosureTemplate, enc.enclosure_template_id)
            conns = await self._connector_ids_for_enclosure(enc.id)
            pcbs = await self._pcb_ids_for_enclosure(enc.id)
            items.append(
                EnclosureInstanceResponse(
                    id=enc.id,
                    revision_id=enc.revision_id,
                    vehicle_id=enc.vehicle_id,
                    display_name=resolve_display_name(
                        template_name=template.name if template else "?",
                        nickname=enc.nickname,
                        use_template_name=enc.use_template_name,
                    ),
                    nickname=enc.nickname,
                    use_template_name=enc.use_template_name,
                    created_at=enc.created_at,
                    enclosure_template_id=enc.enclosure_template_id,
                    connector_instance_ids=conns,
                    pcb_instance_ids=pcbs,
                )
            )
        return items

    async def _create_connector_from_slot(
        self,
        *,
        revision_id: UUID,
        vehicle_id: UUID,
        connector_template_id: UUID,
        now: datetime,
        pcb_instance_id: UUID | None = None,
        enclosure_instance_id: UUID | None = None,
        pcb_template_slot_id: UUID | None = None,
        enclosure_panel_slot_id: UUID | None = None,
        is_panel_mount: bool = False,
        role=None,
        source_pcb_template_slot_id: UUID | None = None,
        source_pcb_instance_id: UUID | None = None,
        pin_origin_note: str | None = None,
    ) -> ConnectorInstance:
        template = await self.db.get(ConnectorTemplate, connector_template_id)
        if not template:
            raise HTTPException(status_code=404, detail="Connector template not found")
        instance = ConnectorInstance(
            revision_id=revision_id,
            vehicle_id=vehicle_id,
            connector_template_id=connector_template_id,
            pcb_instance_id=pcb_instance_id,
            enclosure_instance_id=enclosure_instance_id,
            pcb_template_slot_id=pcb_template_slot_id,
            enclosure_panel_slot_id=enclosure_panel_slot_id,
            source_pcb_template_slot_id=source_pcb_template_slot_id,
            source_pcb_instance_id=source_pcb_instance_id,
            pin_origin_note=pin_origin_note,
            is_panel_mount=is_panel_mount,
            use_template_name=True,
            role=role or template.default_role,
            created_at=now,
        )
        self.db.add(instance)
        await self.db.flush()
        await self._spawn_pins(revision_id, instance.id, connector_template_id)
        await ShortService(self.db).apply_template_shorts_to_instance(
            revision_id, instance.id, connector_template_id, vehicle_id
        )
        return instance

    async def _spawn_pins(self, revision_id: UUID, connector_instance_id: UUID, template_id: UUID) -> list[UUID]:
        result = await self.db.execute(
            select(ConnectorTemplatePin)
            .where(ConnectorTemplatePin.connector_template_id == template_id)
            .order_by(ConnectorTemplatePin.pin_number)
        )
        pin_ids: list[UUID] = []
        for tp in result.scalars().all():
            pin = Pin(
                revision_id=revision_id,
                connector_instance_id=connector_instance_id,
                connector_template_pin_id=tp.id,
                pin_number=tp.pin_number,
                name=tp.name,
                role=tp.role,
            )
            self.db.add(pin)
            await self.db.flush()
            pin_ids.append(pin.id)
        return pin_ids

    async def _connector_ids_for_enclosure(self, enclosure_id: UUID) -> list[UUID]:
        result = await self.db.execute(
            select(ConnectorInstance.id).where(ConnectorInstance.enclosure_instance_id == enclosure_id)
        )
        return list(result.scalars().all())

    async def _pcb_ids_for_enclosure(self, enclosure_id: UUID) -> list[UUID]:
        result = await self.db.execute(
            select(PcbInstance.id).where(PcbInstance.enclosure_instance_id == enclosure_id)
        )
        return list(result.scalars().all())
