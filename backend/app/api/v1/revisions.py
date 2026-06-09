from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.auth_context import UserContext, get_current_user
from app.schemas.revisions import RevisionDiffItem, RevisionListResponse, RevisionPublishResponse
from app.services.revision_service import RevisionService

router = APIRouter(prefix="/vehicles/{vehicle_id}/revisions", tags=["revisions"])


@router.get("", response_model=RevisionListResponse)
async def list_revisions(vehicle_id: UUID, db: AsyncSession = Depends(get_db)) -> RevisionListResponse:
    revisions = await RevisionService(db).list_revisions(vehicle_id)
    return RevisionListResponse(revisions=revisions)


@router.post("/{revision_id}/publish", response_model=RevisionPublishResponse)
async def publish_revision(
    vehicle_id: UUID,
    revision_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user),
) -> RevisionPublishResponse:
    published_by = user.username
    return await RevisionService(db).publish(vehicle_id, revision_id, published_by)


@router.get("/{revision_id}/changes", response_model=list[RevisionDiffItem])
async def list_revision_changes(
    vehicle_id: UUID,
    revision_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> list[RevisionDiffItem]:
    _ = vehicle_id
    return await RevisionService(db).list_changes(revision_id)
