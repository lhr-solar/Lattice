from uuid import UUID

from pydantic import BaseModel


class HierarchyNode(BaseModel):
    id: UUID
    kind: str
    label: str
    template_label: str | None = None
    children: list["HierarchyNode"] = []


HierarchyNode.model_rebuild()


class VehicleHierarchyResponse(BaseModel):
    vehicle_id: UUID
    revision_id: UUID
    root: HierarchyNode
