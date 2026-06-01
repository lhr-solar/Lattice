from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class SchemaBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class TimestampSchema(SchemaBase):
    created_at: datetime
    updated_at: datetime | None = None
