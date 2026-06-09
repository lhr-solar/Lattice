from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.infra.db.enums import HarnessScope
from app.schemas.common import SchemaBase


class HarnessGroupResponse(SchemaBase):
    id: UUID
    name: str
    scope: HarnessScope
    enclosure_instance_id: UUID | None
    edge_ids: list[UUID] = []


class ManufacturingRecordCreate(BaseModel):
    harness_group_id: UUID
    notes: str | None = None


class ManufacturingRecordUpdate(BaseModel):
    built_by: str | None = None
    built_at: datetime | None = None
    continuity_checked_by: str | None = None
    continuity_checked_at: datetime | None = None
    status: str | None = None
    notes: str | None = None


class ContinuityCheckCreate(BaseModel):
    passed: bool
    details: dict = Field(default_factory=dict)


class ContinuityCheckResponse(SchemaBase):
    id: UUID
    manufacturing_record_id: UUID
    performed_by: str
    performed_at: datetime
    passed: bool


class ManufacturingRecordResponse(SchemaBase):
    id: UUID
    revision_id: UUID
    harness_group_id: UUID
    harness_group_name: str | None = None
    harness_scope: HarnessScope | None = None
    built_by: str | None
    built_at: datetime | None
    continuity_checked_by: str | None
    continuity_checked_at: datetime | None
    status: str
    notes: str | None
    continuity_checks: list[ContinuityCheckResponse] = []


class ManufacturingProjectionResponse(BaseModel):
    revision_id: UUID
    internal_groups: list[HarnessGroupResponse]
    external_groups: list[HarnessGroupResponse]
    records: list[ManufacturingRecordResponse]
