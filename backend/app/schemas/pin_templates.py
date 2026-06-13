from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import TimestampSchema


class PinTemplatePinCreate(BaseModel):
    pin_number: int = Field(ge=1)
    name: str | None = Field(default=None, max_length=128)


class PinTemplateCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    connector_template_ids: list[UUID] = Field(min_length=1)
    pins: list[PinTemplatePinCreate] = []


class PinTemplateUpdate(PinTemplateCreate):
    pass


class PinTemplatePinResponse(BaseModel):
    pin_number: int
    name: str | None

    model_config = {"from_attributes": True}


class PinTemplateResponse(TimestampSchema):
    id: UUID
    vehicle_id: UUID
    name: str
    pin_count: int
    connector_template_ids: list[UUID]
    pins: list[PinTemplatePinResponse]
