import uuid
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.infra.db.base import Base, TimestampMixin, uuid_pk
from app.infra.db.enums import RevisionStatus


class Vehicle(Base, TimestampMixin):
    __tablename__ = "vehicles"

    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    metadata_: Mapped[dict] = mapped_column("metadata", JSONB, nullable=False, server_default="{}")

    revisions: Mapped[list["Revision"]] = relationship(
        back_populates="vehicle",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class Revision(Base):
    __tablename__ = "revisions"
    __table_args__ = (UniqueConstraint("vehicle_id", "revision_number"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    vehicle_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("vehicles.id", ondelete="CASCADE"), nullable=False
    )
    revision_number: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[RevisionStatus] = mapped_column(default=RevisionStatus.DRAFT)
    label: Mapped[str | None] = mapped_column(String(255))
    parent_revision_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("revisions.id")
    )
    is_immutable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    snapshot_taken_at: Mapped[datetime | None] = mapped_column()
    created_by: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(nullable=False)
    edit_sequence: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0, server_default="0")

    vehicle: Mapped["Vehicle"] = relationship(back_populates="revisions")


class VehicleHead(Base):
    __tablename__ = "vehicle_heads"

    vehicle_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("vehicles.id", ondelete="CASCADE"), primary_key=True
    )
    current_revision_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("revisions.id"), nullable=False
    )
