from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.schemas.instances import (
    ConnectorInstanceCreate,
    ConnectorInstanceResponse,
    EnclosureInstanceCreate,
    EnclosureInstanceResponse,
    PinResponse,
    PinUpdate,
    PcbInstanceCreate,
    PcbInstanceResponse,
)
from app.services.instance_service import InstanceService

router = APIRouter(prefix="/vehicles/{vehicle_id}/revisions/{revision_id}/instances", tags=["instances"])


@router.get("/enclosures", response_model=list[EnclosureInstanceResponse])
async def list_enclosures(
    vehicle_id: UUID, revision_id: UUID, db: AsyncSession = Depends(get_db)
) -> list[EnclosureInstanceResponse]:
    _ = vehicle_id
    return await InstanceService(db).list_enclosures(revision_id)


@router.post("/enclosures", response_model=EnclosureInstanceResponse, status_code=201)
async def create_enclosure(
    vehicle_id: UUID,
    revision_id: UUID,
    payload: EnclosureInstanceCreate,
    db: AsyncSession = Depends(get_db),
) -> EnclosureInstanceResponse:
    return await InstanceService(db).instantiate_enclosure(vehicle_id, revision_id, payload)


@router.post("/pcbs", response_model=PcbInstanceResponse, status_code=201)
async def create_pcb(
    vehicle_id: UUID,
    revision_id: UUID,
    payload: PcbInstanceCreate,
    db: AsyncSession = Depends(get_db),
) -> PcbInstanceResponse:
    return await InstanceService(db).instantiate_pcb(vehicle_id, revision_id, payload)


@router.post("/connectors", response_model=ConnectorInstanceResponse, status_code=201)
async def create_connector(
    vehicle_id: UUID,
    revision_id: UUID,
    payload: ConnectorInstanceCreate,
    db: AsyncSession = Depends(get_db),
) -> ConnectorInstanceResponse:
    return await InstanceService(db).create_connector(vehicle_id, revision_id, payload)


@router.patch("/connectors/{connector_instance_id}/pins/{pin_id}", response_model=PinResponse)
async def update_pin(
    vehicle_id: UUID,
    revision_id: UUID,
    connector_instance_id: UUID,
    pin_id: UUID,
    payload: PinUpdate,
    db: AsyncSession = Depends(get_db),
) -> PinResponse:
    return await InstanceService(db).update_pin(
        vehicle_id,
        revision_id,
        connector_instance_id,
        pin_id,
        payload,
    )
