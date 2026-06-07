from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

from app.api.deps import get_db
from app.infrastructure.db.enums import ConnectorGender
from app.infrastructure.db.models.catalog import ConnectorTemplate, ConnectorTemplatePin
from app.schemas.connector_templates import (
    ConnectorTemplateCreate,
    ConnectorTemplatePinResponse,
    ConnectorTemplateResponse,
    ConnectorTemplateUpdate,
)
from app.services.short_service import ShortService

router = APIRouter(prefix="/connector-templates", tags=["connector-templates"])


@router.get("", response_model=list[ConnectorTemplateResponse])
async def list_connector_templates(db: AsyncSession = Depends(get_db)) -> list[ConnectorTemplateResponse]:
    result = await db.execute(
        select(ConnectorTemplate).options(selectinload(ConnectorTemplate.pins)).order_by(ConnectorTemplate.name)
    )
    templates = result.scalars().all()
    return [_to_response(t) for t in templates]


@router.post("", response_model=ConnectorTemplateResponse, status_code=201)
async def create_connector_template(
    payload: ConnectorTemplateCreate,
    db: AsyncSession = Depends(get_db),
) -> ConnectorTemplateResponse:
    template = ConnectorTemplate(
        name=payload.name,
        manufacturer=payload.manufacturer,
        gender=ConnectorGender.UNKNOWN,
        pin_count=payload.pin_count,
        default_role=payload.default_role,
        male_part_number=payload.male_part_number,
        female_part_number=payload.female_part_number,
        male_crimp_part_number=payload.male_crimp_part_number,
        female_crimp_part_number=payload.female_crimp_part_number,
        male_image_url=payload.male_image_url,
        female_image_url=payload.female_image_url,
        key_code=payload.key_code,
        default_is_panel_mount=payload.default_is_panel_mount,
        is_inline_template=payload.is_inline_template,
    )
    db.add(template)
    await db.flush()

    for pin in payload.pins:
        db.add(
            ConnectorTemplatePin(
                connector_template_id=template.id,
                pin_number=pin.pin_number,
                name=pin.name,
                role=pin.role,
                signal_kind=pin.signal_kind,
            )
        )
    await db.flush()
    short_svc = ShortService(db)
    for ps in payload.pin_shorts:
        await short_svc.add_template_short(template.id, ps)
    await db.refresh(template, ["pins"])
    return _to_response(template)


@router.get("/{template_id}", response_model=ConnectorTemplateResponse)
async def get_connector_template(
    template_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> ConnectorTemplateResponse:
    result = await db.execute(
        select(ConnectorTemplate)
        .options(selectinload(ConnectorTemplate.pins))
        .where(ConnectorTemplate.id == template_id)
    )
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Connector template not found")
    return _to_response(template)


@router.patch("/{template_id}", response_model=ConnectorTemplateResponse)
async def update_connector_template(
    template_id: UUID,
    payload: ConnectorTemplateUpdate,
    db: AsyncSession = Depends(get_db),
) -> ConnectorTemplateResponse:
    template = await db.get(ConnectorTemplate, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Connector template not found")

    template.name = payload.name
    template.manufacturer = payload.manufacturer
    template.pin_count = payload.pin_count
    template.default_role = payload.default_role
    template.male_part_number = payload.male_part_number
    template.female_part_number = payload.female_part_number
    template.male_crimp_part_number = payload.male_crimp_part_number
    template.female_crimp_part_number = payload.female_crimp_part_number
    template.male_image_url = payload.male_image_url
    template.female_image_url = payload.female_image_url
    template.key_code = payload.key_code
    template.default_is_panel_mount = payload.default_is_panel_mount
    template.is_inline_template = payload.is_inline_template

    existing_pins = await db.execute(
        select(ConnectorTemplatePin).where(ConnectorTemplatePin.connector_template_id == template_id)
    )
    for pin in existing_pins.scalars().all():
        await db.delete(pin)
    await db.flush()

    for pin in payload.pins:
        db.add(
            ConnectorTemplatePin(
                connector_template_id=template.id,
                pin_number=pin.pin_number,
                name=pin.name,
                role=pin.role,
                signal_kind=pin.signal_kind,
            )
        )
    await db.flush()
    await db.refresh(template, ["pins"])
    return _to_response(template)


@router.delete("/{template_id}", status_code=204)
async def delete_connector_template(
    template_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> None:
    template = await db.get(ConnectorTemplate, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Connector template not found")
    try:
        await db.delete(template)
        await db.flush()
    except IntegrityError as exc:
        raise HTTPException(
            status_code=409,
            detail="Connector template is in use and cannot be deleted",
        ) from exc
    return None


def _to_response(template: ConnectorTemplate) -> ConnectorTemplateResponse:
    return ConnectorTemplateResponse(
        id=template.id,
        name=template.name,
        manufacturer=template.manufacturer,
        pin_count=template.pin_count,
        default_role=template.default_role,
        male_part_number=template.male_part_number,
        female_part_number=template.female_part_number,
        male_crimp_part_number=template.male_crimp_part_number,
        female_crimp_part_number=template.female_crimp_part_number,
        male_image_url=template.male_image_url,
        female_image_url=template.female_image_url,
        key_code=template.key_code,
        default_is_panel_mount=template.default_is_panel_mount,
        is_inline_template=template.is_inline_template,
        pins=[
            ConnectorTemplatePinResponse(
                id=p.id,
                pin_number=p.pin_number,
                name=p.name,
                role=p.role,
                signal_kind=p.signal_kind,
            )
            for p in template.pins
        ],
        created_at=template.created_at,
        updated_at=template.updated_at,
    )
