from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import SchemaBase


class PinShortCreate(BaseModel):
    pin_a_id: UUID
    pin_b_id: UUID
    expected_edit_sequence: int | None = None


class PinShortResponse(SchemaBase):
    id: UUID
    revision_id: UUID
    connector_instance_id: UUID
    pin_a_id: UUID
    pin_b_id: UUID


class TemplatePinShortCreate(BaseModel):
    pin_number_a: int | None = None
    pin_number_b: int | None = None
    pin_name: str | None = Field(default=None, description="Short all pins with this name")
    label: str | None = None
