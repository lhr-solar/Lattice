from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.infra.db.models.vehicle import Revision
from app.realtime.ws_hub import ws_hub

PENDING_REVISION_BROADCASTS = "pending_revision_broadcasts"
PENDING_REVISION_PUBLISHED = "pending_revision_published"


def _queue_revision_changed(
    db: AsyncSession,
    *,
    vehicle_id: UUID,
    revision_id: UUID,
    edit_sequence: int,
    domains: list[str],
    changed_by: str | None,
) -> None:
    db.info.setdefault(PENDING_REVISION_BROADCASTS, []).append(
        {
            "vehicle_id": vehicle_id,
            "revision_id": revision_id,
            "edit_sequence": edit_sequence,
            "domains": domains,
            "changed_by": changed_by,
        }
    )


def _queue_revision_published(
    db: AsyncSession,
    *,
    vehicle_id: UUID,
    old_revision_id: UUID,
    new_revision_id: UUID,
    changed_by: str | None,
) -> None:
    db.info.setdefault(PENDING_REVISION_PUBLISHED, []).append(
        {
            "vehicle_id": vehicle_id,
            "old_revision_id": old_revision_id,
            "new_revision_id": new_revision_id,
            "changed_by": changed_by,
        }
    )


async def flush_pending_broadcasts(session: AsyncSession) -> None:
    for msg in session.info.pop(PENDING_REVISION_BROADCASTS, []):
        await ws_hub.broadcast_revision_changed(**msg)
    for msg in session.info.pop(PENDING_REVISION_PUBLISHED, []):
        await ws_hub.broadcast_revision_published(**msg)

DOMAINS_INSTANCES = [
    "hierarchy",
    "design-projection",
    "connection-table",
    "topology-summary",
]
DOMAINS_NETS = [
    "nets",
    "pins",
    "design-projection",
    "connection-table",
    "topology-summary",
]
DOMAINS_WIRING = [
    "design-projection",
    "topology-summary",
    "connection-table",
    "manufacturing-wire-table",
    "nets",
    "pins",
]
DOMAINS_SHORTS = ["shorts", "pins", "design-projection", "nets"]
DOMAINS_MANUFACTURING = ["manufacturing-wire-table"]
DOMAINS_LAYOUT = ["design-projection"]


class RevisionSyncService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def check_expected_sequence(
        self,
        revision_id: UUID,
        expected_edit_sequence: int | None,
        vehicle_id: UUID | None = None,
    ) -> None:
        if expected_edit_sequence is None:
            return
        stmt = select(Revision).where(Revision.id == revision_id).with_for_update()
        if vehicle_id:
            stmt = stmt.where(Revision.vehicle_id == vehicle_id)
        result = await self.db.execute(stmt)
        revision = result.scalar_one_or_none()
        if not revision:
            raise HTTPException(status_code=404, detail="Revision not found")
        if revision.edit_sequence != expected_edit_sequence:
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "stale_revision",
                    "current_edit_sequence": revision.edit_sequence,
                    "message": "Revision changed while you were editing",
                },
            )

    async def bump_and_notify(
        self,
        *,
        vehicle_id: UUID,
        revision_id: UUID,
        domains: list[str],
        changed_by: str | None = None,
    ) -> int:
        result = await self.db.execute(
            update(Revision)
            .where(Revision.id == revision_id, Revision.vehicle_id == vehicle_id)
            .values(edit_sequence=Revision.edit_sequence + 1)
            .returning(Revision.edit_sequence)
        )
        row = result.one_or_none()
        if row is None:
            raise HTTPException(status_code=404, detail="Revision not found")
        edit_sequence = int(row[0])
        _queue_revision_changed(
            self.db,
            vehicle_id=vehicle_id,
            revision_id=revision_id,
            edit_sequence=edit_sequence,
            domains=domains,
            changed_by=changed_by,
        )
        return edit_sequence

    async def notify_domains(
        self,
        *,
        vehicle_id: UUID,
        revision_id: UUID,
        domains: list[str],
        changed_by: str | None = None,
    ) -> int:
        """Broadcast domain invalidation without bumping edit_sequence."""
        result = await self.db.execute(
            select(Revision.edit_sequence).where(
                Revision.id == revision_id, Revision.vehicle_id == vehicle_id
            )
        )
        row = result.one_or_none()
        if row is None:
            raise HTTPException(status_code=404, detail="Revision not found")
        edit_sequence = int(row[0])
        _queue_revision_changed(
            self.db,
            vehicle_id=vehicle_id,
            revision_id=revision_id,
            edit_sequence=edit_sequence,
            domains=domains,
            changed_by=changed_by,
        )
        return edit_sequence

    async def notify_published(
        self,
        *,
        vehicle_id: UUID,
        old_revision_id: UUID,
        new_revision_id: UUID,
        changed_by: str | None = None,
    ) -> None:
        _queue_revision_published(
            self.db,
            vehicle_id=vehicle_id,
            old_revision_id=old_revision_id,
            new_revision_id=new_revision_id,
            changed_by=changed_by,
        )
