from typing import Any
from uuid import UUID

from pydantic import BaseModel

from app.infra.db.enums import EntityKind


class ValidationFinding(BaseModel):
    code: str
    severity: str
    message: str
    entity_kind: EntityKind | None = None
    entity_id: UUID | None = None
    related_ids: list[UUID] = []


class ValidationRunResponse(BaseModel):
    revision_id: UUID
    findings: list[ValidationFinding]
    summary: dict[str, Any] = {}
