from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.infra.db.enums import ConnectorGender, ConnectorRole
from app.schemas.common import SchemaBase


class InstanceCreateBase(BaseModel):
    nickname: str | None = None
    use_template_name: bool = True


class PcbInstanceCreate(InstanceCreateBase):
    pcb_template_id: UUID
    enclosure_instance_id: UUID | None = None


class EnclosureInstanceCreate(InstanceCreateBase):
    enclosure_template_id: UUID
    parent_enclosure_instance_id: UUID | None = None


class ConnectorInstanceCreate(InstanceCreateBase):
    connector_template_id: UUID
    enclosure_instance_id: UUID | None = None
    pcb_instance_id: UUID | None = None
    is_panel_mount: bool = False
    inline_gender: ConnectorGender | None = None
    role: ConnectorRole | None = None


class InstanceResponse(SchemaBase):
    id: UUID
    revision_id: UUID
    vehicle_id: UUID
    display_name: str
    nickname: str | None
    use_template_name: bool
    created_at: datetime


class PcbInstanceResponse(InstanceResponse):
    pcb_template_id: UUID
    enclosure_instance_id: UUID | None
    connector_instance_ids: list[UUID] = []


class EnclosureInstanceResponse(InstanceResponse):
    enclosure_template_id: UUID
    parent_enclosure_instance_id: UUID | None = None
    connector_instance_ids: list[UUID] = []
    pcb_instance_ids: list[UUID] = []


class ConnectorInstanceResponse(InstanceResponse):
    connector_template_id: UUID
    pcb_instance_id: UUID | None
    enclosure_instance_id: UUID | None
    source_pcb_template_slot_id: UUID | None = None
    source_pcb_instance_id: UUID | None = None
    pin_origin_note: str | None = None
    is_panel_mount: bool
    inline_gender: ConnectorGender | None = None
    role: ConnectorRole | None
    pin_ids: list[UUID] = []


class PinResponse(SchemaBase):
    id: UUID
    connector_instance_id: UUID
    pin_number: int
    name: str
    role: ConnectorRole | None


class PinUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    expected_edit_sequence: int | None = None


class ConnectorInstanceUpdate(BaseModel):
    nickname: str | None = Field(default=None, max_length=255)
    expected_edit_sequence: int | None = None


class EnclosureInstanceUpdate(BaseModel):
    nickname: str | None = Field(default=None, max_length=255)
    expected_edit_sequence: int | None = None


class PcbInstanceUpdate(BaseModel):
    nickname: str | None = Field(default=None, max_length=255)
    expected_edit_sequence: int | None = None
