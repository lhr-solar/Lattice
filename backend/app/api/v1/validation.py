from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.domains.validation.engine import ValidationEngine
from app.schemas.validation import ValidationRunResponse
from app.services.graph_service import GraphService

router = APIRouter(tags=["validation"])


@router.post(
    "/vehicles/{vehicle_id}/revisions/{revision_id}/validation/run",
    response_model=ValidationRunResponse,
)
async def run_validation(
    vehicle_id: UUID,
    revision_id: UUID,
    mode: str = "design",
    db: AsyncSession = Depends(get_db),
) -> ValidationRunResponse:
    _ = vehicle_id
    graph = await GraphService(db).load_graph(revision_id)
    return ValidationEngine().run(revision_id, graph, mode=mode)
