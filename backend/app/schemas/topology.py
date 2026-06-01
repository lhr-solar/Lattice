from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel

from app.infrastructure.db.enums import EdgeManufacturingState


class ConnectionEdgeCreate(BaseModel):
    pin_a_id: UUID
    pin_b_id: UUID
    signal_id: UUID | None = None
    gauge_awg: Decimal | None = None
    wire_color: str | None = None
    twisted_pair_group_id: UUID | None = None
    shield_group_id: UUID | None = None
    signal_type: str | None = None
    notes: str | None = None


class ConnectionEdgeUpdate(BaseModel):
    gauge_awg: Decimal | None = None
    wire_color: str | None = None
    twisted_pair_group_id: UUID | None = None
    shield_group_id: UUID | None = None
    signal_type: str | None = None
    notes: str | None = None
    manufacturing_state: EdgeManufacturingState | None = None
    manufacturing_metadata: dict | None = None


class ConnectionEdgeResponse(BaseModel):
    id: UUID
    pin_a_id: UUID
    pin_b_id: UUID
    signal_id: UUID | None
    gauge_awg: Decimal | None
    wire_color: str | None
    twisted_pair_group_id: UUID | None
    shield_group_id: UUID | None
    signal_type: str | None
    notes: str | None
    manufacturing_state: EdgeManufacturingState
    enclosure_a_id: UUID | None
    enclosure_b_id: UUID | None
    harness_scope: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class TopologySummary(BaseModel):
    net_count: int
    edge_count: int
    pin_count: int
    connector_count: int
    enclosure_count: int
    pcb_count: int
