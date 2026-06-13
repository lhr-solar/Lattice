from datetime import datetime
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import delete, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.display import resolve_display_name
from app.core.time import utc_now
from app.core.revision_guard import ensure_mutable_revision
from app.domains.connectors.export import is_inline_connector_template, should_export_from_node_slot
from app.infra.db.models.catalog import ConnectorTemplate, ConnectorTemplatePin
from app.infra.db.models.instances import (
    ConnectorInstance,
    EnclosureInstance,
    PcbInstance,
    Pin,
)
from app.infra.db.models.layout import NodeLayout
from app.infra.db.models.manufacturing import HarnessGroup, HarnessGroupEdge
from app.infra.db.models.templates import (
    EnclosureTemplate,
    EnclosureTemplatePcbSlot,
    EnclosureTemplatePanelSlot,
    PcbTemplate,
    PcbTemplateConnectorSlot,
)
from app.infra.db.models.shorts import ConnectorInstancePinShort
from app.infra.db.models.topology import (
    ConnectionEdge,
    PinSignalAssignment,
    Signal,
    SpliceConnection,
)
from app.schemas.instances import (
    ConnectorInstanceCreate,
    ConnectorInstanceUpdate,
    ConnectorInstanceResponse,
    EnclosureInstanceCreate,
    EnclosureInstanceUpdate,
    EnclosureInstanceResponse,
    PinResponse,
    PinUpdate,
    PcbInstanceCreate,
    PcbInstanceUpdate,
    PcbInstanceResponse,
)
from app.services.revision_sync_service import DOMAINS_INSTANCES, RevisionSyncService
from app.services.short_service import ShortService


