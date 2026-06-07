import uuid
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.display import resolve_display_name
from app.infrastructure.db.models.instances import ConnectorInstance, EnclosureInstance, PcbInstance
from app.infrastructure.db.models.templates import EnclosureTemplate, PcbTemplate
from app.infrastructure.db.models.catalog import ConnectorTemplate
from app.schemas.hierarchy import HierarchyNode, VehicleHierarchyResponse


class HierarchyService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def build_hierarchy(self, vehicle_id: UUID, revision_id: UUID) -> VehicleHierarchyResponse:
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
                    kind="pcb",
                    label=resolve_display_name(
                        template_name=pcb_tmpl.name,
                        nickname=pcb.nickname,
                        use_template_name=pcb.use_template_name,
                    ),
                    children=[],
                )
                await self._attach_connectors(pcb_node, revision_id, pcb_instance_id=pcb.id)
                enc_node.children.append(pcb_node)

            await self._attach_connectors(enc_node, revision_id, enclosure_instance_id=enc.id, panel_only=True)
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
                group.children.append(
                    HierarchyNode(
                        id=conn.id,
                        kind="connector",
                        label=resolve_display_name(
                            template_name=tmpl.name if tmpl else "?",
                            nickname=conn.nickname,
                            use_template_name=conn.use_template_name,
                        ),
                        children=[],
                    )
                )
            root.children.append(group)

        return VehicleHierarchyResponse(vehicle_id=vehicle_id, revision_id=revision_id, root=root)

    async def _attach_connectors(
        self,
        parent: HierarchyNode,
        revision_id: UUID,
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
            label = resolve_display_name(
                template_name=tmpl.name if tmpl else "?",
                nickname=conn.nickname,
                use_template_name=conn.use_template_name,
            )
            if panel_only and conn.source_pcb_instance_id:
                label = f"{label} (from PCB)"
            parent.children.append(
                HierarchyNode(
                    id=conn.id,
                    kind="panelMount" if conn.is_panel_mount else "connector",
                    label=label,
                    children=[],
                )
            )
