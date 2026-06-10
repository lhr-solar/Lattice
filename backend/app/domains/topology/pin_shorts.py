from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infra.db.models.shorts import ConnectorInstancePinShort


class PinShortIndex:
    """Union-find of pins shorted together on a connector instance."""

    def __init__(self) -> None:
        self.parent: dict[UUID, UUID] = {}

    def add_pin(self, pin_id: UUID) -> None:
        if pin_id not in self.parent:
            self.parent[pin_id] = pin_id

    def find(self, pin_id: UUID) -> UUID:
        if pin_id not in self.parent:
            self.parent[pin_id] = pin_id
        root = pin_id
        while self.parent[root] != root:
            root = self.parent[root]
        while self.parent[pin_id] != pin_id:
            nxt = self.parent[pin_id]
            self.parent[pin_id] = root
            pin_id = nxt
        return root

    def union(self, pin_a: UUID, pin_b: UUID) -> None:
        self.add_pin(pin_a)
        self.add_pin(pin_b)
        ra, rb = self.find(pin_a), self.find(pin_b)
        if ra != rb:
            self.parent[rb] = ra

    def component(self, pin_id: UUID) -> set[UUID]:
        root = self.find(pin_id)
        return {pid for pid in self.parent if self.find(pid) == root}


async def load_short_index(
    db: AsyncSession, revision_id: UUID, connector_instance_id: UUID
) -> PinShortIndex:
    indexes = await load_short_indexes_for_connectors(db, revision_id, [connector_instance_id])
    return indexes.get(connector_instance_id, PinShortIndex())


async def load_short_indexes_for_connectors(
    db: AsyncSession,
    revision_id: UUID,
    connector_instance_ids: list[UUID],
) -> dict[UUID, PinShortIndex]:
    indexes = {cid: PinShortIndex() for cid in connector_instance_ids}
    if not connector_instance_ids:
        return indexes
    result = await db.execute(
        select(ConnectorInstancePinShort).where(
            ConnectorInstancePinShort.revision_id == revision_id,
            ConnectorInstancePinShort.connector_instance_id.in_(connector_instance_ids),
        )
    )
    for short in result.scalars().all():
        index = indexes.setdefault(short.connector_instance_id, PinShortIndex())
        index.union(short.pin_a_id, short.pin_b_id)
    return indexes


async def expand_pins_with_shorts(
    db: AsyncSession, revision_id: UUID, pin_ids: list[UUID]
) -> list[UUID]:
    if not pin_ids:
        return []
    from app.infra.db.models.instances import Pin

    first_pin = await db.get(Pin, pin_ids[0])
    if not first_pin:
        return pin_ids
    index = await load_short_index(db, revision_id, first_pin.connector_instance_id)
    expanded: set[UUID] = set()
    for pid in pin_ids:
        index.add_pin(pid)
        expanded |= index.component(pid)
    return list(expanded)
