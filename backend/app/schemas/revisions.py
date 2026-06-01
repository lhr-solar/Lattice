from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from app.infrastructure.db.enums import RevisionStatus
from app.schemas.vehicles import RevisionResponse


class RevisionPublishResponse(BaseModel):
    published_revision: RevisionResponse
    new_draft_revision: RevisionResponse


class RevisionDiffItem(BaseModel):
    entity_kind: str
    entity_id: UUID
    change_type: str
    changed_at: datetime
    changed_by: str | None


class RevisionListResponse(BaseModel):
    revisions: list[RevisionResponse]
