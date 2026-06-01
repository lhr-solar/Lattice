from uuid import UUID

from pydantic import BaseModel, Field


class SessionCreate(BaseModel):
    display_name: str = Field(min_length=1, max_length=255)


class SessionResponse(BaseModel):
    session_id: UUID
    display_name: str
