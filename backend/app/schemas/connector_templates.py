from uuid import UUID

from pydantic import BaseModel, Field
from pydantic import model_validator

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
    wire_gauge_awg: float | None = None
    default_role: ConnectorRole | None = None
    male_part_number: str | None = None
    female_part_number: str | None = None
    male_crimp_part_number: str | None = None
    female_crimp_part_number: str | None = None
    male_image_url: str | None = None
    female_image_url: str | None = None
    key_code: str | None = None
    default_is_panel_mount: bool = False
    is_inline_template: bool = False
    default_inline_gender: ConnectorGender | None = None
    inline_part_number: str | None = None
    pins: list[ConnectorTemplatePinCreate] = []
    pin_shorts: list[TemplatePinShortCreate] = []

    @model_validator(mode="after")
    def validate_mount_modes(self) -> "ConnectorTemplateCreate":
        if self.default_is_panel_mount and self.is_inline_template:
            raise ValueError("Connector cannot be both panel-mount and inline")
        return self


class ConnectorTemplateResponse(TimestampSchema):
    id: UUID
    name: str
    manufacturer: str | None
    pin_count: int
    wire_gauge_awg: float | None = None
    default_role: ConnectorRole | None
    male_part_number: str | None
    female_part_number: str | None
    male_crimp_part_number: str | None
    female_crimp_part_number: str | None
    male_image_url: str | None
    female_image_url: str | None
    key_code: str | None
    default_is_panel_mount: bool
    is_inline_template: bool
    default_inline_gender: ConnectorGender | None = None
    inline_part_number: str | None = None
    pins: list[ConnectorTemplatePinResponse] = []


class ConnectorTemplateUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    manufacturer: str | None = None
    pin_count: int = Field(gt=0)
    wire_gauge_awg: float | None = None
    default_role: ConnectorRole | None = None
    male_part_number: str | None = None
    female_part_number: str | None = None
    male_crimp_part_number: str | None = None
    female_crimp_part_number: str | None = None
    male_image_url: str | None = None
    female_image_url: str | None = None
    key_code: str | None = None
    default_is_panel_mount: bool = False
    is_inline_template: bool = False
    default_inline_gender: ConnectorGender | None = None
    inline_part_number: str | None = None
    pins: list[ConnectorTemplatePinCreate] = []

    @model_validator(mode="after")
    def validate_mount_modes(self) -> "ConnectorTemplateUpdate":
        if self.default_is_panel_mount and self.is_inline_template:
            raise ValueError("Connector cannot be both panel-mount and inline")
        return self