class InstanceService:
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
            domains=DOMAINS_INSTANCES,
            changed_by=changed_by,
        )

    async def instantiate_enclosure(
        self,
        vehicle_id: UUID,
        revision_id: UUID,
        payload: EnclosureInstanceCreate,
        *,
        changed_by: str | None = None,
    ) -> EnclosureInstanceResponse:
        await ensure_mutable_revision(self.db, revision_id, vehicle_id)
        template = await self.db.get(EnclosureTemplate, payload.enclosure_template_id)
        if not template or template.vehicle_id != vehicle_id:
            raise HTTPException(status_code=404, detail="Enclosure template not found")

        parent_id = payload.parent_enclosure_instance_id
        if parent_id is not None:
            parent = await self.db.get(EnclosureInstance, parent_id)
            if not parent or parent.revision_id != revision_id or parent.vehicle_id != vehicle_id:
                raise HTTPException(status_code=404, detail="Parent enclosure instance not found")

        nickname = (payload.nickname or "").strip() or None
        use_template_name = False if nickname else payload.use_template_name

        now = utc_now()
        instance = EnclosureInstance(
            revision_id=revision_id,
            vehicle_id=vehicle_id,
            enclosure_template_id=template.id,
            parent_enclosure_instance_id=parent_id,
            nickname=nickname,
            use_template_name=use_template_name,
            created_at=now,
        )
        self.db.add(instance)
        await self.db.flush()

        slots_result = await self.db.execute(
            select(EnclosureTemplatePanelSlot).where(
                EnclosureTemplatePanelSlot.enclosure_template_id == template.id
            )
        )
        pcb_slots_result = await self.db.execute(
            select(EnclosureTemplatePcbSlot).where(
                EnclosureTemplatePcbSlot.enclosure_template_id == template.id
            )
        )
        connector_ids: list[UUID] = []
        pcb_ids: list[UUID] = []
        for slot in slots_result.scalars().all():
            conn = await self._create_connector_from_slot(
                revision_id=revision_id,
                vehicle_id=vehicle_id,
                connector_template_id=slot.connector_template_id,
                enclosure_instance_id=instance.id,
                enclosure_panel_slot_id=slot.id,
                is_panel_mount=True,
                now=now,
            )
            connector_ids.append(conn.id)
        for pcb_slot in pcb_slots_result.scalars().all():
            pcb_response = await self.instantiate_pcb(
                vehicle_id=vehicle_id,
                revision_id=revision_id,
                payload=PcbInstanceCreate(
                    pcb_template_id=pcb_slot.pcb_template_id,
                    enclosure_instance_id=instance.id,
                ),
                sync=False,
            )
            pcb_ids.append(pcb_response.id)
            connector_ids.extend(pcb_response.connector_instance_ids)

        display = resolve_display_name(
            template_name=template.name,
            nickname=nickname,
            use_template_name=use_template_name,
        )
        response = EnclosureInstanceResponse(
            id=instance.id,
            revision_id=revision_id,
            vehicle_id=vehicle_id,
            display_name=display,
            nickname=nickname,
            use_template_name=use_template_name,
            created_at=now,
            enclosure_template_id=template.id,
            parent_enclosure_instance_id=parent_id,
            connector_instance_ids=connector_ids,
            pcb_instance_ids=pcb_ids,
        )
        await self._sync(vehicle_id, revision_id, changed_by=changed_by)
        return response

    async def instantiate_pcb(
        self,
        vehicle_id: UUID,
        revision_id: UUID,
        payload: PcbInstanceCreate,
        *,
        sync: bool = True,
        changed_by: str | None = None,
    ) -> PcbInstanceResponse:
        await ensure_mutable_revision(self.db, revision_id, vehicle_id)
        template = await self.db.get(PcbTemplate, payload.pcb_template_id)
        if not template or template.vehicle_id != vehicle_id:
            raise HTTPException(status_code=404, detail="PCB template not found")

        if payload.enclosure_instance_id:
            enc = await self.db.get(EnclosureInstance, payload.enclosure_instance_id)
            if not enc or enc.revision_id != revision_id:
                raise HTTPException(status_code=404, detail="Enclosure instance not found")

        nickname = (payload.nickname or "").strip() or None
        use_template_name = False if nickname else payload.use_template_name

        now = utc_now()
        instance = PcbInstance(
            revision_id=revision_id,
            vehicle_id=vehicle_id,
            pcb_template_id=template.id,
            enclosure_instance_id=payload.enclosure_instance_id,
            nickname=nickname,
            use_template_name=use_template_name,
            created_at=now,
        )
        self.db.add(instance)
        await self.db.flush()

        slots_result = await self.db.execute(
            select(PcbTemplateConnectorSlot).where(PcbTemplateConnectorSlot.pcb_template_id == template.id)
        )
        connector_ids: list[UUID] = []
        for slot in slots_result.scalars().all():
            conn_template = await self.db.get(ConnectorTemplate, slot.connector_template_id)
            if not conn_template:
                raise HTTPException(status_code=404, detail="Connector template not found")
            export = should_export_from_node_slot(
                conn_template, slot, payload.enclosure_instance_id
            )
            conn = await self._create_connector_from_slot(
                revision_id=revision_id,
                vehicle_id=vehicle_id,
                connector_template_id=slot.connector_template_id,
                pcb_instance_id=instance.id,
                pcb_template_slot_id=slot.id,
                enclosure_instance_id=payload.enclosure_instance_id,
                is_panel_mount=export,
                role=slot.default_role,
                source_pcb_template_slot_id=slot.id if export else None,
                source_pcb_instance_id=instance.id if export else None,
                pin_origin_note=slot.description
                or ("Exposed from PCB connector slot" if export else None),
                nickname=slot.nickname,
                now=now,
            )
            connector_ids.append(conn.id)

        display = resolve_display_name(
            template_name=template.name,
            nickname=nickname,
            use_template_name=use_template_name,
        )
        response = PcbInstanceResponse(
            id=instance.id,
            revision_id=revision_id,
            vehicle_id=vehicle_id,
            display_name=display,
            nickname=nickname,
            use_template_name=use_template_name,
            created_at=now,
            pcb_template_id=template.id,
            enclosure_instance_id=payload.enclosure_instance_id,
            connector_instance_ids=connector_ids,
        )
        if sync:
            await self._sync(vehicle_id, revision_id, changed_by=changed_by)
        return response

    async def create_connector(
        self,
        vehicle_id: UUID,
        revision_id: UUID,
        payload: ConnectorInstanceCreate,
        *,
        changed_by: str | None = None,
    ) -> ConnectorInstanceResponse:
        await ensure_mutable_revision(self.db, revision_id, vehicle_id)
        template = await self.db.get(ConnectorTemplate, payload.connector_template_id)
        if not template:
            raise HTTPException(status_code=404, detail="Connector template not found")
        if payload.inline_gender is not None and not is_inline_connector_template(template):
            raise HTTPException(
                status_code=400,
                detail="Inline gender can only be set for inline wire-to-wire connector templates",
            )
        if (
            not payload.is_panel_mount
            and payload.pcb_instance_id is None
            and not is_inline_connector_template(template)
        ):
            raise HTTPException(
                status_code=400,
                detail="Only inline wire-to-wire connector templates can be added as inline connectors",
            )
        if payload.is_panel_mount and payload.inline_gender is not None:
            raise HTTPException(
                status_code=400,
                detail="Panel mount connectors cannot specify inline gender",
            )
        inline_gender = payload.inline_gender
        nickname = (payload.nickname or "").strip() or None
        use_template_name = False if nickname else payload.use_template_name

        now = utc_now()
        instance = ConnectorInstance(
            revision_id=revision_id,
            vehicle_id=vehicle_id,
            connector_template_id=template.id,
            enclosure_instance_id=payload.enclosure_instance_id,
            pcb_instance_id=payload.pcb_instance_id,
            is_panel_mount=payload.is_panel_mount,
            inline_gender=inline_gender,
            nickname=nickname,
            use_template_name=use_template_name,
            role=payload.role or template.default_role,
            created_at=now,
        )
        self.db.add(instance)
        await self.db.flush()
        pin_ids = await self._spawn_pins(revision_id, instance.id, template.id)
        await ShortService(self.db).apply_template_shorts_to_instance(
            revision_id, instance.id, template.id, vehicle_id
        )

        display = resolve_display_name(
            template_name=template.name,
            nickname=nickname,
            use_template_name=use_template_name,
        )
        response = ConnectorInstanceResponse(
            id=instance.id,
            revision_id=revision_id,
            vehicle_id=vehicle_id,
            display_name=display,
            nickname=nickname,
            use_template_name=use_template_name,
            created_at=now,
            connector_template_id=template.id,
            pcb_instance_id=payload.pcb_instance_id,
            enclosure_instance_id=payload.enclosure_instance_id,
            source_pcb_template_slot_id=instance.source_pcb_template_slot_id,
            source_pcb_instance_id=instance.source_pcb_instance_id,
            pin_origin_note=instance.pin_origin_note,
            is_panel_mount=payload.is_panel_mount,
            inline_gender=instance.inline_gender,
            role=instance.role,
            pin_ids=pin_ids,
        )
        await self._sync(vehicle_id, revision_id, changed_by=changed_by)
        return response

    async def list_enclosures(self, revision_id: UUID) -> list[EnclosureInstanceResponse]:
        result = await self.db.execute(
            select(EnclosureInstance).where(EnclosureInstance.revision_id == revision_id)
        )
        items = []
        for enc in result.scalars().all():
            template = await self.db.get(EnclosureTemplate, enc.enclosure_template_id)
            conns = await self._connector_ids_for_enclosure(enc.id)
            pcbs = await self._pcb_ids_for_enclosure(enc.id)
            items.append(
                EnclosureInstanceResponse(
                    id=enc.id,
                    revision_id=enc.revision_id,
                    vehicle_id=enc.vehicle_id,
                    display_name=resolve_display_name(
                        template_name=template.name if template else "?",
                        nickname=enc.nickname,
                        use_template_name=enc.use_template_name,
                    ),
                    nickname=enc.nickname,
                    use_template_name=enc.use_template_name,
                    created_at=enc.created_at,
                    enclosure_template_id=enc.enclosure_template_id,
                    parent_enclosure_instance_id=enc.parent_enclosure_instance_id,
                    connector_instance_ids=conns,
                    pcb_instance_ids=pcbs,
                )
            )
        return items

    async def update_pin(
        self,
        vehicle_id: UUID,
        revision_id: UUID,
        connector_instance_id: UUID,
        pin_id: UUID,
        payload: PinUpdate,
        *,
        changed_by: str | None = None,
    ) -> PinResponse:
        await ensure_mutable_revision(self.db, revision_id, vehicle_id)
        await RevisionSyncService(self.db).check_expected_sequence(
            revision_id, payload.expected_edit_sequence, vehicle_id
        )
        pin = await self.db.get(Pin, pin_id)
        if (
            not pin
            or pin.revision_id != revision_id
            or pin.connector_instance_id != connector_instance_id
        ):
            raise HTTPException(status_code=404, detail="Pin not found")

        pin.name = payload.name.strip()
        await self.db.flush()
        response = PinResponse(
            id=pin.id,
            connector_instance_id=pin.connector_instance_id,
            pin_number=pin.pin_number,
            name=pin.name,
            role=pin.role,
        )
        await self._sync(vehicle_id, revision_id, changed_by=changed_by)
        return response

    async def update_enclosure(
        self,
        vehicle_id: UUID,
        revision_id: UUID,
        enclosure_instance_id: UUID,
        payload: EnclosureInstanceUpdate,
        *,
        changed_by: str | None = None,
    ) -> EnclosureInstanceResponse:
        await ensure_mutable_revision(self.db, revision_id, vehicle_id)
        await RevisionSyncService(self.db).check_expected_sequence(
            revision_id, payload.expected_edit_sequence, vehicle_id
        )
        enc = await self.db.get(EnclosureInstance, enclosure_instance_id)
        if not enc or enc.revision_id != revision_id or enc.vehicle_id != vehicle_id:
            raise HTTPException(status_code=404, detail="Enclosure instance not found")

        if payload.nickname is not None:
            nickname = payload.nickname.strip() or None
            enc.nickname = nickname
            enc.use_template_name = nickname is None

        await self.db.flush()
        template = await self.db.get(EnclosureTemplate, enc.enclosure_template_id)
        response = EnclosureInstanceResponse(
            id=enc.id,
            revision_id=enc.revision_id,
            vehicle_id=enc.vehicle_id,
            display_name=resolve_display_name(
                template_name=template.name if template else "?",
                nickname=enc.nickname,
                use_template_name=enc.use_template_name,
            ),
            nickname=enc.nickname,
            use_template_name=enc.use_template_name,
            created_at=enc.created_at,
            enclosure_template_id=enc.enclosure_template_id,
            parent_enclosure_instance_id=enc.parent_enclosure_instance_id,
            connector_instance_ids=await self._connector_ids_for_enclosure(enc.id),
            pcb_instance_ids=await self._pcb_ids_for_enclosure(enc.id),
        )
        await self._sync(vehicle_id, revision_id, changed_by=changed_by)
        return response

    async def update_pcb(
        self,
        vehicle_id: UUID,
        revision_id: UUID,
        pcb_instance_id: UUID,
        payload: PcbInstanceUpdate,
        *,
        changed_by: str | None = None,
    ) -> PcbInstanceResponse:
        await ensure_mutable_revision(self.db, revision_id, vehicle_id)
        await RevisionSyncService(self.db).check_expected_sequence(
            revision_id, payload.expected_edit_sequence, vehicle_id
        )
        pcb = await self.db.get(PcbInstance, pcb_instance_id)
        if not pcb or pcb.revision_id != revision_id or pcb.vehicle_id != vehicle_id:
            raise HTTPException(status_code=404, detail="PCB instance not found")

        if payload.nickname is not None:
            nickname = payload.nickname.strip() or None
            pcb.nickname = nickname
            pcb.use_template_name = nickname is None

        await self.db.flush()
        template = await self.db.get(PcbTemplate, pcb.pcb_template_id)
        connector_ids_result = await self.db.execute(
            select(ConnectorInstance.id).where(ConnectorInstance.pcb_instance_id == pcb.id)
        )
        response = PcbInstanceResponse(
            id=pcb.id,
            revision_id=pcb.revision_id,
            vehicle_id=pcb.vehicle_id,
            display_name=resolve_display_name(
                template_name=template.name if template else "?",
                nickname=pcb.nickname,
                use_template_name=pcb.use_template_name,
            ),
            nickname=pcb.nickname,
            use_template_name=pcb.use_template_name,
            created_at=pcb.created_at,
            pcb_template_id=pcb.pcb_template_id,
            enclosure_instance_id=pcb.enclosure_instance_id,
            connector_instance_ids=list(connector_ids_result.scalars().all()),
        )
        await self._sync(vehicle_id, revision_id, changed_by=changed_by)
        return response

    async def update_connector(
        self,
        vehicle_id: UUID,
        revision_id: UUID,
        connector_instance_id: UUID,
        payload: ConnectorInstanceUpdate,
        *,
        changed_by: str | None = None,
    ) -> ConnectorInstanceResponse:
        await ensure_mutable_revision(self.db, revision_id, vehicle_id)
        await RevisionSyncService(self.db).check_expected_sequence(
            revision_id, payload.expected_edit_sequence, vehicle_id
        )
        conn = await self.db.get(ConnectorInstance, connector_instance_id)
        if not conn or conn.revision_id != revision_id or conn.vehicle_id != vehicle_id:
            raise HTTPException(status_code=404, detail="Connector instance not found")

        template = await self.db.get(ConnectorTemplate, conn.connector_template_id)
        if (
            payload.nickname is not None
            and (
                conn.pcb_instance_id is not None
                or conn.is_panel_mount
                or not (template and is_inline_connector_template(template))
            )
        ):
            raise HTTPException(
                status_code=400,
                detail="Only inline connector instances can be renamed",
            )

        if payload.nickname is not None:
            nickname = payload.nickname.strip() or None
            conn.nickname = nickname
            conn.use_template_name = nickname is None

        await self.db.flush()
        pin_ids_result = await self.db.execute(
            select(Pin.id).where(Pin.connector_instance_id == conn.id)
        )
        response = ConnectorInstanceResponse(
            id=conn.id,
            revision_id=conn.revision_id,
            vehicle_id=conn.vehicle_id,
            display_name=resolve_display_name(
                template_name=template.name if template else "?",
                nickname=conn.nickname,
                use_template_name=conn.use_template_name,
            ),
            nickname=conn.nickname,
            use_template_name=conn.use_template_name,
            created_at=conn.created_at,
            connector_template_id=conn.connector_template_id,
            pcb_instance_id=conn.pcb_instance_id,
            enclosure_instance_id=conn.enclosure_instance_id,
            source_pcb_template_slot_id=conn.source_pcb_template_slot_id,
            source_pcb_instance_id=conn.source_pcb_instance_id,
            pin_origin_note=conn.pin_origin_note,
            is_panel_mount=conn.is_panel_mount,
            inline_gender=conn.inline_gender,
            role=conn.role,
            pin_ids=list(pin_ids_result.scalars().all()),
        )
        await self._sync(vehicle_id, revision_id, changed_by=changed_by)
        return response

    async def delete_connector(
        self,
        vehicle_id: UUID,
        revision_id: UUID,
        connector_instance_id: UUID,
        *,
        changed_by: str | None = None,
    ) -> None:
        await ensure_mutable_revision(self.db, revision_id, vehicle_id)
        conn = await self.db.get(ConnectorInstance, connector_instance_id)
        if not conn or conn.revision_id != revision_id or conn.vehicle_id != vehicle_id:
            raise HTTPException(status_code=404, detail="Connector instance not found")

        pin_ids = await self._pin_ids_for_connectors([connector_instance_id])
        await self._cleanup_pins_topology(revision_id, pin_ids)
        await self._delete_node_layouts(revision_id, [connector_instance_id])
        await self.db.delete(conn)
        await self.db.flush()
        await self._prune_orphan_signals(revision_id)
        await self._sync(vehicle_id, revision_id, changed_by=changed_by)

    async def delete_pcb(
        self,
        vehicle_id: UUID,
        revision_id: UUID,
        pcb_instance_id: UUID,
        *,
        changed_by: str | None = None,
    ) -> None:
        await ensure_mutable_revision(self.db, revision_id, vehicle_id)
        pcb = await self.db.get(PcbInstance, pcb_instance_id)
        if not pcb or pcb.revision_id != revision_id or pcb.vehicle_id != vehicle_id:
            raise HTTPException(status_code=404, detail="PCB instance not found")

        connector_ids = await self._connector_ids_for_pcb(pcb_instance_id)
        pin_ids = await self._pin_ids_for_connectors(connector_ids)
        await self._cleanup_pins_topology(revision_id, pin_ids)
        await self._delete_node_layouts(revision_id, [pcb_instance_id, *connector_ids])
        await self._delete_pins_and_connectors(pin_ids, connector_ids)
        await self.db.delete(pcb)
        await self.db.flush()
        await self._prune_orphan_signals(revision_id)
        await self._sync(vehicle_id, revision_id, changed_by=changed_by)

    async def delete_enclosure(
        self,
        vehicle_id: UUID,
        revision_id: UUID,
        enclosure_instance_id: UUID,
        *,
        changed_by: str | None = None,
    ) -> None:
        await ensure_mutable_revision(self.db, revision_id, vehicle_id)
        enc = await self.db.get(EnclosureInstance, enclosure_instance_id)
        if not enc or enc.revision_id != revision_id or enc.vehicle_id != vehicle_id:
            raise HTTPException(status_code=404, detail="Enclosure instance not found")

        child_ids = list(
            (
                await self.db.execute(
                    select(EnclosureInstance.id).where(
                        EnclosureInstance.parent_enclosure_instance_id == enclosure_instance_id
                    )
                )
            ).scalars().all()
        )
        for child_id in child_ids:
            await self.delete_enclosure(
                vehicle_id, revision_id, child_id, changed_by=changed_by
            )

        pcb_ids = await self._pcb_ids_for_enclosure(enclosure_instance_id)
        connector_ids = await self._connector_ids_for_enclosure(enclosure_instance_id)
        pin_ids = await self._pin_ids_for_connectors(connector_ids)
        await self._cleanup_pins_topology(revision_id, pin_ids)
        await self._delete_node_layouts(
            revision_id, [enclosure_instance_id, *pcb_ids, *connector_ids]
        )
        await self.db.execute(
            update(HarnessGroup)
            .where(HarnessGroup.enclosure_instance_id == enclosure_instance_id)
            .values(enclosure_instance_id=None)
        )
        await self._delete_pins_and_connectors(pin_ids, connector_ids)
        if pcb_ids:
            # Delete direct child PCBs before deleting the enclosure row to
            # satisfy the pcb_instances.enclosure_instance_id FK constraint.
            await self.db.execute(delete(PcbInstance).where(PcbInstance.id.in_(pcb_ids)))
        await self.db.delete(enc)
        await self.db.flush()
        await self._prune_orphan_signals(revision_id)
        await self._sync(vehicle_id, revision_id, changed_by=changed_by)

    async def _pin_ids_for_connectors(self, connector_ids: list[UUID]) -> list[UUID]:
        if not connector_ids:
            return []
        result = await self.db.execute(
            select(Pin.id).where(Pin.connector_instance_id.in_(connector_ids))
        )
        return list(result.scalars().all())

    async def _connector_ids_for_pcb(self, pcb_instance_id: UUID) -> list[UUID]:
        result = await self.db.execute(
            select(ConnectorInstance.id).where(
                or_(
                    ConnectorInstance.pcb_instance_id == pcb_instance_id,
                    ConnectorInstance.source_pcb_instance_id == pcb_instance_id,
                )
            )
        )
        return list(result.scalars().all())

    async def _connector_ids_for_enclosure(self, enclosure_instance_id: UUID) -> list[UUID]:
        pcb_ids = await self._pcb_ids_for_enclosure(enclosure_instance_id)
        clauses = [ConnectorInstance.enclosure_instance_id == enclosure_instance_id]
        if pcb_ids:
            clauses.append(ConnectorInstance.pcb_instance_id.in_(pcb_ids))
        result = await self.db.execute(select(ConnectorInstance.id).where(or_(*clauses)))
        return list(result.scalars().all())

    async def _delete_pins_and_connectors(
        self, pin_ids: list[UUID], connector_ids: list[UUID]
    ) -> None:
        if connector_ids:
            await self.db.execute(
                delete(ConnectorInstancePinShort).where(
                    ConnectorInstancePinShort.connector_instance_id.in_(connector_ids)
                )
            )
        if pin_ids:
            await self.db.execute(delete(Pin).where(Pin.id.in_(pin_ids)))
        if connector_ids:
            await self.db.execute(
                delete(ConnectorInstance).where(ConnectorInstance.id.in_(connector_ids))
            )

    async def _cleanup_pins_topology(self, revision_id: UUID, pin_ids: list[UUID]) -> None:
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

    async def _delete_node_layouts(self, revision_id: UUID, entity_ids: list[UUID]) -> None:
        if not entity_ids:
            return
        await self.db.execute(
            delete(NodeLayout).where(
                NodeLayout.revision_id == revision_id,
                NodeLayout.entity_id.in_(entity_ids),
            )
        )

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

    async def _create_connector_from_slot(
        self,
        *,
        revision_id: UUID,
        vehicle_id: UUID,
        connector_template_id: UUID,
        now: datetime,
        pcb_instance_id: UUID | None = None,
        enclosure_instance_id: UUID | None = None,
        pcb_template_slot_id: UUID | None = None,
        enclosure_panel_slot_id: UUID | None = None,
        is_panel_mount: bool = False,
        role=None,
        source_pcb_template_slot_id: UUID | None = None,
        source_pcb_instance_id: UUID | None = None,
        pin_origin_note: str | None = None,
        nickname: str | None = None,
    ) -> ConnectorInstance:
        template = await self.db.get(ConnectorTemplate, connector_template_id)
        if not template:
            raise HTTPException(status_code=404, detail="Connector template not found")
        instance = ConnectorInstance(
            revision_id=revision_id,
            vehicle_id=vehicle_id,
            connector_template_id=connector_template_id,
            pcb_instance_id=pcb_instance_id,
            enclosure_instance_id=enclosure_instance_id,
            pcb_template_slot_id=pcb_template_slot_id,
            enclosure_panel_slot_id=enclosure_panel_slot_id,
            source_pcb_template_slot_id=source_pcb_template_slot_id,
            source_pcb_instance_id=source_pcb_instance_id,
            pin_origin_note=pin_origin_note,
            is_panel_mount=is_panel_mount,
            nickname=nickname,
            use_template_name=not bool(nickname),
            role=role or template.default_role,
            created_at=now,
        )
        self.db.add(instance)
        await self.db.flush()
        await self._spawn_pins(revision_id, instance.id, connector_template_id)
        await ShortService(self.db).apply_template_shorts_to_instance(
            revision_id, instance.id, connector_template_id, vehicle_id
        )
        return instance

    async def _spawn_pins(self, revision_id: UUID, connector_instance_id: UUID, template_id: UUID) -> list[UUID]:
        result = await self.db.execute(
            select(ConnectorTemplatePin)
            .where(ConnectorTemplatePin.connector_template_id == template_id)
            .order_by(ConnectorTemplatePin.pin_number)
        )
        pin_ids: list[UUID] = []
        for tp in result.scalars().all():
            pin = Pin(
                revision_id=revision_id,
                connector_instance_id=connector_instance_id,
                connector_template_pin_id=tp.id,
                pin_number=tp.pin_number,
                name=tp.name,
                role=tp.role,
            )
            self.db.add(pin)
            await self.db.flush()
            pin_ids.append(pin.id)
        return pin_ids

    async def _connector_ids_for_enclosure(self, enclosure_id: UUID) -> list[UUID]:
        pcb_ids = await self._pcb_ids_for_enclosure(enclosure_id)
        clauses = [ConnectorInstance.enclosure_instance_id == enclosure_id]
        if pcb_ids:
            clauses.append(ConnectorInstance.pcb_instance_id.in_(pcb_ids))
        result = await self.db.execute(select(ConnectorInstance.id).where(or_(*clauses)))
        return list(result.scalars().all())

    async def _pcb_ids_for_enclosure(self, enclosure_id: UUID) -> list[UUID]:
        result = await self.db.execute(
            select(PcbInstance.id).where(PcbInstance.enclosure_instance_id == enclosure_id)
        )
        return list(result.scalars().all())
