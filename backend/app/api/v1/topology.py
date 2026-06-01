from uuid import UUID

from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.auth_context import UserContext, get_optional_user_context
from app.schemas.topology import (
    ConnectionEdgeCreate,
    ConnectionEdgeResponse,
    ConnectionEdgeUpdate,
    TopologySummary,
)
from app.services.topology_service import TopologyService

router = APIRouter(prefix="/vehicles/{vehicle_id}/revisions/{revision_id}/topology", tags=["topology"])


@router.get("/summary", response_model=TopologySummary)
async def topology_summary(
    vehicle_id: UUID, revision_id: UUID, db: AsyncSession = Depends(get_db)
) -> TopologySummary:
    _ = vehicle_id
    return await TopologyService(db).summary(revision_id)


@router.get("/edges", response_model=list[ConnectionEdgeResponse])
async def list_edges(
    vehicle_id: UUID, revision_id: UUID, db: AsyncSession = Depends(get_db)
) -> list[ConnectionEdgeResponse]:
    _ = vehicle_id
    return await TopologyService(db).list_edges(revision_id)


@router.post("/edges", response_model=ConnectionEdgeResponse, status_code=201)
async def create_edge(
    vehicle_id: UUID,
    revision_id: UUID,
    payload: ConnectionEdgeCreate,
    db: AsyncSession = Depends(get_db),
) -> ConnectionEdgeResponse:
    return await TopologyService(db).create_edge(vehicle_id, revision_id, payload)


@router.patch("/edges/{edge_id}", response_model=ConnectionEdgeResponse)
async def update_edge(
    vehicle_id: UUID,
    revision_id: UUID,
    edge_id: UUID,
    payload: ConnectionEdgeUpdate,
    db: AsyncSession = Depends(get_db),
    user: UserContext | None = Depends(get_optional_user_context),
) -> ConnectionEdgeResponse:
    _ = user
    return await TopologyService(db).update_edge(vehicle_id, revision_id, edge_id, payload)


@router.delete("/edges/{edge_id}", status_code=204)
async def delete_edge(
    vehicle_id: UUID,
    revision_id: UUID,
    edge_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> Response:
    await TopologyService(db).delete_edge(vehicle_id, revision_id, edge_id)
    return Response(status_code=204)
