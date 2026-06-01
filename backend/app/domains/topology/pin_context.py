from dataclasses import dataclass, field
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.db.models.instances import ConnectorInstance, EnclosureInstance, PcbInstance, Pin


@dataclass
class PinContext:
    """Maps pins to enclosure/connector context for edge metadata and manufacturing."""

    pin_to_enclosure: dict[UUID, UUID | None] = field(default_factory=dict)
    pin_to_connector: dict[UUID, UUID] = field(default_factory=dict)
    connector_is_panel: dict[UUID, bool] = field(default_factory=dict)

    def enclosure_for_pin(self, pin_id: UUID) -> UUID | None:
        return self.pin_to_enclosure.get(pin_id)


async def load_pin_context(db: AsyncSession, revision_id: UUID) -> PinContext:
    result = await db.execute(
        select(Pin, ConnectorInstance, PcbInstance.enclosure_instance_id)
        .join(ConnectorInstance, Pin.connector_instance_id == ConnectorInstance.id)
        .outerjoin(PcbInstance, ConnectorInstance.pcb_instance_id == PcbInstance.id)
        .where(Pin.revision_id == revision_id)
    )
    ctx = PinContext()
    for pin, connector, pcb_enclosure_id in result.all():
        ctx.pin_to_connector[pin.id] = connector.id
        ctx.connector_is_panel[connector.id] = connector.is_panel_mount
        if connector.enclosure_instance_id:
            ctx.pin_to_enclosure[pin.id] = connector.enclosure_instance_id
        elif pcb_enclosure_id:
            ctx.pin_to_enclosure[pin.id] = pcb_enclosure_id
        else:
            ctx.pin_to_enclosure[pin.id] = None
    return ctx


async def enclosure_has_panel_mounts(db: AsyncSession, enclosure_instance_id: UUID, revision_id: UUID) -> bool:
    result = await db.execute(
        select(ConnectorInstance.id)
        .where(
            ConnectorInstance.revision_id == revision_id,
            ConnectorInstance.enclosure_instance_id == enclosure_instance_id,
            ConnectorInstance.is_panel_mount.is_(True),
        )
        .limit(1)
    )
    return result.scalar_one_or_none() is not None
