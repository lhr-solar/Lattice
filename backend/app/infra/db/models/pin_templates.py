import uuid

from sqlalchemy import ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.infra.db.base import Base, TimestampMixin, uuid_pk


class PinTemplate(Base, TimestampMixin):
    """Vehicle-scoped pin naming preset for one or more connector templates."""

    __tablename__ = "pin_templates"
    __table_args__ = (UniqueConstraint("vehicle_id", "name", name="uq_pin_template_vehicle_name"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    vehicle_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("vehicles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    pin_count: Mapped[int] = mapped_column(Integer, nullable=False)

    connectors: Mapped[list["PinTemplateConnector"]] = relationship(
        back_populates="pin_template", cascade="all, delete-orphan"
    )
    pins: Mapped[list["PinTemplatePin"]] = relationship(
        back_populates="pin_template", cascade="all, delete-orphan"
    )


class PinTemplateConnector(Base):
    __tablename__ = "pin_template_connectors"
    __table_args__ = (
        UniqueConstraint("pin_template_id", "connector_template_id", name="uq_pin_template_connector"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    pin_template_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pin_templates.id", ondelete="CASCADE"), nullable=False
    )
    connector_template_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("connector_templates.id", ondelete="CASCADE"), nullable=False
    )

    pin_template: Mapped["PinTemplate"] = relationship(back_populates="connectors")


class PinTemplatePin(Base):
    __tablename__ = "pin_template_pins"
    __table_args__ = (UniqueConstraint("pin_template_id", "pin_number", name="uq_pin_template_pin_number"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    pin_template_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pin_templates.id", ondelete="CASCADE"), nullable=False
    )
    pin_number: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str | None] = mapped_column(String(128))

    pin_template: Mapped["PinTemplate"] = relationship(back_populates="pins")
