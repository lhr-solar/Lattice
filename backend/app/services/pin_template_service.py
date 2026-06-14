from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import exists, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.infra.db.models.catalog import ConnectorTemplate
from app.infra.db.models.pin_templates import PinTemplate, PinTemplateConnector, PinTemplatePin
from app.schemas.pin_templates import (
    PinTemplateCreate,
    PinTemplatePinResponse,
    PinTemplateResponse,
    PinTemplateUpdate,
)


class PinTemplateService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_templates(
        self, vehicle_id: UUID, *, connector_template_id: UUID | None = None
    ) -> list[PinTemplateResponse]:
        q = (
            select(PinTemplate)
            .options(
                selectinload(PinTemplate.connectors),
                selectinload(PinTemplate.pins),
            )
            .where(PinTemplate.vehicle_id == vehicle_id)
            .order_by(PinTemplate.name)
        )
        if connector_template_id is not None:
            q = q.where(
                exists(
                    select(1).where(
                        PinTemplateConnector.pin_template_id == PinTemplate.id,
                        PinTemplateConnector.connector_template_id == connector_template_id,
                    )
                )
            )
        result = await self.db.execute(q)
        return [self._to_response(t) for t in result.scalars().unique().all()]

    async def create_template(self, vehicle_id: UUID, payload: PinTemplateCreate) -> PinTemplateResponse:
        pin_count = await self._resolve_pin_count(payload.connector_template_ids)
        self._validate_pins(payload.pins, pin_count)
        template = PinTemplate(vehicle_id=vehicle_id, name=payload.name.strip(), pin_count=pin_count)
        self.db.add(template)
        await self.db.flush()
        await self._sync_connectors(template.id, payload.connector_template_ids)
        await self._sync_pins(template.id, payload.pins, pin_count)
        await self.db.flush()
        loaded = await self._load(template.id)
        return self._to_response(loaded)

    async def update_template(
        self, vehicle_id: UUID, template_id: UUID, payload: PinTemplateUpdate
    ) -> PinTemplateResponse:
        template = await self._get_or_404(vehicle_id, template_id)
        pin_count = await self._resolve_pin_count(payload.connector_template_ids)
        self._validate_pins(payload.pins, pin_count)
        template.name = payload.name.strip()
        template.pin_count = pin_count
        await self._sync_connectors(template.id, payload.connector_template_ids)
        await self._sync_pins(template.id, payload.pins, pin_count)
        await self.db.flush()
        loaded = await self._load(template.id)
        return self._to_response(loaded)

    async def delete_template(self, vehicle_id: UUID, template_id: UUID) -> None:
        template = await self._get_or_404(vehicle_id, template_id)
        try:
            await self.db.delete(template)
            await self.db.flush()
        except IntegrityError as exc:
            raise HTTPException(status_code=409, detail="Pin template is in use and cannot be deleted") from exc

    async def get_template(self, vehicle_id: UUID, template_id: UUID) -> PinTemplateResponse:
        template = await self._get_or_404(vehicle_id, template_id)
        loaded = await self._load(template.id)
        return self._to_response(loaded)

    async def _resolve_pin_count(self, connector_template_ids: list[UUID]) -> int:
        if not connector_template_ids:
            raise HTTPException(status_code=422, detail="At least one connector template is required")
        result = await self.db.execute(
            select(ConnectorTemplate).where(ConnectorTemplate.id.in_(connector_template_ids))
        )
        templates = result.scalars().all()
        if len(templates) != len(set(connector_template_ids)):
            raise HTTPException(status_code=404, detail="One or more connector templates not found")
        return min(t.pin_count for t in templates)

    def _validate_pins(self, pins: list, pin_count: int) -> None:
        seen: set[int] = set()
        for pin in pins:
            if pin.pin_number < 1 or pin.pin_number > pin_count:
                raise HTTPException(
                    status_code=422,
                    detail=f"Pin number {pin.pin_number} is out of range (1–{pin_count})",
                )
            if pin.pin_number in seen:
                raise HTTPException(status_code=422, detail=f"Duplicate pin number {pin.pin_number}")
            seen.add(pin.pin_number)
            if pin.name is not None and not pin.name.strip():
                raise HTTPException(
                    status_code=422,
                    detail=f"Pin {pin.pin_number} name must be non-empty or omitted",
                )

    async def _sync_connectors(self, template_id: UUID, connector_template_ids: list[UUID]) -> None:
        existing = (
            await self.db.execute(
                select(PinTemplateConnector).where(PinTemplateConnector.pin_template_id == template_id)
            )
        ).scalars().all()
        existing_ids = {row.connector_template_id for row in existing}
        requested_ids = set(connector_template_ids)
        for row in existing:
            if row.connector_template_id not in requested_ids:
                await self.db.delete(row)
        for connector_id in requested_ids - existing_ids:
            self.db.add(PinTemplateConnector(pin_template_id=template_id, connector_template_id=connector_id))

    async def _sync_pins(self, template_id: UUID, pins: list, pin_count: int) -> None:
        existing = (
            await self.db.execute(select(PinTemplatePin).where(PinTemplatePin.pin_template_id == template_id))
        ).scalars().all()
        existing_by_number = {row.pin_number: row for row in existing}
        requested_numbers = {pin.pin_number for pin in pins}
        for pin_payload in pins:
            name = pin_payload.name.strip() if pin_payload.name else None
            current = existing_by_number.get(pin_payload.pin_number)
            if current:
                current.name = name
                continue
            self.db.add(
                PinTemplatePin(
                    pin_template_id=template_id,
                    pin_number=pin_payload.pin_number,
                    name=name,
                )
            )
        for row in existing:
            if row.pin_number not in requested_numbers:
                await self.db.delete(row)

    async def _get_or_404(self, vehicle_id: UUID, template_id: UUID) -> PinTemplate:
        template = await self.db.get(PinTemplate, template_id)
        if not template or template.vehicle_id != vehicle_id:
            raise HTTPException(status_code=404, detail="Pin template not found")
        return template

    async def _load(self, template_id: UUID) -> PinTemplate:
        result = await self.db.execute(
            select(PinTemplate)
            .options(
                selectinload(PinTemplate.connectors),
                selectinload(PinTemplate.pins),
            )
            .where(PinTemplate.id == template_id)
        )
        template = result.scalar_one()
        return template

    def _to_response(self, template: PinTemplate) -> PinTemplateResponse:
        return PinTemplateResponse(
            id=template.id,
            vehicle_id=template.vehicle_id,
            name=template.name,
            pin_count=template.pin_count,
            connector_template_ids=[c.connector_template_id for c in template.connectors],
            pins=[
                PinTemplatePinResponse(pin_number=p.pin_number, name=p.name)
                for p in sorted(template.pins, key=lambda row: row.pin_number)
            ],
            created_at=template.created_at,
            updated_at=template.updated_at,
        )
