import uuid
from datetime import datetime

from sqlalchemy import Boolean, Double, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.db.base import Base, uuid_pk
from app.infrastructure.db.enums import EntityKind


class NodeLayout(Base):
    __tablename__ = "node_layouts"
    __table_args__ = (UniqueConstraint("revision_id", "view_key", "entity_kind", "entity_id"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    revision_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("revisions.id"), nullable=False, index=True
    )
    view_key: Mapped[str] = mapped_column(String(255), nullable=False)
    entity_kind: Mapped[EntityKind] = mapped_column(nullable=False)
    entity_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    x: Mapped[float] = mapped_column(Double, nullable=False)
    y: Mapped[float] = mapped_column(Double, nullable=False)
    z_index: Mapped[int] = mapped_column(Integer, default=0)
    collapsed: Mapped[bool] = mapped_column(Boolean, default=False)
    metadata_: Mapped[dict] = mapped_column("metadata", JSONB, nullable=False, server_default="{}")


class SavedView(Base):
    __tablename__ = "saved_views"

    id: Mapped[uuid.UUID] = uuid_pk()
    revision_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("revisions.id"), nullable=False
    )
    user_display_name: Mapped[str | None] = mapped_column(String(255))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    view_key: Mapped[str] = mapped_column(String(255), nullable=False)
    filters: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    layout_snapshot: Mapped[dict | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(nullable=False)
