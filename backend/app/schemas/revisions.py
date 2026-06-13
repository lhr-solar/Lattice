from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from app.infra.db.enums import RevisionStatus
from app.schemas.vehicles import RevisionResponse


class RevisionPublishResponse(BaseModel):
    published_revision: RevisionResponse
    new_draft_revision: RevisionResponse


class RevisionPublishRequest(BaseModel):
    label: str | None = None


class RevisionRevertResponse(BaseModel):
    source_revision: RevisionResponse
    new_revision: RevisionResponse
    previous_current_revision_id: UUID | None


class RevisionDiffItem(BaseModel):
    entity_kind: str
    entity_id: UUID
    change_type: str
    changed_at: datetime
    changed_by: str | None


class RevisionListResponse(BaseModel):
    revisions: list[RevisionResponse]


class AdminRevisionTimelineItem(RevisionResponse):
    is_current: bool
    parent_revision_number: int | None = None
    parent_created_at: datetime | None = None
    parent_snapshot_taken_at: datetime | None = None


class AdminRevisionTimelineResponse(BaseModel):
    vehicle_id: UUID
    current_revision_id: UUID | None
    revisions: list[AdminRevisionTimelineItem]


class AdminRevisionTimelinePageResponse(BaseModel):
    vehicle_id: UUID
    current_revision_id: UUID | None
    revisions: list[AdminRevisionTimelineItem]
    total: int
    offset: int
    limit: int
    has_more: bool
