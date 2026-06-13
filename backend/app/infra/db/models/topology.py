import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Numeric, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.infra.db.base import Base, uuid_pk
from app.infra.db.enums import EdgeManufacturingState, HarnessScope, SignalKind


class Signal(Base):
    __tablename__ = "signals"
    __table_args__ = (UniqueConstraint("revision_id", "name"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    revision_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("revisions.id"), nullable=False, index=True
    )
    vehicle_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("vehicles.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    signal_kind: Mapped[SignalKind] = mapped_column(nullable=False)
    bus_group_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    default_wire_color: Mapped[str | None] = mapped_column(String(64))
    metadata_: Mapped[dict] = mapped_column("metadata", JSONB, nullable=False, server_default="{}")


class PinSignalAssignment(Base):
    __tablename__ = "pin_signal_assignments"
    __table_args__ = (UniqueConstraint("pin_id", "signal_id", "assignment_role"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    revision_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("revisions.id"), nullable=False
    )
    pin_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pins.id", ondelete="CASCADE"), nullable=False, index=True
    )
    signal_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("signals.id", ondelete="CASCADE"), nullable=False, index=True
    )
    assignment_role: Mapped[str] = mapped_column(String(64), nullable=False, default="primary")


class ConnectionEdge(Base):
    __tablename__ = "connection_edges"
    __table_args__ = (CheckConstraint("pin_a_id <> pin_b_id", name="ck_edge_distinct_pins"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    revision_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("revisions.id"), nullable=False, index=True
    )
    vehicle_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("vehicles.id"), nullable=False
    )
    pin_a_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pins.id"), nullable=False, index=True
    )
    pin_b_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pins.id"), nullable=False, index=True
    )
    signal_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("signals.id"))
    gauge_awg: Mapped[Decimal | None] = mapped_column(Numeric(4, 1))
    wire_color: Mapped[str | None] = mapped_column(String(64))
    twisted_pair_group_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    shield_group_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    signal_type: Mapped[str | None] = mapped_column(String(64))
    notes: Mapped[str | None] = mapped_column(Text)
    manufacturing_state: Mapped[EdgeManufacturingState] = mapped_column(
        default=EdgeManufacturingState.PLANNED
    )
    manufacturing_metadata: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    manufactured: Mapped[bool] = mapped_column(default=False)
    manufactured_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    manufactured_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    manufactured_at_edit_sequence: Mapped[int | None] = mapped_column()
    continuity_checked: Mapped[bool] = mapped_column(default=False)
    continuity_checked_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    continuity_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    continuity_checked_at_edit_sequence: Mapped[int | None] = mapped_column()
    enclosure_a_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    enclosure_b_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    harness_scope: Mapped[HarnessScope | None] = mapped_column()
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class SpliceNode(Base):
    __tablename__ = "splice_nodes"

    id: Mapped[uuid.UUID] = uuid_pk()
    revision_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("revisions.id"), nullable=False
    )
    vehicle_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("vehicles.id"), nullable=False
    )
    name: Mapped[str | None] = mapped_column(String(255))
    metadata_: Mapped[dict] = mapped_column("metadata", JSONB, nullable=False, server_default="{}")


class SpliceConnection(Base):
    __tablename__ = "splice_connections"
    __table_args__ = (UniqueConstraint("splice_node_id", "pin_id"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    revision_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("revisions.id"), nullable=False
    )
    splice_node_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("splice_nodes.id", ondelete="CASCADE"), nullable=False
    )
    pin_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pins.id", ondelete="CASCADE"), nullable=False
    )
