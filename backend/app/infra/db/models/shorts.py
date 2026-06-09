import uuid

from sqlalchemy import ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.infra.db.base import Base, uuid_pk


class ConnectorTemplatePinShort(Base):
    """Template-level pin bonds (same pinout for male/female mating pair)."""

    __tablename__ = "connector_template_pin_shorts"
    __table_args__ = (
        UniqueConstraint("connector_template_id", "pin_number_a", "pin_number_b"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    connector_template_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("connector_templates.id", ondelete="CASCADE"), nullable=False
    )
    pin_number_a: Mapped[int] = mapped_column(Integer, nullable=False)
    pin_number_b: Mapped[int] = mapped_column(Integer, nullable=False)
    label: Mapped[str | None] = mapped_column(String(128))


class ConnectorTemplatePinShortByName(Base):
    """Short all pins sharing a name on the template (e.g. duplicate CAN-H taps)."""

    __tablename__ = "connector_template_pin_shorts_by_name"
    __table_args__ = (UniqueConstraint("connector_template_id", "pin_name"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    connector_template_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("connector_templates.id", ondelete="CASCADE"), nullable=False
    )
    pin_name: Mapped[str] = mapped_column(String(128), nullable=False)


class ConnectorInstancePinShort(Base):
    """Runtime pin short on a connector instance (internal continuity, not a harness wire)."""

    __tablename__ = "connector_instance_pin_shorts"
    __table_args__ = (
        UniqueConstraint("connector_instance_id", "pin_a_id", "pin_b_id", name="uq_instance_pin_short"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    revision_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("revisions.id"), nullable=False, index=True
    )
    connector_instance_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("connector_instances.id", ondelete="CASCADE"), nullable=False
    )
    pin_a_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pins.id", ondelete="CASCADE"), nullable=False
    )
    pin_b_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pins.id", ondelete="CASCADE"), nullable=False
    )
