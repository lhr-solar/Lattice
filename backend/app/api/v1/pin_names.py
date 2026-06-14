from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.schemas.pin_names import PinNameEntryCreate, PinNameEntryResponse, PinNameEntryUpdate
from app.services.pin_name_service import PinNameService

router = APIRouter(prefix="/vehicles/{vehicle_id}/pin-name-library", tags=["pin-names"])


@router.get("", response_model=list[PinNameEntryResponse])
async def list_pin_name_entries(
    vehicle_id: UUID,
    search: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> list[PinNameEntryResponse]:
    return await PinNameService(db).list_entries(vehicle_id, search)


@router.post("", response_model=PinNameEntryResponse, status_code=201)
async def create_pin_name_entry(
    vehicle_id: UUID,
    payload: PinNameEntryCreate,
    db: AsyncSession = Depends(get_db),
) -> PinNameEntryResponse:
    return await PinNameService(db).create_entry(vehicle_id, payload)


@router.patch("/{entry_id}", response_model=PinNameEntryResponse)
async def update_pin_name_entry(
    vehicle_id: UUID,
    entry_id: UUID,
    payload: PinNameEntryUpdate,
    db: AsyncSession = Depends(get_db),
) -> PinNameEntryResponse:
    return await PinNameService(db).update_entry(vehicle_id, entry_id, payload)


@router.delete("/{entry_id}", status_code=204)
async def delete_pin_name_entry(
    vehicle_id: UUID,
    entry_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> None:
    await PinNameService(db).delete_entry(vehicle_id, entry_id)
