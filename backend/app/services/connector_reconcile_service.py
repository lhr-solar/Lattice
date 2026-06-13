from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.connectors.export import should_export_from_node_slot
from app.infra.db.models.catalog import ConnectorTemplate, ConnectorTemplatePin
from app.infra.db.models.instances import ConnectorInstance, EnclosureInstance, PcbInstance, Pin
from app.infra.db.models.layout import NodeLayout
from app.infra.db.models.manufacturing import HarnessGroupEdge
from app.infra.db.models.shorts import ConnectorInstancePinShort
from app.infra.db.models.templates import EnclosureTemplatePanelSlot, PcbTemplateConnectorSlot
from app.infra.db.models.topology import ConnectionEdge, PinSignalAssignment, Signal, SpliceConnection
from app.infra.db.models.vehicle import Revision
from app.services.short_service import ShortService


class ConnectorReconcileService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def remove_instances_for_enclosure_panel_slot(
        self, slot_id: UUID, *, slot_key: str
    ) -> None:
        rows = (
            await self.db.execute(
                select(ConnectorInstance, Revision.is_immutable)
                .join(Revision, ConnectorInstance.revision_id == Revision.id)
                .where(ConnectorInstance.enclosure_panel_slot_id == slot_id)
            )
        ).all()
        if any(is_immutable for _, is_immutable in rows):
            raise HTTPException(
                status_code=409,
                detail=(
                    f'Cannot remove enclosure panel slot "{slot_key}" because it is used by a published revision'
                ),
            )
        for conn, _ in rows:
            await self._delete_connector_instance(conn)

    async def remove_instances_for_pcb_template_slot(
        self, slot_id: UUID, *, slot_key: str
    ) -> None:
        rows = (
            await self.db.execute(
                select(ConnectorInstance, Revision.is_immutable)
                .join(Revision, ConnectorInstance.revision_id == Revision.id)
                .where(
                    or_(
                        ConnectorInstance.pcb_template_slot_id == slot_id,
                        ConnectorInstance.source_pcb_template_slot_id == slot_id,
                    )
                )
            )
        ).all()
        if any(is_immutable for _, is_immutable in rows):
            raise HTTPException(
                status_code=409,
                detail=(
                    f'Cannot remove PCB slot "{slot_key}" because it is used by a published revision'
                ),
            )
        for conn, _ in rows:
            await self._delete_connector_instance(conn)

    async def reconcile_instances_for_template(self, template_id: UUID) -> None:
        instances = (
            await self.db.execute(
                select(ConnectorInstance)
                .join(Revision, ConnectorInstance.revision_id == Revision.id)
                .where(
                    ConnectorInstance.connector_template_id == template_id,
                    Revision.is_immutable.is_(False),
                )
            )
        ).scalars().all()
        for conn in instances:
            await self.sync_instance_pins_from_template(conn, template_id)

    async def sync_pcb_template_instances(self, pcb_template_id: UUID) -> None:
        slots = (
            await self.db.execute(
                select(PcbTemplateConnectorSlot).where(
                    PcbTemplateConnectorSlot.pcb_template_id == pcb_template_id
                )
            )
        ).scalars().all()
        if not slots:
            return

        mutable_pcbs = (
            await self.db.execute(
                select(PcbInstance)
                .join(Revision, PcbInstance.revision_id == Revision.id)
                .where(
                    PcbInstance.pcb_template_id == pcb_template_id,
                    Revision.is_immutable.is_(False),
                )
            )
        ).scalars().all()
        if not mutable_pcbs:
            return

        for pcb in mutable_pcbs:
            existing = (
                await self.db.execute(
                    select(ConnectorInstance).where(
                        ConnectorInstance.revision_id == pcb.revision_id,
                        ConnectorInstance.pcb_instance_id == pcb.id,
                    )
                )
            ).scalars().all()
            by_slot = {
                conn.pcb_template_slot_id: conn
                for conn in existing
                if conn.pcb_template_slot_id is not None
            }
            for slot in slots:
                conn = by_slot.get(slot.id)
                if conn is None:
                    await self._create_pcb_slot_connector(pcb, slot)
                    continue
                await self._apply_pcb_slot(conn, pcb, slot)

    async def sync_enclosure_panel_instances(self, enclosure_template_id: UUID) -> None:
        panel_slots = (
            await self.db.execute(
                select(EnclosureTemplatePanelSlot).where(
                    EnclosureTemplatePanelSlot.enclosure_template_id == enclosure_template_id
                )
            )
        ).scalars().all()
        if not panel_slots:
            return

        mutable_enclosures = (
            await self.db.execute(
                select(EnclosureInstance)
                .join(Revision, EnclosureInstance.revision_id == Revision.id)
                .where(
                    EnclosureInstance.enclosure_template_id == enclosure_template_id,
                    Revision.is_immutable.is_(False),
                )
            )
        ).scalars().all()
        if not mutable_enclosures:
            return

        for enclosure in mutable_enclosures:
            existing = (
                await self.db.execute(
                    select(ConnectorInstance).where(
                        ConnectorInstance.revision_id == enclosure.revision_id,
                        ConnectorInstance.enclosure_instance_id == enclosure.id,
                        ConnectorInstance.is_panel_mount.is_(True),
                        ConnectorInstance.source_pcb_instance_id.is_(None),
                    )
                )
            ).scalars().all()
            by_slot = {
                conn.enclosure_panel_slot_id: conn
                for conn in existing
                if conn.enclosure_panel_slot_id is not None
            }
            for slot in panel_slots:
                conn = by_slot.get(slot.id)
                if conn is None:
                    await self._create_enclosure_panel_connector(enclosure, slot)
                    continue
                await self._apply_enclosure_panel_slot(conn, slot)

    async def sync_instance_pins_from_template(
        self, conn: ConnectorInstance, template_id: UUID
    ) -> bool:
        template_pins = (
            await self.db.execute(
                select(ConnectorTemplatePin)
                .where(ConnectorTemplatePin.connector_template_id == template_id)
                .order_by(ConnectorTemplatePin.pin_number)
            )
        ).scalars().all()
        if not template_pins:
            return False

        existing_pins = (
            await self.db.execute(
                select(Pin).where(
                    Pin.revision_id == conn.revision_id,
                    Pin.connector_instance_id == conn.id,
                )
            )
        ).scalars().all()
        existing_by_number = {pin.pin_number: pin for pin in existing_pins}

        changed = False
        for template_pin in template_pins:
            current = existing_by_number.get(template_pin.pin_number)
            if current:
                if (
                    current.name != template_pin.name
                    or current.role != template_pin.role
                    or current.connector_template_pin_id != template_pin.id
                ):
                    current.name = template_pin.name
                    current.role = template_pin.role
                    current.connector_template_pin_id = template_pin.id
                    changed = True
                continue
            self.db.add(
                Pin(
                    revision_id=conn.revision_id,
                    connector_instance_id=conn.id,
                    connector_template_pin_id=template_pin.id,
                    pin_number=template_pin.pin_number,
                    name=template_pin.name,
                    role=template_pin.role,
                )
            )
            changed = True

        if not changed:
            return False

        await self.db.flush()
        await ShortService(self.db).apply_template_shorts_to_instance(
            conn.revision_id,
            conn.id,
            template_id,
            conn.vehicle_id,
        )
        return True

    async def _apply_pcb_slot(
        self,
        conn: ConnectorInstance,
        pcb: PcbInstance,
        slot: PcbTemplateConnectorSlot,
    ) -> None:
        tmpl = await self.db.get(ConnectorTemplate, slot.connector_template_id)
        if not tmpl:
            return

        if conn.connector_template_id != slot.connector_template_id:
            await self._replace_connector_template(conn, slot.connector_template_id)
        else:
            await self.sync_instance_pins_from_template(conn, slot.connector_template_id)

        export = should_export_from_node_slot(tmpl, slot, pcb.enclosure_instance_id)
        nickname = slot.nickname
        role = slot.default_role or tmpl.default_role
        pin_origin_note = slot.description or (
            "Exposed from PCB connector slot" if export else None
        )

        conn.connector_template_id = slot.connector_template_id
        conn.is_panel_mount = export
        conn.source_pcb_instance_id = pcb.id if export else None
        conn.source_pcb_template_slot_id = slot.id if export else None
        conn.pin_origin_note = pin_origin_note
        conn.nickname = nickname
        conn.use_template_name = not bool(nickname)
        conn.role = role
        await self.db.flush()

    async def _apply_enclosure_panel_slot(
        self,
        conn: ConnectorInstance,
        slot: EnclosureTemplatePanelSlot,
    ) -> None:
        if conn.connector_template_id != slot.connector_template_id:
            await self._replace_connector_template(conn, slot.connector_template_id)
        else:
            await self.sync_instance_pins_from_template(conn, slot.connector_template_id)

    async def _replace_connector_template(
        self, conn: ConnectorInstance, new_template_id: UUID
    ) -> None:
        pin_ids = list(
            (
                await self.db.execute(
                    select(Pin.id).where(
                        Pin.revision_id == conn.revision_id,
                        Pin.connector_instance_id == conn.id,
                    )
                )
            ).scalars().all()
        )
        if pin_ids:
            await self._delete_pins_with_topology(conn.revision_id, pin_ids)

        conn.connector_template_id = new_template_id
        await self.db.flush()
        await self._spawn_pins(conn.revision_id, conn.id, new_template_id)
        await ShortService(self.db).apply_template_shorts_to_instance(
            conn.revision_id,
            conn.id,
            new_template_id,
            conn.vehicle_id,
        )

    async def _create_pcb_slot_connector(
        self, pcb: PcbInstance, slot: PcbTemplateConnectorSlot
    ) -> None:
        from app.core.time import utc_now

        tmpl = await self.db.get(ConnectorTemplate, slot.connector_template_id)
        if not tmpl:
            return
        export = should_export_from_node_slot(tmpl, slot, pcb.enclosure_instance_id)
        connector = ConnectorInstance(
            revision_id=pcb.revision_id,
            vehicle_id=pcb.vehicle_id,
            connector_template_id=slot.connector_template_id,
            pcb_instance_id=pcb.id,
            enclosure_instance_id=pcb.enclosure_instance_id,
            pcb_template_slot_id=slot.id,
            source_pcb_template_slot_id=slot.id if export else None,
            source_pcb_instance_id=pcb.id if export else None,
            pin_origin_note=slot.description
            or ("Exposed from PCB connector slot" if export else None),
            is_panel_mount=export,
            nickname=slot.nickname,
            use_template_name=not bool(slot.nickname),
            role=slot.default_role or tmpl.default_role,
            created_at=utc_now(),
        )
        self.db.add(connector)
        await self.db.flush()
        await self._spawn_pins(pcb.revision_id, connector.id, slot.connector_template_id)
        await ShortService(self.db).apply_template_shorts_to_instance(
            pcb.revision_id,
            connector.id,
            slot.connector_template_id,
            pcb.vehicle_id,
        )

    async def _create_enclosure_panel_connector(
        self, enclosure: EnclosureInstance, slot: EnclosureTemplatePanelSlot
    ) -> None:
        from app.core.time import utc_now

        connector = ConnectorInstance(
            revision_id=enclosure.revision_id,
            vehicle_id=enclosure.vehicle_id,
            connector_template_id=slot.connector_template_id,
            enclosure_instance_id=enclosure.id,
            enclosure_panel_slot_id=slot.id,
            is_panel_mount=True,
            use_template_name=True,
            created_at=utc_now(),
        )
        self.db.add(connector)
        await self.db.flush()
        await self._spawn_pins(
            enclosure.revision_id, connector.id, slot.connector_template_id
        )
        await ShortService(self.db).apply_template_shorts_to_instance(
            enclosure.revision_id,
            connector.id,
            slot.connector_template_id,
            enclosure.vehicle_id,
        )

    async def _spawn_pins(
        self, revision_id: UUID, connector_instance_id: UUID, template_id: UUID
    ) -> None:
        template_pins = (
            await self.db.execute(
                select(ConnectorTemplatePin)
                .where(ConnectorTemplatePin.connector_template_id == template_id)
                .order_by(ConnectorTemplatePin.pin_number)
            )
        ).scalars().all()
        for template_pin in template_pins:
            self.db.add(
                Pin(
                    revision_id=revision_id,
                    connector_instance_id=connector_instance_id,
                    connector_template_pin_id=template_pin.id,
                    pin_number=template_pin.pin_number,
                    name=template_pin.name,
                    role=template_pin.role,
                )
            )
        await self.db.flush()

    async def _delete_connector_instance(self, conn: ConnectorInstance) -> None:
        pin_ids = list(
            (
                await self.db.execute(
                    select(Pin.id).where(
                        Pin.revision_id == conn.revision_id,
                        Pin.connector_instance_id == conn.id,
                    )
                )
            ).scalars().all()
        )
        if pin_ids:
            await self._delete_pins_with_topology(conn.revision_id, pin_ids)
        await self.db.execute(
            delete(ConnectorInstancePinShort).where(
                ConnectorInstancePinShort.connector_instance_id == conn.id
            )
        )
        await self.db.execute(
            delete(NodeLayout).where(
                NodeLayout.revision_id == conn.revision_id,
                NodeLayout.entity_id == conn.id,
            )
        )
        await self.db.delete(conn)
        await self.db.flush()

    async def _delete_pins_with_topology(self, revision_id: UUID, pin_ids: list[UUID]) -> None:
        if not pin_ids:
            return
        edge_ids = select(ConnectionEdge.id).where(
            ConnectionEdge.revision_id == revision_id,
            or_(ConnectionEdge.pin_a_id.in_(pin_ids), ConnectionEdge.pin_b_id.in_(pin_ids)),
        )
        await self.db.execute(
            delete(HarnessGroupEdge).where(HarnessGroupEdge.connection_edge_id.in_(edge_ids))
        )
        await self.db.execute(
            delete(ConnectionEdge).where(
                ConnectionEdge.revision_id == revision_id,
                or_(ConnectionEdge.pin_a_id.in_(pin_ids), ConnectionEdge.pin_b_id.in_(pin_ids)),
            )
        )
        await self.db.execute(
            delete(ConnectorInstancePinShort).where(
                or_(
                    ConnectorInstancePinShort.pin_a_id.in_(pin_ids),
                    ConnectorInstancePinShort.pin_b_id.in_(pin_ids),
                )
            )
        )
        await self.db.execute(
            delete(SpliceConnection).where(
                SpliceConnection.revision_id == revision_id,
                SpliceConnection.pin_id.in_(pin_ids),
            )
        )
        await self.db.execute(
            delete(PinSignalAssignment).where(
                PinSignalAssignment.revision_id == revision_id,
                PinSignalAssignment.pin_id.in_(pin_ids),
            )
        )
        await self.db.execute(delete(Pin).where(Pin.id.in_(pin_ids)))
        await self._prune_orphan_signals(revision_id)

    async def _prune_orphan_signals(self, revision_id: UUID) -> None:
        assigned = (
            select(PinSignalAssignment.signal_id)
            .where(
                PinSignalAssignment.revision_id == revision_id,
                PinSignalAssignment.assignment_role == "primary",
            )
            .distinct()
        )
        await self.db.execute(
            delete(Signal).where(
                Signal.revision_id == revision_id,
                Signal.id.notin_(assigned),
            )
        )
