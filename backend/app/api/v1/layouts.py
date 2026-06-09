from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.revision_guard import ensure_mutable_revision
from app.infra.db.enums import EntityKind
from app.infra.db.models.layout import NodeLayout

router = APIRouter(prefix="/vehicles/{vehicle_id}/revisions/{revision_id}/layouts", tags=["layouts"])


class LayoutUpsert(BaseModel):
    view_key: str
    entity_kind: EntityKind
    entity_id: UUID
    x: float
    y: float
    collapsed: bool = False


class LayoutResponse(BaseModel):
    view_key: str
    entity_kind: EntityKind
    entity_id: UUID
    x: float
    y: float
    collapsed: bool


@router.get("", response_model=list[LayoutResponse])
async def list_layouts(
    vehicle_id: UUID,
    revision_id: UUID,
    view_key: str = "vehicle:root",
    db: AsyncSession = Depends(get_db),
) -> list[LayoutResponse]:
    _ = vehicle_id
    result = await db.execute(
        select(NodeLayout).where(NodeLayout.revision_id == revision_id, NodeLayout.view_key == view_key)
    )
    return [
        LayoutResponse(
            view_key=layout.view_key,
            entity_kind=layout.entity_kind,
            entity_id=layout.entity_id,
            x=layout.x,
            y=layout.y,
            collapsed=layout.collapsed,
        )
        for layout in result.scalars().all()
    ]


@router.put("/batch", response_model=list[LayoutResponse])
async def upsert_layouts(
    vehicle_id: UUID,
    revision_id: UUID,
    payloads: list[LayoutUpsert],
    db: AsyncSession = Depends(get_db),
) -> list[LayoutResponse]:
    await ensure_mutable_revision(db, revision_id, vehicle_id)
    responses: list[LayoutResponse] = []
    for p in payloads:
        stmt = (
            insert(NodeLayout)
            .values(
                revision_id=revision_id,
                view_key=p.view_key,
                entity_kind=p.entity_kind,
                entity_id=p.entity_id,
                x=p.x,
                y=p.y,
                collapsed=p.collapsed,
            )
            .on_conflict_do_update(
                index_elements=["revision_id", "view_key", "entity_kind", "entity_id"],
                set_={"x": p.x, "y": p.y, "collapsed": p.collapsed},
            )
        )
        await db.execute(stmt)
        responses.append(
            LayoutResponse(
                view_key=p.view_key,
                entity_kind=p.entity_kind,
                entity_id=p.entity_id,
                x=p.x,
                y=p.y,
                collapsed=p.collapsed,
            )
        )
    return responses
