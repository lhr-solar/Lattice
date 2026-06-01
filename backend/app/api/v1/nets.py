from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.schemas.nets import (
    NetCreate,
    NetDeleteResult,
    NetDetail,
    NetPinInfo,
    NetSummary,
    NetUpdate,
    PinPairRequest,
    PinPairResponse,
)
from app.services.net_service import NetService

router = APIRouter(prefix="/vehicles/{vehicle_id}/revisions/{revision_id}/nets", tags=["nets"])


@router.get("", response_model=list[NetSummary])
async def list_nets(
    vehicle_id: UUID,
    revision_id: UUID,
    search: str | None = Query(default=None),
    auto_named_only: bool | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> list[NetSummary]:
    _ = vehicle_id
    return await NetService(db).list_nets(revision_id, search=search, auto_named_only=auto_named_only)


@router.post("", response_model=NetDetail, status_code=201)
async def create_net(
    vehicle_id: UUID,
    revision_id: UUID,
    payload: NetCreate,
    db: AsyncSession = Depends(get_db),
) -> NetDetail:
    return await NetService(db).create_net(vehicle_id, revision_id, payload)


@router.get("/pins", response_model=list[NetPinInfo])
async def list_pins(
    vehicle_id: UUID,
    revision_id: UUID,
    connector_instance_id: UUID | None = Query(default=None),
    search: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> list[NetPinInfo]:
    _ = vehicle_id
    return await NetService(db).list_pins(revision_id, connector_instance_id, search)


@router.post("/pair", response_model=PinPairResponse)
async def pair_pins(
    vehicle_id: UUID,
    revision_id: UUID,
    payload: PinPairRequest,
    db: AsyncSession = Depends(get_db),
) -> PinPairResponse:
    return await NetService(db).pair_pins(vehicle_id, revision_id, payload)


@router.get("/{net_id}", response_model=NetDetail)
async def get_net(
    vehicle_id: UUID,
    revision_id: UUID,
    net_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> NetDetail:
    _ = vehicle_id
    return await NetService(db).get_net(revision_id, net_id)


@router.patch("/{net_id}", response_model=NetDetail)
async def update_net(
    vehicle_id: UUID,
    revision_id: UUID,
    net_id: UUID,
    payload: NetUpdate,
    db: AsyncSession = Depends(get_db),
) -> NetDetail:
    return await NetService(db).update_net(vehicle_id, revision_id, net_id, payload)


@router.delete("/{net_id}", response_model=NetDeleteResult)
async def delete_net(
    vehicle_id: UUID,
    revision_id: UUID,
    net_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> NetDeleteResult:
    return await NetService(db).delete_net(vehicle_id, revision_id, net_id)


@router.post("/{net_id}/pins/{pin_id}", response_model=NetDetail)
async def add_pin_to_net(
    vehicle_id: UUID,
    revision_id: UUID,
    net_id: UUID,
    pin_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> NetDetail:
    return await NetService(db).assign_pin_to_net(vehicle_id, revision_id, net_id, pin_id)
