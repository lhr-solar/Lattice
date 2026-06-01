from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.schemas.hierarchy import VehicleHierarchyResponse
from app.services.hierarchy_service import HierarchyService

router = APIRouter(tags=["hierarchy"])


@router.get(
    "/vehicles/{vehicle_id}/revisions/{revision_id}/hierarchy",
    response_model=VehicleHierarchyResponse,
)
async def get_hierarchy(
    vehicle_id: UUID,
    revision_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> VehicleHierarchyResponse:
    return await HierarchyService(db).build_hierarchy(vehicle_id, revision_id)
