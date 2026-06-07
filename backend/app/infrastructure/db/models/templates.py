import uuid

from sqlalchemy import ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.db.base import Base, TimestampMixin, uuid_pk
from app.infrastructure.db.enums import ConnectorRole


class PcbTemplate(Base, TimestampMixin):
    __tablename__ = "pcb_templates"
    __table_args__ = (UniqueConstraint("vehicle_id", "name"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    vehicle_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("vehicles.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    metadata_: Mapped[dict] = mapped_column("metadata", JSONB, nullable=False, server_default="{}")


class PcbTemplateConnectorSlot(Base):
    __tablename__ = "pcb_template_connector_slots"
    __table_args__ = (UniqueConstraint("pcb_template_id", "slot_key"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    pcb_template_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pcb_templates.id", ondelete="CASCADE"), nullable=False
    )
    slot_key: Mapped[str] = mapped_column(String(128), nullable=False)
    connector_template_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("connector_templates.id"), nullable=False
    )
    position_index: Mapped[int | None] = mapped_column(Integer)
    default_role: Mapped[ConnectorRole | None] = mapped_column()
    export_to_enclosure: Mapped[bool] = mapped_column(nullable=False, default=False)
    pin_mapping: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="[]")


class EnclosureTemplate(Base, TimestampMixin):
    __tablename__ = "enclosure_templates"
    __table_args__ = (UniqueConstraint("vehicle_id", "name"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    vehicle_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("vehicles.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    metadata_: Mapped[dict] = mapped_column("metadata", JSONB, nullable=False, server_default="{}")


class EnclosureTemplatePanelSlot(Base):
    __tablename__ = "enclosure_template_panel_slots"
    __table_args__ = (UniqueConstraint("enclosure_template_id", "slot_key"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    enclosure_template_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("enclosure_templates.id", ondelete="CASCADE"), nullable=False
    )
    slot_key: Mapped[str] = mapped_column(String(128), nullable=False)
    connector_template_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("connector_templates.id"), nullable=False
    )
    panel_side: Mapped[str | None] = mapped_column(String(64))


class EnclosureTemplatePcbSlot(Base):
    __tablename__ = "enclosure_template_pcb_slots"
    __table_args__ = (UniqueConstraint("enclosure_template_id", "slot_key"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    enclosure_template_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("enclosure_templates.id", ondelete="CASCADE"), nullable=False
    )
    slot_key: Mapped[str] = mapped_column(String(128), nullable=False)
    pcb_template_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pcb_templates.id"), nullable=False
    )
    position_index: Mapped[int | None] = mapped_column(Integer)
