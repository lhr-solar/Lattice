from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.schemas.pin_templates import PinTemplateCreate, PinTemplateResponse, PinTemplateUpdate
from app.services.pin_template_service import PinTemplateService

router = APIRouter(prefix="/vehicles/{vehicle_id}/pin-templates", tags=["pin-templates"])


@router.get("", response_model=list[PinTemplateResponse])
async def list_pin_templates(
    vehicle_id: UUID,
    connector_template_id: UUID | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> list[PinTemplateResponse]:
    return await PinTemplateService(db).list_templates(
        vehicle_id, connector_template_id=connector_template_id
    )


@router.post("", response_model=PinTemplateResponse, status_code=201)
async def create_pin_template(
    vehicle_id: UUID,
    payload: PinTemplateCreate,
    db: AsyncSession = Depends(get_db),
) -> PinTemplateResponse:
    return await PinTemplateService(db).create_template(vehicle_id, payload)


@router.get("/{template_id}", response_model=PinTemplateResponse)
async def get_pin_template(
    vehicle_id: UUID,
    template_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> PinTemplateResponse:
    return await PinTemplateService(db).get_template(vehicle_id, template_id)


@router.patch("/{template_id}", response_model=PinTemplateResponse)
async def update_pin_template(
    vehicle_id: UUID,
    template_id: UUID,
    payload: PinTemplateUpdate,
    db: AsyncSession = Depends(get_db),
) -> PinTemplateResponse:
    return await PinTemplateService(db).update_template(vehicle_id, template_id, payload)


@router.delete("/{template_id}", status_code=204)
async def delete_pin_template(
    vehicle_id: UUID,
    template_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> None:
    await PinTemplateService(db).delete_template(vehicle_id, template_id)
    return None
