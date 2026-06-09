from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.auth_context import UserContext, get_current_user
from app.schemas.connections import (
    AssignNetByNameRequest,
    ConnectionScopesResponse,
    ConnectionTableResponse,
    ConnectPinsRequest,
    ConnectPinsResult,
)
from app.services.connection_service import ConnectionService

router = APIRouter(
    prefix="/vehicles/{vehicle_id}/revisions/{revision_id}/connections", tags=["connections"]
)


@router.get("/scopes", response_model=ConnectionScopesResponse)
async def list_scopes(
    vehicle_id: UUID, revision_id: UUID, db: AsyncSession = Depends(get_db)
) -> ConnectionScopesResponse:
    _ = vehicle_id
    return ConnectionScopesResponse(scopes=await ConnectionService(db).list_scopes(revision_id))


@router.get("/table", response_model=ConnectionTableResponse)
async def connection_table(
    vehicle_id: UUID,
    revision_id: UUID,
    connector_instance_id: UUID | None = Query(default=None),
    pcb_instance_id: UUID | None = Query(default=None),
    enclosure_instance_id: UUID | None = Query(default=None),
    vehicle_level: bool = Query(default=False),
    search: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> ConnectionTableResponse:
    _ = vehicle_id
    rows = await ConnectionService(db).build_table(
        revision_id,
        connector_instance_id=connector_instance_id,
        pcb_instance_id=pcb_instance_id,
        enclosure_instance_id=enclosure_instance_id,
        vehicle_level=vehicle_level,
        search=search,
    )
    return ConnectionTableResponse(rows=rows)


@router.post("/connect", response_model=ConnectPinsResult)
async def connect_pins(
    vehicle_id: UUID,
    revision_id: UUID,
    payload: ConnectPinsRequest,
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user),
) -> ConnectPinsResult:
    return await ConnectionService(db).connect_pins(
        vehicle_id, revision_id, payload, changed_by=user.username
    )


@router.delete("/edges/{edge_id}", status_code=204)
async def disconnect(
    vehicle_id: UUID,
    revision_id: UUID,
    edge_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user),
) -> Response:
    await ConnectionService(db).disconnect(
        vehicle_id, revision_id, edge_id, changed_by=user.username
    )
    return Response(status_code=204)


@router.put("/pins/{pin_id}/net")
async def assign_net_by_name(
    vehicle_id: UUID,
    revision_id: UUID,
    pin_id: UUID,
    payload: AssignNetByNameRequest,
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user),
) -> dict:
    return await ConnectionService(db).assign_net_by_name(
        vehicle_id, revision_id, pin_id, payload, changed_by=user.username
    )
