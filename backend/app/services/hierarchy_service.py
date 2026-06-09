import uuid
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.display import (
    resolve_connector_labels,
    resolve_connector_with_slot,
    resolve_display_name,
)
from app.infra.db.models.instances import ConnectorInstance, EnclosureInstance, PcbInstance
from app.infra.db.models.templates import (
    EnclosureTemplate,
    EnclosureTemplatePanelSlot,
    PcbTemplate,
    PcbTemplateConnectorSlot,
)
from app.infra.db.models.catalog import ConnectorTemplate
from app.schemas.hierarchy import HierarchyNode, VehicleHierarchyResponse


class HierarchyService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def build_hierarchy(self, vehicle_id: UUID, revision_id: UUID) -> VehicleHierarchyResponse:
        slot_lookup = await self._slot_lookup()
        root = HierarchyNode(id=vehicle_id, kind="vehicle", label="Vehicle", children=[])

        enc_result = await self.db.execute(
            select(EnclosureInstance, EnclosureTemplate)
            .join(EnclosureTemplate, EnclosureInstance.enclosure_template_id == EnclosureTemplate.id)
            .where(EnclosureInstance.revision_id == revision_id)
        )
        for enc, tmpl in enc_result.all():
            enc_node = HierarchyNode(
                id=enc.id,
                kind="enclosure",
                label=resolve_display_name(
                    template_name=tmpl.name,
                    nickname=enc.nickname,
                    use_template_name=enc.use_template_name,
                ),
                children=[],
            )

            pcb_result = await self.db.execute(
                select(PcbInstance, PcbTemplate)
                .join(PcbTemplate, PcbInstance.pcb_template_id == PcbTemplate.id)
                .where(
                    PcbInstance.revision_id == revision_id,
                    PcbInstance.enclosure_instance_id == enc.id,
                )
            )
            for pcb, pcb_tmpl in pcb_result.all():
                pcb_node = HierarchyNode(
                    id=pcb.id,
                    kind="node",
                    label=resolve_display_name(
                        template_name=pcb_tmpl.name,
                        nickname=pcb.nickname,
                        use_template_name=pcb.use_template_name,
                    ),
                    children=[],
                )
                await self._attach_connectors(
                    pcb_node, revision_id, slot_lookup, pcb_instance_id=pcb.id
                )
                enc_node.children.append(pcb_node)

            await self._attach_connectors(
                enc_node, revision_id, slot_lookup, enclosure_instance_id=enc.id, panel_only=True
            )
            root.children.append(enc_node)

        # Inline connectors: not on a PCB or enclosure (e.g. splice / quick-disconnect on a wire bundle)
        inline_result = await self.db.execute(
            select(ConnectorInstance)
            .where(
                ConnectorInstance.revision_id == revision_id,
                ConnectorInstance.pcb_instance_id.is_(None),
                ConnectorInstance.enclosure_instance_id.is_(None),
                ConnectorInstance.is_panel_mount.is_(False),
            )
            .order_by(ConnectorInstance.created_at)
        )
        inline = inline_result.scalars().all()
        if inline:
            group_id = uuid.uuid5(uuid.NAMESPACE_URL, f"inline-connectors:{vehicle_id}:{revision_id}")
            group = HierarchyNode(id=group_id, kind="inlineGroup", label="Inline connectors", children=[])
            for conn in inline:
                tmpl = await self.db.get(ConnectorTemplate, conn.connector_template_id)
                slot_key, slot_nickname = self._slot_for_connector(conn, slot_lookup)
                label, template_label, _ = resolve_connector_with_slot(
                    template_name=tmpl.name if tmpl else "?",
                    instance_nickname=conn.nickname,
                    use_template_name=conn.use_template_name,
                    slot_key=slot_key,
                    slot_nickname=slot_nickname,
                )
                group.children.append(
                    HierarchyNode(
                        id=conn.id,
                        kind="connector",
                        label=label,
                        template_label=template_label,
                        children=[],
                    )
                )
            root.children.append(group)

        return VehicleHierarchyResponse(vehicle_id=vehicle_id, revision_id=revision_id, root=root)

    async def _attach_connectors(
        self,
        parent: HierarchyNode,
        revision_id: UUID,
        slot_lookup: dict,
        pcb_instance_id: UUID | None = None,
        enclosure_instance_id: UUID | None = None,
        panel_only: bool = False,
    ) -> None:
        q = select(ConnectorInstance).where(ConnectorInstance.revision_id == revision_id)
        if pcb_instance_id:
            q = q.where(ConnectorInstance.pcb_instance_id == pcb_instance_id)
        if enclosure_instance_id:
            q = q.where(ConnectorInstance.enclosure_instance_id == enclosure_instance_id)
        if panel_only:
            q = q.where(ConnectorInstance.is_panel_mount.is_(True))

        result = await self.db.execute(q)
        for conn in result.scalars().all():
            tmpl = await self.db.get(ConnectorTemplate, conn.connector_template_id)
            slot_key, slot_nickname = self._slot_for_connector(conn, slot_lookup)
            label, template_label, _ = resolve_connector_with_slot(
                template_name=tmpl.name if tmpl else "?",
                instance_nickname=conn.nickname,
                use_template_name=conn.use_template_name,
                slot_key=slot_key,
                slot_nickname=slot_nickname,
            )
            if panel_only and conn.source_pcb_instance_id:
                label = f"{label} (from PCB)"
            parent.children.append(
                HierarchyNode(
                    id=conn.id,
                    kind="panelMount" if conn.is_panel_mount else "connector",
                    label=label,
                    template_label=template_label,
                    children=[],
                )
            )

    async def _slot_lookup(self) -> dict:
        lookup: dict = {}
        for slot_id, slot_key, nickname in (
            await self.db.execute(
                select(
                    PcbTemplateConnectorSlot.id,
                    PcbTemplateConnectorSlot.slot_key,
                    PcbTemplateConnectorSlot.nickname,
                )
            )
        ).all():
            lookup[slot_id] = (slot_key, nickname)
        for slot_id, slot_key in (
            await self.db.execute(
                select(EnclosureTemplatePanelSlot.id, EnclosureTemplatePanelSlot.slot_key)
            )
        ).all():
            lookup[slot_id] = (slot_key, None)
        return lookup

    @staticmethod
    def _slot_for_connector(conn: ConnectorInstance, lookup: dict) -> tuple[str | None, str | None]:
        for slot_id in (
            conn.pcb_template_slot_id,
            conn.enclosure_panel_slot_id,
            conn.source_pcb_template_slot_id,
        ):
            if slot_id and slot_id in lookup:
                return lookup[slot_id]
        return None, None
