from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.schemas.templates import (
    EnclosureTemplateCreate,
    EnclosureTemplateResponse,
    EnclosureTemplateUpdate,
    PcbTemplateCreate,
    PcbTemplateResponse,
    PcbTemplateUpdate,
)
from app.services.template_service import TemplateService

router = APIRouter(prefix="/vehicles/{vehicle_id}", tags=["templates"])


@router.get("/pcb-templates", response_model=list[PcbTemplateResponse])
async def list_pcb_templates(vehicle_id: UUID, db: AsyncSession = Depends(get_db)) -> list[PcbTemplateResponse]:
    return await TemplateService(db).list_pcb_templates(vehicle_id)


@router.post("/pcb-templates", response_model=PcbTemplateResponse, status_code=201)
async def create_pcb_template(
    vehicle_id: UUID,
    payload: PcbTemplateCreate,
    db: AsyncSession = Depends(get_db),
) -> PcbTemplateResponse:
    return await TemplateService(db).create_pcb_template(vehicle_id, payload)


@router.get("/pcb-templates/{template_id}", response_model=PcbTemplateResponse)
async def get_pcb_template(
    vehicle_id: UUID,
    template_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> PcbTemplateResponse:
    _ = vehicle_id
    return await TemplateService(db).get_pcb_template(template_id)


@router.patch("/pcb-templates/{template_id}", response_model=PcbTemplateResponse)
async def update_pcb_template(
    vehicle_id: UUID,
    template_id: UUID,
    payload: PcbTemplateUpdate,
    db: AsyncSession = Depends(get_db),
) -> PcbTemplateResponse:
    return await TemplateService(db).update_pcb_template(vehicle_id, template_id, payload)


@router.delete("/pcb-templates/{template_id}", status_code=204)
async def delete_pcb_template(
    vehicle_id: UUID,
    template_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> None:
    await TemplateService(db).delete_pcb_template(vehicle_id, template_id)
    return None


@router.get("/enclosure-templates", response_model=list[EnclosureTemplateResponse])
async def list_enclosure_templates(
    vehicle_id: UUID, db: AsyncSession = Depends(get_db)
) -> list[EnclosureTemplateResponse]:
    return await TemplateService(db).list_enclosure_templates(vehicle_id)


@router.post("/enclosure-templates", response_model=EnclosureTemplateResponse, status_code=201)
async def create_enclosure_template(
    vehicle_id: UUID,
    payload: EnclosureTemplateCreate,
    db: AsyncSession = Depends(get_db),
) -> EnclosureTemplateResponse:
    return await TemplateService(db).create_enclosure_template(vehicle_id, payload)


@router.get("/enclosure-templates/{template_id}", response_model=EnclosureTemplateResponse)
async def get_enclosure_template(
    vehicle_id: UUID,
    template_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> EnclosureTemplateResponse:
    _ = vehicle_id
    return await TemplateService(db).get_enclosure_template(template_id)


@router.patch("/enclosure-templates/{template_id}", response_model=EnclosureTemplateResponse)
async def update_enclosure_template(
    vehicle_id: UUID,
    template_id: UUID,
    payload: EnclosureTemplateUpdate,
    db: AsyncSession = Depends(get_db),
) -> EnclosureTemplateResponse:
    return await TemplateService(db).update_enclosure_template(vehicle_id, template_id, payload)


@router.delete("/enclosure-templates/{template_id}", status_code=204)
async def delete_enclosure_template(
    vehicle_id: UUID,
    template_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> None:
    await TemplateService(db).delete_enclosure_template(vehicle_id, template_id)
    return None
