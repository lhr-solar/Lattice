from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.revision_guard import get_revision_or_404
from app.core.time import utc_now
from app.domains.manufacturing.classifier import classify_edge_scope, harness_group_key
from app.domains.topology.pin_context import load_pin_context
from app.infrastructure.db.enums import HarnessScope
from app.infrastructure.db.models.manufacturing import (
    ContinuityCheck,
    HarnessGroup,
    HarnessGroupEdge,
    ManufacturingRecord,
)
from app.infrastructure.db.models.topology import ConnectionEdge
from app.schemas.manufacturing import (
    ContinuityCheckCreate,
    ContinuityCheckResponse,
    HarnessGroupResponse,
    ManufacturingProjectionResponse,
    ManufacturingRecordCreate,
    ManufacturingRecordResponse,
    ManufacturingRecordUpdate,
)


class ManufacturingService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def sync_harness_groups(self, vehicle_id: UUID, revision_id: UUID) -> list[HarnessGroupResponse]:
        await get_revision_or_404(self.db, revision_id, vehicle_id)
        ctx = await load_pin_context(self.db, revision_id)

        group_ids = select(HarnessGroup.id).where(HarnessGroup.revision_id == revision_id).scalar_subquery()
        await self.db.execute(delete(HarnessGroupEdge).where(HarnessGroupEdge.harness_group_id.in_(group_ids)))
        await self.db.execute(delete(HarnessGroup).where(HarnessGroup.revision_id == revision_id))

        edges_result = await self.db.execute(
            select(ConnectionEdge).where(ConnectionEdge.revision_id == revision_id)
        )
        buckets: dict[str, dict] = {}
        for edge in edges_result.scalars().all():
            scope = classify_edge_scope(ctx, edge.pin_a_id, edge.pin_b_id)
            enc_a = ctx.enclosure_for_pin(edge.pin_a_id)
            enc_b = ctx.enclosure_for_pin(edge.pin_b_id)
            key = harness_group_key(scope, enc_a, enc_b)
            if key not in buckets:
                name = self._group_name(scope, enc_a, enc_b)
                buckets[key] = {
                    "scope": scope,
                    "enclosure_id": enc_a if scope == HarnessScope.INTERNAL else None,
                    "edge_ids": [],
                    "name": name,
                }
            buckets[key]["edge_ids"].append(edge.id)
            edge.harness_scope = scope
            edge.enclosure_a_id = enc_a
            edge.enclosure_b_id = enc_b

        groups: list[HarnessGroup] = []
        for data in buckets.values():
            group = HarnessGroup(
                revision_id=revision_id,
                vehicle_id=vehicle_id,
                name=data["name"],
                scope=data["scope"],
                enclosure_instance_id=data["enclosure_id"],
            )
            self.db.add(group)
            await self.db.flush()
            for eid in data["edge_ids"]:
                self.db.add(HarnessGroupEdge(harness_group_id=group.id, connection_edge_id=eid))
            groups.append(group)

        await self.db.flush()
        return [await self._group_response(g) for g in groups]

    async def get_projection(self, vehicle_id: UUID, revision_id: UUID) -> ManufacturingProjectionResponse:
        await get_revision_or_404(self.db, revision_id, vehicle_id)
        groups_result = await self.db.execute(
            select(HarnessGroup).where(HarnessGroup.revision_id == revision_id)
        )
        groups = [await self._group_response(g) for g in groups_result.scalars().all()]
        internal = [g for g in groups if g.scope == HarnessScope.INTERNAL]
        external = [g for g in groups if g.scope == HarnessScope.EXTERNAL]

        records_result = await self.db.execute(
            select(ManufacturingRecord).where(ManufacturingRecord.revision_id == revision_id)
        )
        records = [await self._record_response(r) for r in records_result.scalars().all()]

        return ManufacturingProjectionResponse(
            revision_id=revision_id,
            internal_groups=internal,
            external_groups=external,
            records=records,
        )

    async def create_record(
        self, vehicle_id: UUID, revision_id: UUID, payload: ManufacturingRecordCreate
    ) -> ManufacturingRecordResponse:
        group = await self.db.get(HarnessGroup, payload.harness_group_id)
        if not group or group.revision_id != revision_id:
            raise HTTPException(status_code=404, detail="Harness group not found")
        record = ManufacturingRecord(
            revision_id=revision_id,
            harness_group_id=payload.harness_group_id,
            notes=payload.notes,
        )
        self.db.add(record)
        await self.db.flush()
        return await self._record_response(record)

    async def update_record(
        self,
        revision_id: UUID,
        record_id: UUID,
        payload: ManufacturingRecordUpdate,
        user_name: str | None,
    ) -> ManufacturingRecordResponse:
        record = await self.db.get(ManufacturingRecord, record_id)
        if not record or record.revision_id != revision_id:
            raise HTTPException(status_code=404, detail="Manufacturing record not found")
        data = payload.model_dump(exclude_unset=True)
        if "built_by" in data and data["built_by"] is None and user_name:
            data["built_by"] = user_name
        if "built_at" in data and data.get("built_at") is None and "built_by" in data:
            data["built_at"] = utc_now()
        for key, value in data.items():
            setattr(record, key, value)
        await self.db.flush()
        return await self._record_response(record)

    async def add_continuity_check(
        self,
        revision_id: UUID,
        record_id: UUID,
        payload: ContinuityCheckCreate,
        user_name: str,
    ) -> ContinuityCheckResponse:
        record = await self.db.get(ManufacturingRecord, record_id)
        if not record or record.revision_id != revision_id:
            raise HTTPException(status_code=404, detail="Manufacturing record not found")
        now = utc_now()
        check = ContinuityCheck(
            manufacturing_record_id=record_id,
            performed_by=user_name,
            performed_at=now,
            passed=payload.passed,
            details=payload.details,
        )
        self.db.add(check)
        record.continuity_checked_by = user_name
        record.continuity_checked_at = now
        await self.db.flush()
        return ContinuityCheckResponse.model_validate(check)

    async def _group_response(self, group: HarnessGroup) -> HarnessGroupResponse:
        edges = await self.db.execute(
            select(HarnessGroupEdge.connection_edge_id).where(
                HarnessGroupEdge.harness_group_id == group.id
            )
        )
        return HarnessGroupResponse(
            id=group.id,
            name=group.name,
            scope=group.scope,
            enclosure_instance_id=group.enclosure_instance_id,
            edge_ids=list(edges.scalars().all()),
        )

    async def _record_response(self, record: ManufacturingRecord) -> ManufacturingRecordResponse:
        group = await self.db.get(HarnessGroup, record.harness_group_id)
        checks_result = await self.db.execute(
            select(ContinuityCheck).where(ContinuityCheck.manufacturing_record_id == record.id)
        )
        return ManufacturingRecordResponse(
            id=record.id,
            revision_id=record.revision_id,
            harness_group_id=record.harness_group_id,
            harness_group_name=group.name if group else None,
            harness_scope=group.scope if group else None,
            built_by=record.built_by,
            built_at=record.built_at,
            continuity_checked_by=record.continuity_checked_by,
            continuity_checked_at=record.continuity_checked_at,
            status=record.status,
            notes=record.notes,
            continuity_checks=[
                ContinuityCheckResponse.model_validate(c) for c in checks_result.scalars().all()
            ],
        )

    @staticmethod
    def _group_name(scope: HarnessScope, enc_a: UUID | None, enc_b: UUID | None) -> str:
        if scope == HarnessScope.INTERNAL and enc_a:
            return f"Internal harness ({str(enc_a)[:8]})"
        if enc_a and enc_b:
            return f"External {str(enc_a)[:8]} ↔ {str(enc_b)[:8]}"
        return "External vehicle harness"
