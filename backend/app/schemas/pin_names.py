from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class PinNameEntryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    description: str | None = Field(default=None, max_length=512)


class PinNameEntryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    description: str | None = Field(default=None, max_length=512)


class PinNameEntryResponse(BaseModel):
    id: UUID
    vehicle_id: UUID
    name: str
    description: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
