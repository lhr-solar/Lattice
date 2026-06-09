from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.revision_guard import ensure_mutable_revision
from app.core.time import utc_now
from app.domains.manufacturing.classifier import classify_edge_scope
from app.domains.topology.pin_context import load_pin_context
from app.infra.db.models.instances import ConnectorInstance, EnclosureInstance, PcbInstance, Pin
from app.infra.db.models.topology import ConnectionEdge, Signal
from app.schemas.topology import (
    ConnectionEdgeCreate,
    ConnectionEdgeResponse,
    ConnectionEdgeUpdate,
    TopologySummary,
)
from app.services.revision_sync_service import DOMAINS_WIRING, RevisionSyncService


class TopologyService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def _sync(
        self,
        vehicle_id: UUID,
        revision_id: UUID,
        *,
        changed_by: str | None = None,
    ) -> None:
        await RevisionSyncService(self.db).bump_and_notify(
            vehicle_id=vehicle_id,
            revision_id=revision_id,
            domains=DOMAINS_WIRING,
            changed_by=changed_by,
        )

    async def summary(self, revision_id: UUID) -> TopologySummary:
        async def count_where(column):
            r = await self.db.execute(select(func.count()).where(column == revision_id))
            return r.scalar_one()

        return TopologySummary(
            net_count=await count_where(Signal.revision_id),
            edge_count=await count_where(ConnectionEdge.revision_id),
            pin_count=await count_where(Pin.revision_id),
            connector_count=await count_where(ConnectorInstance.revision_id),
            enclosure_count=await count_where(EnclosureInstance.revision_id),
            pcb_count=await count_where(PcbInstance.revision_id),
        )

    async def find_edge_between_pins(
        self, revision_id: UUID, pin_a_id: UUID, pin_b_id: UUID
    ) -> ConnectionEdge | None:
        return (
            await self.db.execute(
                select(ConnectionEdge).where(
                    ConnectionEdge.revision_id == revision_id,
                    or_(
                        (ConnectionEdge.pin_a_id == pin_a_id)
                        & (ConnectionEdge.pin_b_id == pin_b_id),
                        (ConnectionEdge.pin_a_id == pin_b_id)
                        & (ConnectionEdge.pin_b_id == pin_a_id),
                    ),
                )
            )
        ).scalar_one_or_none()

    async def create_edge(
        self,
        vehicle_id: UUID,
        revision_id: UUID,
        payload: ConnectionEdgeCreate,
        *,
        sync: bool = True,
        changed_by: str | None = None,
    ) -> ConnectionEdgeResponse:
        await ensure_mutable_revision(self.db, revision_id, vehicle_id)
        if payload.pin_a_id == payload.pin_b_id:
            raise HTTPException(status_code=400, detail="Edge must connect distinct pins")

        for pin_id in (payload.pin_a_id, payload.pin_b_id):
            pin = await self.db.get(Pin, pin_id)
            if not pin or pin.revision_id != revision_id:
                raise HTTPException(status_code=404, detail=f"Pin {pin_id} not found")

        if await self.find_edge_between_pins(revision_id, payload.pin_a_id, payload.pin_b_id):
            raise HTTPException(
                status_code=409,
                detail="A wire already exists between these pins",
            )

        ctx = await load_pin_context(self.db, revision_id)
        enc_a = ctx.enclosure_for_pin(payload.pin_a_id)
        enc_b = ctx.enclosure_for_pin(payload.pin_b_id)
        scope = classify_edge_scope(ctx, payload.pin_a_id, payload.pin_b_id)

        edge = ConnectionEdge(
            revision_id=revision_id,
            vehicle_id=vehicle_id,
            pin_a_id=payload.pin_a_id,
            pin_b_id=payload.pin_b_id,
            signal_id=payload.signal_id,
            gauge_awg=payload.gauge_awg,
            wire_color=payload.wire_color,
            twisted_pair_group_id=payload.twisted_pair_group_id,
            shield_group_id=payload.shield_group_id,
            signal_type=payload.signal_type,
            notes=payload.notes,
            enclosure_a_id=enc_a,
            enclosure_b_id=enc_b,
            harness_scope=scope,
            created_at=utc_now(),
        )
        self.db.add(edge)
        await self.db.flush()
        response = self._edge_response(edge)
        if sync:
            await self._sync(vehicle_id, revision_id, changed_by=changed_by)
        return response

    async def list_edges(self, revision_id: UUID) -> list[ConnectionEdgeResponse]:
        result = await self.db.execute(
            select(ConnectionEdge).where(ConnectionEdge.revision_id == revision_id)
        )
        return [self._edge_response(e) for e in result.scalars().all()]

    async def update_edge(
        self,
        vehicle_id: UUID,
        revision_id: UUID,
        edge_id: UUID,
        payload: ConnectionEdgeUpdate,
        *,
        changed_by: str | None = None,
    ) -> ConnectionEdgeResponse:
        await ensure_mutable_revision(self.db, revision_id, vehicle_id)
        edge = await self.db.get(ConnectionEdge, edge_id)
        if not edge or edge.revision_id != revision_id:
            raise HTTPException(status_code=404, detail="Edge not found")

        for key, value in payload.model_dump(exclude_unset=True).items():
            setattr(edge, key, value)
        await self.db.flush()
        response = self._edge_response(edge)
        await self._sync(vehicle_id, revision_id, changed_by=changed_by)
        return response

    async def delete_edge(
        self,
        vehicle_id: UUID,
        revision_id: UUID,
        edge_id: UUID,
        *,
        sync: bool = True,
        changed_by: str | None = None,
    ) -> None:
        await ensure_mutable_revision(self.db, revision_id, vehicle_id)
        edge = await self.db.get(ConnectionEdge, edge_id)
        if not edge or edge.revision_id != revision_id:
            raise HTTPException(status_code=404, detail="Edge not found")
        await self.db.delete(edge)
        if sync:
            await self._sync(vehicle_id, revision_id, changed_by=changed_by)

    @staticmethod
    def _edge_response(edge: ConnectionEdge) -> ConnectionEdgeResponse:
        return ConnectionEdgeResponse(
            id=edge.id,
            pin_a_id=edge.pin_a_id,
            pin_b_id=edge.pin_b_id,
            signal_id=edge.signal_id,
            gauge_awg=edge.gauge_awg,
            wire_color=edge.wire_color,
            twisted_pair_group_id=edge.twisted_pair_group_id,
            shield_group_id=edge.shield_group_id,
            signal_type=edge.signal_type,
            notes=edge.notes,
            manufacturing_state=edge.manufacturing_state,
            enclosure_a_id=edge.enclosure_a_id,
            enclosure_b_id=edge.enclosure_b_id,
            harness_scope=edge.harness_scope.value if edge.harness_scope else None,
            created_at=edge.created_at,
        )
