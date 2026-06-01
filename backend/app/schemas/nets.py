from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field

from app.infrastructure.db.enums import SignalKind
from app.schemas.common import SchemaBase
from app.schemas.topology import ConnectionEdgeResponse


class NetPinInfo(BaseModel):
    pin_id: UUID
    pin_number: int
    pin_name: str
    connector_instance_id: UUID
    connector_label: str
    primary_net_id: UUID | None = None
    primary_net_name: str | None = None


class NetSummary(BaseModel):
    id: UUID
    name: str
    signal_kind: SignalKind
    is_auto_named: bool
    pin_count: int


class NetDetail(NetSummary):
    pins: list[NetPinInfo] = []
    edge_ids: list[UUID] = []


class NetCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    signal_kind: SignalKind = SignalKind.CUSTOM


class NetUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    signal_kind: SignalKind | None = None


class NetDeleteResult(BaseModel):
    deleted_net_id: UUID
    deleted_net_name: str
    pins_reassigned: int
    created_auto_nets: list[str]


class PinPairRequest(BaseModel):
    pin_a_id: UUID
    pin_b_id: UUID
    net_id: UUID | None = None
    net_name: str | None = Field(default=None, min_length=1, max_length=255)
    signal_kind: SignalKind = SignalKind.CUSTOM
    create_edge: bool = True
    wire_color: str | None = None
    gauge_awg: Decimal | None = None
    replace_existing_primary: bool = True


class PinPairResponse(BaseModel):
    net: NetDetail
    edge: ConnectionEdgeResponse | None = None
    assignments_created: int
