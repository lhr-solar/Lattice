from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.db.models.pin_names import PinNameLibraryEntry
from app.schemas.pin_names import PinNameEntryCreate, PinNameEntryResponse, PinNameEntryUpdate


class PinNameService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_entries(
        self, vehicle_id: UUID, search: str | None = None
    ) -> list[PinNameEntryResponse]:
        q = (
            select(PinNameLibraryEntry)
            .where(PinNameLibraryEntry.vehicle_id == vehicle_id)
            .order_by(PinNameLibraryEntry.name)
        )
        if search:
            pattern = f"%{search.strip()}%"
            q = q.where(
                PinNameLibraryEntry.name.ilike(pattern)
                | PinNameLibraryEntry.description.ilike(pattern)
            )
        result = await self.db.execute(q)
        return [PinNameEntryResponse.model_validate(row) for row in result.scalars().all()]

    async def create_entry(
        self, vehicle_id: UUID, payload: PinNameEntryCreate
    ) -> PinNameEntryResponse:
        name = payload.name.strip()
        if not name:
            raise HTTPException(status_code=422, detail="Name is required")
        entry = PinNameLibraryEntry(
            vehicle_id=vehicle_id,
            name=name,
            description=(payload.description.strip() if payload.description else None) or None,
        )
        self.db.add(entry)
        try:
            await self.db.flush()
        except IntegrityError as exc:
            raise HTTPException(status_code=409, detail="Pin name already exists in library") from exc
        return PinNameEntryResponse.model_validate(entry)

    async def update_entry(
        self, vehicle_id: UUID, entry_id: UUID, payload: PinNameEntryUpdate
    ) -> PinNameEntryResponse:
        entry = await self._get_or_404(vehicle_id, entry_id)
        if payload.name is not None:
            name = payload.name.strip()
            if not name:
                raise HTTPException(status_code=422, detail="Name is required")
            entry.name = name
        if payload.description is not None:
            entry.description = payload.description.strip() or None
        try:
            await self.db.flush()
        except IntegrityError as exc:
            raise HTTPException(status_code=409, detail="Pin name already exists in library") from exc
        return PinNameEntryResponse.model_validate(entry)

    async def delete_entry(self, vehicle_id: UUID, entry_id: UUID) -> None:
        entry = await self._get_or_404(vehicle_id, entry_id)
        await self.db.delete(entry)
        await self.db.flush()

    async def _get_or_404(self, vehicle_id: UUID, entry_id: UUID) -> PinNameLibraryEntry:
        entry = await self.db.get(PinNameLibraryEntry, entry_id)
        if not entry or entry.vehicle_id != vehicle_id:
            raise HTTPException(status_code=404, detail="Pin name entry not found")
        return entry
