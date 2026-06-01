from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.schemas.graph import ImpactAnalysisRequest, ImpactAnalysisResponse, TraceRequest, TraceResponse
from app.services.graph_service import GraphService

router = APIRouter(tags=["graph"])


@router.post(
    "/vehicles/{vehicle_id}/revisions/{revision_id}/graph/impact-analysis",
    response_model=ImpactAnalysisResponse,
)
async def impact_analysis(
    vehicle_id: UUID,
    revision_id: UUID,
    request: ImpactAnalysisRequest,
    db: AsyncSession = Depends(get_db),
) -> ImpactAnalysisResponse:
    _ = vehicle_id
    return await GraphService(db).impact_analysis(revision_id, request)


@router.post(
    "/vehicles/{vehicle_id}/revisions/{revision_id}/graph/trace",
    response_model=TraceResponse,
)
async def trace_signal(
    vehicle_id: UUID,
    revision_id: UUID,
    request: TraceRequest,
    db: AsyncSession = Depends(get_db),
) -> TraceResponse:
    _ = vehicle_id
    return await GraphService(db).trace_pin(revision_id, request.pin_id, request.signal_id)
