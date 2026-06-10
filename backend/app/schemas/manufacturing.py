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


class WireManufacturingUserInfo(SchemaBase):
    user_id: UUID
    username: str


class WireRow(SchemaBase):
    edge_id: UUID
    signal_name: str | None
    source_node: str | None
    source_connector: str
    source_pin: str
    source_pin_number: int
    destination_node: str | None
    destination_enclosure: str | None
    destination_connector_kind: str | None = None
    destination_connector: str
    destination_pin: str
    destination_pin_number: int
    wire_color: str | None
    effective_wire_color: str | None
    gauge_label: str
    notes: str | None
    harness_scope: HarnessScope | None
    section_key: str
    section_title: str | None
    manufactured: bool
    manufactured_by: WireManufacturingUserInfo | None
    manufactured_at: datetime | None
    manufactured_stale: bool = False
    continuity_checked: bool
    continuity_checked_by: WireManufacturingUserInfo | None
    continuity_checked_at: datetime | None
    continuity_checked_stale: bool = False


class WireTableResponse(BaseModel):
    revision_id: UUID
    edit_sequence: int
    rows: list[WireRow]


class EdgeManufacturingUpdate(BaseModel):
    manufactured: bool | None = None
    continuity_checked: bool | None = None


class EdgeManufacturingAuditResponse(SchemaBase):
    id: UUID
    connection_edge_id: UUID
    field: str
    previous_value: dict | None
    new_value: dict
    changed_by: WireManufacturingUserInfo | None
    changed_at: datetime
