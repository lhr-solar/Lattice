import uuid
from datetime import datetime

from sqlalchemy import Boolean, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.infra.db.base import Base, uuid_pk
from app.infra.db.enums import HarnessScope


class HarnessGroup(Base):
    __tablename__ = "harness_groups"

    id: Mapped[uuid.UUID] = uuid_pk()
    revision_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("revisions.id"), nullable=False, index=True
    )
    vehicle_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("vehicles.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    scope: Mapped[HarnessScope] = mapped_column(nullable=False)
    enclosure_instance_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("enclosure_instances.id")
    )
    bus_group_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    metadata_: Mapped[dict] = mapped_column("metadata", JSONB, nullable=False, server_default="{}")


class HarnessGroupEdge(Base):
    __tablename__ = "harness_group_edges"

    harness_group_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("harness_groups.id", ondelete="CASCADE"), primary_key=True
    )
    connection_edge_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("connection_edges.id", ondelete="CASCADE"), primary_key=True
    )


class ManufacturingRecord(Base):
    __tablename__ = "manufacturing_records"

    id: Mapped[uuid.UUID] = uuid_pk()
    revision_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("revisions.id"), nullable=False, index=True
    )
    harness_group_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("harness_groups.id"), nullable=False
    )
    built_by: Mapped[str | None] = mapped_column(String(255))
    built_at: Mapped[datetime | None] = mapped_column()
    continuity_checked_by: Mapped[str | None] = mapped_column(String(255))
    continuity_checked_at: Mapped[datetime | None] = mapped_column()
    status: Mapped[str] = mapped_column(String(64), nullable=False, default="open")
    notes: Mapped[str | None] = mapped_column(Text)
    metadata_: Mapped[dict] = mapped_column("metadata", JSONB, nullable=False, server_default="{}")


class EdgeManufacturingAudit(Base):
    __tablename__ = "edge_manufacturing_audits"

    id: Mapped[uuid.UUID] = uuid_pk()
    connection_edge_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("connection_edges.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    revision_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("revisions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    field: Mapped[str] = mapped_column(String(64), nullable=False)
    previous_value: Mapped[dict | None] = mapped_column(JSONB)
    new_value: Mapped[dict] = mapped_column(JSONB, nullable=False)
    changed_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    changed_at: Mapped[datetime] = mapped_column(nullable=False)


class ContinuityCheck(Base):
    __tablename__ = "continuity_checks"

    id: Mapped[uuid.UUID] = uuid_pk()
    manufacturing_record_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("manufacturing_records.id", ondelete="CASCADE"), nullable=False
    )
    performed_by: Mapped[str] = mapped_column(String(255), nullable=False)
    performed_at: Mapped[datetime] = mapped_column(nullable=False)
    passed: Mapped[bool] = mapped_column(Boolean, nullable=False)
    details: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
