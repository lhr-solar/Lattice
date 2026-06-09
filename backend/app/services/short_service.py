from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.revision_guard import ensure_mutable_revision
from app.domains.topology.net_naming import (
    derive_short_net_name,
    ensure_unique_net_name,
    get_pin_endpoint,
)
from app.domains.topology.pin_shorts import load_short_index
from app.infra.db.enums import SignalKind
from app.infra.db.models.shorts import ConnectorTemplatePinShort, ConnectorTemplatePinShortByName
from app.infra.db.models.instances import ConnectorInstance, Pin
from app.infra.db.models.shorts import ConnectorInstancePinShort
from app.infra.db.models.topology import PinSignalAssignment, Signal
from app.schemas.shorts import PinShortCreate, PinShortResponse, TemplatePinShortCreate


class ShortService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_instance_shorts(
        self, revision_id: UUID, connector_instance_id: UUID
    ) -> list[PinShortResponse]:
        result = await self.db.execute(
            select(ConnectorInstancePinShort).where(
                ConnectorInstancePinShort.revision_id == revision_id,
                ConnectorInstancePinShort.connector_instance_id == connector_instance_id,
            )
        )
        return [PinShortResponse.model_validate(s) for s in result.scalars().all()]

    async def create_instance_short(
        self,
        vehicle_id: UUID,
        revision_id: UUID,
        connector_instance_id: UUID,
        payload: PinShortCreate,
    ) -> PinShortResponse:
        await ensure_mutable_revision(self.db, revision_id, vehicle_id)
        pin_a, pin_b = await self._validate_short_pins(
            revision_id, connector_instance_id, payload.pin_a_id, payload.pin_b_id
        )

        ordered = (pin_a, pin_b) if str(pin_a) < str(pin_b) else (pin_b, pin_a)
        existing = await self.db.execute(
            select(ConnectorInstancePinShort).where(
                ConnectorInstancePinShort.connector_instance_id == connector_instance_id,
                ConnectorInstancePinShort.pin_a_id == ordered[0],
                ConnectorInstancePinShort.pin_b_id == ordered[1],
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="Short already exists")

        short = ConnectorInstancePinShort(
            revision_id=revision_id,
            connector_instance_id=connector_instance_id,
            pin_a_id=ordered[0],
            pin_b_id=ordered[1],
        )
        self.db.add(short)
        await self.db.flush()

        await self._unify_net_for_short_group(
            vehicle_id, revision_id, connector_instance_id, payload.pin_a_id
        )

        return PinShortResponse.model_validate(short)

    async def delete_instance_short(
        self, vehicle_id: UUID, revision_id: UUID, short_id: UUID
    ) -> None:
        await ensure_mutable_revision(self.db, revision_id, vehicle_id)
        short = await self.db.get(ConnectorInstancePinShort, short_id)
        if not short or short.revision_id != revision_id:
            raise HTTPException(status_code=404, detail="Short not found")
        await self.db.delete(short)

    async def apply_template_shorts_to_instance(
        self, revision_id: UUID, connector_instance_id: UUID, template_id: UUID, vehicle_id: UUID
    ) -> None:
        pins_result = await self.db.execute(
            select(Pin).where(
                Pin.revision_id == revision_id,
                Pin.connector_instance_id == connector_instance_id,
            )
        )
        pins = list(pins_result.scalars().all())
        by_number = {p.pin_number: p for p in pins}
        by_name: dict[str, list[Pin]] = {}
        for p in pins:
            by_name.setdefault(p.name, []).append(p)

        pairs: list[tuple[UUID, UUID]] = []

        tpl_shorts = await self.db.execute(
            select(ConnectorTemplatePinShort).where(
                ConnectorTemplatePinShort.connector_template_id == template_id
            )
        )
        for ts in tpl_shorts.scalars().all():
            pa, pb = by_number.get(ts.pin_number_a), by_number.get(ts.pin_number_b)
            if pa and pb and pa.id != pb.id:
                pairs.append((pa.id, pb.id))

        name_shorts = await self.db.execute(
            select(ConnectorTemplatePinShortByName).where(
                ConnectorTemplatePinShortByName.connector_template_id == template_id
            )
        )
        for ns in name_shorts.scalars().all():
            group = by_name.get(ns.pin_name, [])
            for i in range(len(group)):
                for j in range(i + 1, len(group)):
                    pairs.append((group[i].id, group[j].id))

        for pin_a_id, pin_b_id in pairs:
            ordered = (pin_a_id, pin_b_id) if str(pin_a_id) < str(pin_b_id) else (pin_b_id, pin_a_id)
            dup = await self.db.execute(
                select(ConnectorInstancePinShort).where(
                    ConnectorInstancePinShort.connector_instance_id == connector_instance_id,
                    ConnectorInstancePinShort.pin_a_id == ordered[0],
                    ConnectorInstancePinShort.pin_b_id == ordered[1],
                )
            )
            if dup.scalar_one_or_none():
                continue
            self.db.add(
                ConnectorInstancePinShort(
                    revision_id=revision_id,
                    connector_instance_id=connector_instance_id,
                    pin_a_id=ordered[0],
                    pin_b_id=ordered[1],
                )
            )
        await self.db.flush()

        if pairs:
            await self._unify_net_for_short_group(
                vehicle_id, revision_id, connector_instance_id, pairs[0][0]
            )

    async def add_template_short(
        self, template_id: UUID, payload: TemplatePinShortCreate
    ) -> dict:
        if payload.pin_name:
            self.db.add(
                ConnectorTemplatePinShortByName(
                    connector_template_id=template_id, pin_name=payload.pin_name.strip()
                )
            )
            await self.db.flush()
            return {"type": "by_name", "pin_name": payload.pin_name}

        if payload.pin_number_a is None or payload.pin_number_b is None:
            raise HTTPException(status_code=400, detail="pin_number_a and pin_number_b required")
        a, b = sorted([payload.pin_number_a, payload.pin_number_b])
        self.db.add(
            ConnectorTemplatePinShort(
                connector_template_id=template_id,
                pin_number_a=a,
                pin_number_b=b,
                label=payload.label,
            )
        )
        await self.db.flush()
        return {"type": "pair", "pin_number_a": a, "pin_number_b": b}

    async def _validate_short_pins(
        self,
        revision_id: UUID,
        connector_instance_id: UUID,
        pin_a_id: UUID,
        pin_b_id: UUID,
    ) -> tuple[UUID, UUID]:
        if pin_a_id == pin_b_id:
            raise HTTPException(status_code=400, detail="Cannot short a pin to itself")
        for pin_id in (pin_a_id, pin_b_id):
            pin = await self.db.get(Pin, pin_id)
            if not pin or pin.revision_id != revision_id:
                raise HTTPException(status_code=404, detail="Pin not found")
            if pin.connector_instance_id != connector_instance_id:
                raise HTTPException(
                    status_code=400,
                    detail="Both pins must belong to the same connector instance",
                )
        return pin_a_id, pin_b_id

    async def _unify_net_for_short_group(
        self,
        vehicle_id: UUID,
        revision_id: UUID,
        connector_instance_id: UUID,
        any_pin_id: UUID,
    ) -> None:
        index = await load_short_index(self.db, revision_id, connector_instance_id)
        index.add_pin(any_pin_id)
        component = index.component(any_pin_id)

        conn_label, pin_name = await get_pin_endpoint(self.db, any_pin_id)
        base_name = derive_short_net_name(conn_label, pin_name)
        net_name = await ensure_unique_net_name(self.db, revision_id, base_name)

        signal = Signal(
            revision_id=revision_id,
            vehicle_id=vehicle_id,
            name=net_name,
            signal_kind=SignalKind.CUSTOM,
            metadata_={"auto_created": True, "reason": "pin_short"},
        )
        self.db.add(signal)
        await self.db.flush()

        for pin_id in component:
            await self.db.execute(
                delete(PinSignalAssignment).where(
                    PinSignalAssignment.revision_id == revision_id,
                    PinSignalAssignment.pin_id == pin_id,
                    PinSignalAssignment.assignment_role == "primary",
                )
            )
            self.db.add(
                PinSignalAssignment(
                    revision_id=revision_id,
                    pin_id=pin_id,
                    signal_id=signal.id,
                    assignment_role="primary",
                )
            )
        await self.db.flush()
