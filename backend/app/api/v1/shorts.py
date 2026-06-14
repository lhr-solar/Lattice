from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.auth_context import UserContext, get_current_user
from app.schemas.shorts import PinShortCreate, PinShortResponse, TemplatePinShortCreate
from app.services.short_service import ShortService

router = APIRouter(tags=["shorts"])


@router.get(
    "/vehicles/{vehicle_id}/revisions/{revision_id}/instances/connectors/{connector_instance_id}/shorts",
    response_model=list[PinShortResponse],
)
async def list_pin_shorts(
    vehicle_id: UUID,
    revision_id: UUID,
    connector_instance_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> list[PinShortResponse]:
    _ = vehicle_id
    return await ShortService(db).list_instance_shorts(revision_id, connector_instance_id)


@router.post(
    "/vehicles/{vehicle_id}/revisions/{revision_id}/instances/connectors/{connector_instance_id}/shorts",
    response_model=PinShortResponse,
    status_code=201,
)
async def create_pin_short(
    vehicle_id: UUID,
    revision_id: UUID,
    connector_instance_id: UUID,
    payload: PinShortCreate,
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user),
) -> PinShortResponse:
    return await ShortService(db).create_instance_short(
        vehicle_id, revision_id, connector_instance_id, payload, changed_by=user.username
    )


@router.delete(
    "/vehicles/{vehicle_id}/revisions/{revision_id}/instances/connectors/{connector_instance_id}/shorts/{short_id}",
    status_code=204,
)
async def delete_pin_short(
    vehicle_id: UUID,
    revision_id: UUID,
    connector_instance_id: UUID,
    short_id: UUID,
    expected_edit_sequence: int | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user),
) -> None:
    _ = connector_instance_id
    await ShortService(db).delete_instance_short(
        vehicle_id,
        revision_id,
        short_id,
        expected_edit_sequence=expected_edit_sequence,
        changed_by=user.username,
    )


@router.post("/connector-templates/{template_id}/shorts")
async def add_template_pin_short(
    template_id: UUID,
    payload: TemplatePinShortCreate,
    db: AsyncSession = Depends(get_db),
) -> dict:
    return await ShortService(db).add_template_short(template_id, payload)
