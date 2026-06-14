from uuid import UUID

from pydantic import BaseModel, Field
from pydantic import model_validator

from app.infra.db.enums import ConnectorCategory, ConnectorGender, ConnectorRole, SignalKind
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


def _validate_connector_template_mount_modes(
    *,
    connector_category: ConnectorCategory,
    default_is_panel_mount: bool,
    is_inline_template: bool,
) -> None:
    if connector_category == ConnectorCategory.WIRE_TO_WIRE:
        if not default_is_panel_mount and not is_inline_template:
            raise ValueError("Wire-to-wire connector must support panel mount and/or inline")
        return
    if is_inline_template:
        raise ValueError("Wire-to-board connectors cannot be inline")
    # Wire-to-board: standard vs panel mount is encoded in default_is_panel_mount.


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
    connector_category: ConnectorCategory = ConnectorCategory.WIRE_TO_WIRE
    default_is_panel_mount: bool = False
    is_inline_template: bool = False
    default_inline_gender: ConnectorGender | None = None
    inline_part_number: str | None = None
    pins: list[ConnectorTemplatePinCreate] = []
    pin_shorts: list[TemplatePinShortCreate] = []

    @model_validator(mode="after")
    def validate_mount_modes(self) -> "ConnectorTemplateCreate":
        _validate_connector_template_mount_modes(
            connector_category=self.connector_category,
            default_is_panel_mount=self.default_is_panel_mount,
            is_inline_template=self.is_inline_template,
        )
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
    connector_category: ConnectorCategory
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
    connector_category: ConnectorCategory = ConnectorCategory.WIRE_TO_WIRE
    default_is_panel_mount: bool = False
    is_inline_template: bool = False
    default_inline_gender: ConnectorGender | None = None
    inline_part_number: str | None = None
    pins: list[ConnectorTemplatePinCreate] = []

    @model_validator(mode="after")
    def validate_mount_modes(self) -> "ConnectorTemplateUpdate":
        _validate_connector_template_mount_modes(
            connector_category=self.connector_category,
            default_is_panel_mount=self.default_is_panel_mount,
            is_inline_template=self.is_inline_template,
        )
        return self
