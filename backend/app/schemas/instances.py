from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.infrastructure.db.enums import ConnectorRole
from app.schemas.common import SchemaBase


class InstanceCreateBase(BaseModel):
    nickname: str | None = None
    use_template_name: bool = True


class PcbInstanceCreate(InstanceCreateBase):
    pcb_template_id: UUID
    enclosure_instance_id: UUID | None = None


class EnclosureInstanceCreate(InstanceCreateBase):
    enclosure_template_id: UUID


class ConnectorInstanceCreate(InstanceCreateBase):
    connector_template_id: UUID
    enclosure_instance_id: UUID | None = None
    pcb_instance_id: UUID | None = None
    is_panel_mount: bool = False
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
    connector_instance_ids: list[UUID] = []
    pcb_instance_ids: list[UUID] = []


class ConnectorInstanceResponse(InstanceResponse):
    connector_template_id: UUID
    pcb_instance_id: UUID | None
    enclosure_instance_id: UUID | None
    is_panel_mount: bool
    role: ConnectorRole | None
    pin_ids: list[UUID] = []


class PinResponse(SchemaBase):
    id: UUID
    connector_instance_id: UUID
    pin_number: int
    name: str
    role: ConnectorRole | None
