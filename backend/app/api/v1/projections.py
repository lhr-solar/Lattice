from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.schemas.projections import DesignGraphProjectionDto, ProjectionLevel
from app.services.projection_service import ProjectionService

router = APIRouter(tags=["projections"])


@router.get(
    "/vehicles/{vehicle_id}/revisions/{revision_id}/projections/design",
    response_model=DesignGraphProjectionDto,
)
async def get_design_projection(
    vehicle_id: UUID,
    revision_id: UUID,
    level: ProjectionLevel = Query(default="vehicle"),
    view_key: str | None = Query(default=None),
    focus_id: UUID | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> DesignGraphProjectionDto:
    _ = vehicle_id
    key = view_key or f"{level}:{focus_id or 'root'}"
    return await ProjectionService(db).build_design_projection(revision_id, level, key, focus_id)
