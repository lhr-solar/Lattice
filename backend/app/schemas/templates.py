from uuid import UUID

from pydantic import BaseModel, Field

from app.infrastructure.db.enums import ConnectorRole
from app.schemas.common import SchemaBase, TimestampSchema


class PcbSlotCreate(BaseModel):
    slot_key: str = Field(min_length=1, max_length=128)
    connector_template_id: UUID
    position_index: int | None = None
    default_role: ConnectorRole | None = None
    export_to_enclosure: bool = False
    nickname: str | None = None
    description: str | None = None


class PcbTemplateCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    slots: list[PcbSlotCreate] = []


class PcbTemplateUpdate(PcbTemplateCreate):
    pass


class PcbSlotResponse(SchemaBase):
    id: UUID
    slot_key: str
    connector_template_id: UUID
    position_index: int | None
    default_role: ConnectorRole | None
    export_to_enclosure: bool
    nickname: str | None = None
    description: str | None = None


class PcbTemplateResponse(TimestampSchema):
    id: UUID
    vehicle_id: UUID
    name: str
    description: str | None
    slots: list[PcbSlotResponse] = []


class PanelSlotCreate(BaseModel):
    slot_key: str = Field(min_length=1, max_length=128)
    connector_template_id: UUID
    panel_side: str | None = None


class EnclosurePcbSlotCreate(BaseModel):
    slot_key: str = Field(min_length=1, max_length=128)
    pcb_template_id: UUID
    position_index: int | None = None


class EnclosureTemplateCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    slots: list[PanelSlotCreate] = []
    pcb_slots: list[EnclosurePcbSlotCreate] = []


class EnclosureTemplateUpdate(EnclosureTemplateCreate):
    pass


class PanelSlotResponse(SchemaBase):
    id: UUID
    slot_key: str
    connector_template_id: UUID
    panel_side: str | None


class EnclosurePcbSlotResponse(SchemaBase):
    id: UUID
    slot_key: str
    pcb_template_id: UUID
    position_index: int | None


class EnclosureTemplateResponse(TimestampSchema):
    id: UUID
    vehicle_id: UUID
    name: str
    slots: list[PanelSlotResponse] = []
    pcb_slots: list[EnclosurePcbSlotResponse] = []
