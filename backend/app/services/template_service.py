from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.infrastructure.db.models.templates import (
    EnclosureTemplate,
    EnclosureTemplatePanelSlot,
    PcbTemplate,
    PcbTemplateConnectorSlot,
)
from app.schemas.templates import (
    EnclosureTemplateCreate,
    EnclosureTemplateResponse,
    PanelSlotResponse,
    PcbSlotResponse,
    PcbTemplateCreate,
    PcbTemplateResponse,
)


class TemplateService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_pcb_template(self, vehicle_id: UUID, payload: PcbTemplateCreate) -> PcbTemplateResponse:
        template = PcbTemplate(vehicle_id=vehicle_id, name=payload.name, description=payload.description)
        self.db.add(template)
        await self.db.flush()
        for slot in payload.slots:
            self.db.add(
                PcbTemplateConnectorSlot(
                    pcb_template_id=template.id,
                    slot_key=slot.slot_key,
                    connector_template_id=slot.connector_template_id,
                    position_index=slot.position_index,
                    default_role=slot.default_role,
                )
            )
        await self.db.flush()
        return await self.get_pcb_template(template.id)

    async def list_pcb_templates(self, vehicle_id: UUID) -> list[PcbTemplateResponse]:
        result = await self.db.execute(
            select(PcbTemplate).where(PcbTemplate.vehicle_id == vehicle_id).order_by(PcbTemplate.name)
        )
        templates = result.scalars().all()
        return [await self.get_pcb_template(t.id) for t in templates]

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
                )
                for s in slots_map.values()
            ],
            created_at=template.created_at,
            updated_at=template.updated_at,
        )

    async def create_enclosure_template(
        self, vehicle_id: UUID, payload: EnclosureTemplateCreate
    ) -> EnclosureTemplateResponse:
        template = EnclosureTemplate(vehicle_id=vehicle_id, name=payload.name)
        self.db.add(template)
        await self.db.flush()
        for slot in payload.slots:
            self.db.add(
                EnclosureTemplatePanelSlot(
                    enclosure_template_id=template.id,
                    slot_key=slot.slot_key,
                    connector_template_id=slot.connector_template_id,
                    panel_side=slot.panel_side,
                )
            )
        await self.db.flush()
        return await self.get_enclosure_template(template.id)

    async def list_enclosure_templates(self, vehicle_id: UUID) -> list[EnclosureTemplateResponse]:
        result = await self.db.execute(
            select(EnclosureTemplate).where(EnclosureTemplate.vehicle_id == vehicle_id).order_by(EnclosureTemplate.name)
        )
        return [await self.get_enclosure_template(t.id) for t in result.scalars().all()]

    async def get_enclosure_template(self, template_id: UUID) -> EnclosureTemplateResponse:
        result = await self.db.execute(
            select(EnclosureTemplate, EnclosureTemplatePanelSlot)
            .outerjoin(
                EnclosureTemplatePanelSlot,
                EnclosureTemplatePanelSlot.enclosure_template_id == EnclosureTemplate.id,
            )
            .where(EnclosureTemplate.id == template_id)
        )
        rows = result.all()
        if not rows:
            raise HTTPException(status_code=404, detail="Enclosure template not found")
        template = rows[0][0]
        slots = {r[1].id: r[1] for r in rows if r[1] is not None}
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
                )
                for s in slots.values()
            ],
            created_at=template.created_at,
            updated_at=template.updated_at,
        )
