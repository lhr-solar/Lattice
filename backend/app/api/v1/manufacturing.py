from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.auth_context import UserContext, get_current_user
from app.schemas.manufacturing import (
    ContinuityCheckCreate,
    ContinuityCheckResponse,
    EdgeManufacturingUpdate,
    HarnessGroupResponse,
    ManufacturingProjectionResponse,
    ManufacturingRecordCreate,
    ManufacturingRecordResponse,
    ManufacturingRecordUpdate,
    WireRow,
    WireTableResponse,
)
from app.services.manufacturing_service import ManufacturingService

router = APIRouter(
    prefix="/vehicles/{vehicle_id}/revisions/{revision_id}/manufacturing",
    tags=["manufacturing"],
)


@router.get("/projection", response_model=ManufacturingProjectionResponse)
async def manufacturing_projection(
    vehicle_id: UUID, revision_id: UUID, db: AsyncSession = Depends(get_db)
) -> ManufacturingProjectionResponse:
    return await ManufacturingService(db).get_projection(vehicle_id, revision_id)


@router.post("/harness-groups/sync", response_model=list[HarnessGroupResponse])
async def sync_harness_groups(
    vehicle_id: UUID, revision_id: UUID, db: AsyncSession = Depends(get_db)
) -> list[HarnessGroupResponse]:
    return await ManufacturingService(db).sync_harness_groups(vehicle_id, revision_id)


@router.post("/records", response_model=ManufacturingRecordResponse, status_code=201)
async def create_record(
    vehicle_id: UUID,
    revision_id: UUID,
    payload: ManufacturingRecordCreate,
    db: AsyncSession = Depends(get_db),
) -> ManufacturingRecordResponse:
    _ = vehicle_id
    return await ManufacturingService(db).create_record(vehicle_id, revision_id, payload)


@router.patch("/records/{record_id}", response_model=ManufacturingRecordResponse)
async def update_record(
    vehicle_id: UUID,
    revision_id: UUID,
    record_id: UUID,
    payload: ManufacturingRecordUpdate,
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user),
) -> ManufacturingRecordResponse:
    _ = vehicle_id
    return await ManufacturingService(db).update_record(
        revision_id, record_id, payload, user.username
    )


@router.post(
    "/records/{record_id}/continuity-checks",
    response_model=ContinuityCheckResponse,
    status_code=201,
)
async def add_continuity_check(
    vehicle_id: UUID,
    revision_id: UUID,
    record_id: UUID,
    payload: ContinuityCheckCreate,
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user),
) -> ContinuityCheckResponse:
    _ = vehicle_id
    return await ManufacturingService(db).add_continuity_check(
        revision_id, record_id, payload, user.username
    )


@router.get("/wire-table", response_model=WireTableResponse)
async def wire_table(
    vehicle_id: UUID,
    revision_id: UUID,
    connector_instance_id: UUID | None = Query(default=None),
    pcb_instance_id: UUID | None = Query(default=None),
    enclosure_instance_id: UUID | None = Query(default=None),
    vehicle_level: bool = Query(default=False),
    search: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> WireTableResponse:
    return await ManufacturingService(db).build_wire_table(
        vehicle_id,
        revision_id,
        connector_instance_id=connector_instance_id,
        pcb_instance_id=pcb_instance_id,
        enclosure_instance_id=enclosure_instance_id,
        vehicle_level=vehicle_level,
        search=search,
    )


@router.patch("/edges/{edge_id}/state", response_model=WireRow)
async def update_edge_manufacturing(
    vehicle_id: UUID,
    revision_id: UUID,
    edge_id: UUID,
    payload: EdgeManufacturingUpdate,
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user),
) -> WireRow:
    return await ManufacturingService(db).update_edge_manufacturing(
        vehicle_id, revision_id, edge_id, payload, user
    )
