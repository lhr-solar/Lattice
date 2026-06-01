from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field


ProjectionLevel = Literal["vehicle", "enclosure", "connector", "pin"]


class DesignNodeDto(BaseModel):
    id: str
    kind: str
    label: str
    parent_id: str | None = None
    position: dict[str, float] | None = None
    data: dict[str, Any] = Field(default_factory=dict)


class DesignEdgeDto(BaseModel):
    id: str
    source: str
    target: str
    kind: str = "connection"
    label: str | None = None
    data: dict[str, Any] = Field(default_factory=dict)


class BusGroupDto(BaseModel):
    id: str
    label: str
    signal_ids: list[str] = []
    edge_ids: list[str] = []
    collapsed: bool = True


class DesignGraphProjectionDto(BaseModel):
    revision_id: UUID
    level: ProjectionLevel
    view_key: str
    nodes: list[DesignNodeDto]
    edges: list[DesignEdgeDto]
    bus_groups: list[BusGroupDto] = []
    meta: dict[str, Any] = Field(default_factory=dict)
