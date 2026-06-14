from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.auth_context import UserContext, get_current_user
from app.core.revision_guard import ensure_mutable_revision, get_revision_or_404
from app.infra.db.enums import EntityKind
from app.infra.db.models.layout import NodeLayout
from app.schemas.projections import TopologyGraphProjectionDto
from app.services.projection_service import ProjectionService
from app.services.revision_sync_service import DOMAINS_LAYOUT, RevisionSyncService

router = APIRouter(tags=["topology-graph"])

VIEW_KEY = "topology-graph:vehicle"


class TopologyLayoutRecord(BaseModel):
    entity_kind: EntityKind
    entity_id: UUID
    x: float
    y: float


def _to_node_positions(
    layouts: dict[str, tuple[float, float]],
) -> dict[str, tuple[float, float]]:
    """Translate ``_load_layouts`` keys into topology-graph node ids.

    ``ProjectionService._load_layouts`` returns a mapping keyed by
    ``"{entity_kind}:{entity_id}"`` (e.g. ``"enclosure_instance:{uuid}"``), but
    ``build_topology_graph_projection`` expects ``saved_positions`` keyed by the
    node id ``"tg-node:{entity_id}"``. Entity ids are UUIDs (no colons), so we
    split off the kind prefix and re-key by the node id.
    """
    positions: dict[str, tuple[float, float]] = {}
    for key, xy in layouts.items():
        entity_id = key.split(":", 1)[1]
        positions[f"tg-node:{entity_id}"] = xy
    return positions


@router.get(
    "/vehicles/{vehicle_id}/revisions/{revision_id}/topology-graph",
    response_model=TopologyGraphProjectionDto,
)
async def get_topology_graph(
    vehicle_id: UUID,
    revision_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> TopologyGraphProjectionDto:
    await get_revision_or_404(db, revision_id, vehicle_id)
    service = ProjectionService(db)
    layouts = await service._load_layouts(revision_id, VIEW_KEY)
    saved_positions = _to_node_positions(layouts)
    return await service.build_topology_graph_projection(revision_id, VIEW_KEY, saved_positions)


@router.patch(
    "/vehicles/{vehicle_id}/revisions/{revision_id}/topology-graph/layout",
    response_model=list[TopologyLayoutRecord],
)
async def patch_topology_layout(
    vehicle_id: UUID,
    revision_id: UUID,
    payloads: list[TopologyLayoutRecord],
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user),
) -> list[TopologyLayoutRecord]:
    await ensure_mutable_revision(db, revision_id, vehicle_id)
    for p in payloads:
        stmt = (
            insert(NodeLayout)
            .values(
                revision_id=revision_id,
                view_key=VIEW_KEY,
                entity_kind=p.entity_kind,
                entity_id=p.entity_id,
                x=p.x,
                y=p.y,
            )
            .on_conflict_do_update(
                index_elements=["revision_id", "view_key", "entity_kind", "entity_id"],
                set_={"x": p.x, "y": p.y},
            )
        )
        await db.execute(stmt)
    if payloads:
        await RevisionSyncService(db).bump_and_notify(
            vehicle_id=vehicle_id,
            revision_id=revision_id,
            domains=DOMAINS_LAYOUT,
            changed_by=user.username,
        )
    return payloads
