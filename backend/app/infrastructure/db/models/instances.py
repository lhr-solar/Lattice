import uuid
from datetime import datetime

from sqlalchemy import Boolean, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.db.base import Base, uuid_pk
from app.infrastructure.db.enums import ConnectorGender, ConnectorRole


class PcbInstance(Base):
    __tablename__ = "pcb_instances"

    id: Mapped[uuid.UUID] = uuid_pk()
    revision_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("revisions.id"), nullable=False, index=True
    )
    vehicle_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("vehicles.id"), nullable=False, index=True
    )
    pcb_template_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pcb_templates.id"), nullable=False
    )
    enclosure_instance_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("enclosure_instances.id")
    )
    nickname: Mapped[str | None] = mapped_column(String(255))
    use_template_name: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    metadata_: Mapped[dict] = mapped_column("metadata", JSONB, nullable=False, server_default="{}")
    created_at: Mapped[datetime] = mapped_column(nullable=False)


class EnclosureInstance(Base):
    __tablename__ = "enclosure_instances"

    id: Mapped[uuid.UUID] = uuid_pk()
    revision_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("revisions.id"), nullable=False, index=True
    )
    vehicle_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("vehicles.id"), nullable=False, index=True
    )
    enclosure_template_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("enclosure_templates.id"), nullable=False
    )
    nickname: Mapped[str | None] = mapped_column(String(255))
    use_template_name: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    metadata_: Mapped[dict] = mapped_column("metadata", JSONB, nullable=False, server_default="{}")
    created_at: Mapped[datetime] = mapped_column(nullable=False)


class ConnectorInstance(Base):
    __tablename__ = "connector_instances"

    id: Mapped[uuid.UUID] = uuid_pk()
    revision_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("revisions.id"), nullable=False, index=True
    )
    vehicle_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("vehicles.id"), nullable=False, index=True
    )
    connector_template_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("connector_templates.id"), nullable=False
    )
    pcb_instance_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pcb_instances.id", ondelete="CASCADE")
    )
    enclosure_instance_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("enclosure_instances.id", ondelete="CASCADE")
    )
    pcb_template_slot_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pcb_template_connector_slots.id")
    )
    enclosure_panel_slot_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("enclosure_template_panel_slots.id")
    )
    source_pcb_template_slot_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pcb_template_connector_slots.id")
    )
    source_pcb_instance_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pcb_instances.id", ondelete="CASCADE")
    )
    pin_origin_note: Mapped[str | None] = mapped_column(String(255))
    is_panel_mount: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    inline_gender: Mapped[ConnectorGender | None] = mapped_column()
    nickname: Mapped[str | None] = mapped_column(String(255))
    use_template_name: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    role: Mapped[ConnectorRole | None] = mapped_column()
    metadata_: Mapped[dict] = mapped_column("metadata", JSONB, nullable=False, server_default="{}")
    created_at: Mapped[datetime] = mapped_column(nullable=False)


class Pin(Base):
    __tablename__ = "pins"
    __table_args__ = (UniqueConstraint("connector_instance_id", "pin_number"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    revision_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("revisions.id"), nullable=False, index=True
    )
    connector_instance_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("connector_instances.id", ondelete="CASCADE"), nullable=False
    )
    connector_template_pin_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("connector_template_pins.id")
    )
    pin_number: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    role: Mapped[ConnectorRole | None] = mapped_column()
    metadata_: Mapped[dict] = mapped_column("metadata", JSONB, nullable=False, server_default="{}")
