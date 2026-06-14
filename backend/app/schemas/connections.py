from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.topology import ConnectionEdgeResponse


class ConnectionDestination(BaseModel):
    """One wire leaving a pin, pointing at the pin on the other end."""

    edge_id: UUID
    other_pin_id: UUID
    other_pin_number: int
    other_pin_name: str
    other_connector_instance_id: UUID
    other_connector_label: str
    other_container_label: str | None = None
    other_node_label: str | None = None
    other_enclosure_label: str | None = None
    other_connector_kind: str | None = None
    other_slot_key: str | None = None
    # Full readable path: enclosure / board / connector (or slot) / pin (or #).
    other_path_label: str = ""
    wire_color: str | None = None
    effective_wire_color: str | None = None
    net_default_wire_color: str | None = None
    gauge_awg: Decimal | None = None
    gauge_label: str = "No gauge defined"


class PinConnectionRow(BaseModel):
    pin_id: UUID
    pin_number: int
    pin_name: str
    connector_instance_id: UUID
    connector_label: str
    # connector_kind: pcb | panel | pigtail | inline
    connector_kind: str | None = None
    # Slot designator (e.g. J3) for the connector; pcb placement slot is ignored.
    slot_key: str | None = None
    # Template names, surfaced as muted secondary context when a nickname is set.
    connector_template_name: str | None = None
    node_template_name: str | None = None
    enclosure_template_name: str | None = None
    container_label: str | None = None
    container_kind: str | None = None
    node_label: str | None = None
    enclosure_label: str | None = None
    primary_net_id: UUID | None = None
    primary_net_name: str | None = None
    is_auto_net: bool = False
    destinations: list[ConnectionDestination] = []
    short_partner_pin_ids: list[UUID] = []


class ConnectionTableResponse(BaseModel):
    rows: list[PinConnectionRow]
    total: int
    limit: int
    offset: int


class ConnectionScopeItem(BaseModel):
    id: UUID
    kind: str  # enclosure | node | connector | inline
    label: str
    parent_label: str | None = None
    pin_count: int
    connector_count: int


class ConnectionScopesResponse(BaseModel):
    scopes: list[ConnectionScopeItem]


class ConnectPinsRequest(BaseModel):
    pin_a_id: UUID
    pin_b_id: UUID
    wire_color: str | None = None
    gauge_awg: Decimal | None = None
    expected_edit_sequence: int | None = None
    # When both pins are on different user-named nets, the caller resolves the
    # conflict by picking which net survives. Must be one of the two nets.
    merge_target_net_id: UUID | None = None


class ConnectPinsResult(BaseModel):
    edge: ConnectionEdgeResponse
    # net_action: picked_up | already_same | merged | conflict | none
    net_action: str
    net_id: UUID | None = None
    net_name: str | None = None
    message: str
    # Populated only when net_action == "conflict" so the UI can prompt a merge.
    conflict_net_a_id: UUID | None = None
    conflict_net_a_name: str | None = None
    conflict_net_b_id: UUID | None = None
    conflict_net_b_name: str | None = None


class AssignNetByNameRequest(BaseModel):
    # None / empty -> unassign the pin from its primary net
    net_name: str | None = Field(default=None, max_length=255)
