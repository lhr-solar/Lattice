from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

from app.infrastructure.db.enums import EntityKind


class ImpactTarget(BaseModel):
    kind: EntityKind
    id: UUID


class ImpactAnalysisRequest(BaseModel):
    targets: list[ImpactTarget]


class SeveredConnection(BaseModel):
    edge_id: UUID
    remaining_pin_id: UUID
    signal_ids: list[UUID] = []


class ImpactAnalysisResponse(BaseModel):
    entities_removed: list[dict[str, Any]] = []
    severed_connections: list[SeveredConnection] = []
    affected_signals: list[dict[str, Any]] = []
    affected_manufacturing: list[dict[str, Any]] = []
    warnings: list[str] = []


class TraceRequest(BaseModel):
    pin_id: UUID
    signal_id: UUID | None = None
    direction: str = "both"


class TraceResponse(BaseModel):
    pin_ids: list[UUID]
    edge_ids: list[UUID]
    signal_ids: list[UUID]
