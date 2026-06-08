import uuid
from decimal import Decimal

from sqlalchemy import Boolean, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.infrastructure.db.base import Base, TimestampMixin, uuid_pk
from app.infrastructure.db.enums import ConnectorGender, ConnectorRole, SignalKind


class ConnectorTemplate(Base, TimestampMixin):
    __tablename__ = "connector_templates"

    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    part_number: Mapped[str | None] = mapped_column(String(128))
    manufacturer: Mapped[str | None] = mapped_column(String(128))
    gender: Mapped[ConnectorGender] = mapped_column(default=ConnectorGender.UNKNOWN)
    pin_count: Mapped[int] = mapped_column(Integer, nullable=False)
    wire_gauge_awg: Mapped[Decimal | None] = mapped_column(Numeric(4, 1))
    default_role: Mapped[ConnectorRole | None] = mapped_column()
    # Unified mating-pair connector: male/female share pin numbering; store both sides' data.
    male_part_number: Mapped[str | None] = mapped_column(String(128))
    female_part_number: Mapped[str | None] = mapped_column(String(128))
    male_crimp_part_number: Mapped[str | None] = mapped_column(String(128))
    female_crimp_part_number: Mapped[str | None] = mapped_column(String(128))
    male_image_url: Mapped[str | None] = mapped_column(Text)
    female_image_url: Mapped[str | None] = mapped_column(Text)
    key_code: Mapped[str | None] = mapped_column(String(128))
    default_is_panel_mount: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_inline_template: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    metadata_: Mapped[dict] = mapped_column("metadata", JSONB, nullable=False, server_default="{}")

    pins: Mapped[list["ConnectorTemplatePin"]] = relationship(back_populates="connector_template")


class ConnectorTemplatePin(Base):
    __tablename__ = "connector_template_pins"
    __table_args__ = (
        UniqueConstraint("connector_template_id", "pin_number"),
        UniqueConstraint("connector_template_id", "name"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    connector_template_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("connector_templates.id", ondelete="CASCADE"), nullable=False
    )
    pin_number: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    role: Mapped[ConnectorRole | None] = mapped_column()
    signal_kind: Mapped[SignalKind | None] = mapped_column()
    metadata_: Mapped[dict] = mapped_column("metadata", JSONB, nullable=False, server_default="{}")

    connector_template: Mapped["ConnectorTemplate"] = relationship(back_populates="pins")
