from uuid import UUID

from pydantic import BaseModel, Field

from app.infrastructure.db.enums import ConnectorGender, ConnectorRole, SignalKind
from app.schemas.common import SchemaBase, TimestampSchema
from app.schemas.shorts import TemplatePinShortCreate


class ConnectorTemplatePinCreate(BaseModel):
    pin_number: int
    name: str
    role: ConnectorRole | None = None
    signal_kind: SignalKind | None = None


class ConnectorTemplatePinResponse(SchemaBase):
    id: UUID
    pin_number: int
    name: str
    role: ConnectorRole | None
    signal_kind: SignalKind | None


class ConnectorTemplateCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    manufacturer: str | None = None
    pin_count: int = Field(gt=0)
    default_role: ConnectorRole | None = None
    male_part_number: str | None = None
    female_part_number: str | None = None
    male_image_url: str | None = None
    female_image_url: str | None = None
    pins: list[ConnectorTemplatePinCreate] = []
    pin_shorts: list[TemplatePinShortCreate] = []


class ConnectorTemplateResponse(TimestampSchema):
    id: UUID
    name: str
    manufacturer: str | None
    pin_count: int
    default_role: ConnectorRole | None
    male_part_number: str | None
    female_part_number: str | None
    male_image_url: str | None
    female_image_url: str | None
    pins: list[ConnectorTemplatePinResponse] = []
