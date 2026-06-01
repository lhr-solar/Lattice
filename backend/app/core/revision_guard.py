from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.db.models.vehicle import Revision


async def get_revision_or_404(db: AsyncSession, revision_id: UUID, vehicle_id: UUID | None = None) -> Revision:
    revision = await db.get(Revision, revision_id)
    if not revision:
        raise HTTPException(status_code=404, detail="Revision not found")
    if vehicle_id and revision.vehicle_id != vehicle_id:
        raise HTTPException(status_code=404, detail="Revision not found for vehicle")
    return revision


async def ensure_mutable_revision(db: AsyncSession, revision_id: UUID, vehicle_id: UUID | None = None) -> Revision:
    revision = await get_revision_or_404(db, revision_id, vehicle_id)
    if revision.is_immutable:
        raise HTTPException(status_code=409, detail="Revision is immutable and cannot be modified")
    return revision
