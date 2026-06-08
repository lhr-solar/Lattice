import uuid

from sqlalchemy import ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.db.base import Base, TimestampMixin, uuid_pk


class PinNameLibraryEntry(Base, TimestampMixin):
    """Vehicle-scoped preference list of common pin names (not linked to pin instances)."""

    __tablename__ = "pin_name_library_entries"
    __table_args__ = (UniqueConstraint("vehicle_id", "name", name="uq_pin_name_library_vehicle_name"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    vehicle_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("vehicles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
