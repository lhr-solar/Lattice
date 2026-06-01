from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.infrastructure.db.enums import RevisionStatus
from app.schemas.common import SchemaBase, TimestampSchema


class VehicleCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None


class VehicleUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=255)


class VehicleResponse(TimestampSchema):
    id: UUID
    name: str
    description: str | None
    current_revision_id: UUID | None = None


class RevisionResponse(SchemaBase):
    id: UUID
    vehicle_id: UUID
    revision_number: int
    status: RevisionStatus
    label: str | None
    is_immutable: bool
    created_at: datetime
