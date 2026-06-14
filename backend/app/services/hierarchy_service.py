from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.display import resolve_connector_labels, resolve_connector_with_slot
from app.domains.connectors.export import is_inline_connector_template
from app.infra.db.enums import ConnectorCategory
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
        slot_lookup = await self._slot_lookup(revision_id)
        root = HierarchyNode(
            id=vehicle_id,
            kind="vehicle",
            label="Vehicle",
            children=[],
        )

        enc_result = await self.db.execute(
            select(EnclosureInstance, EnclosureTemplate)
            .join(EnclosureTemplate, EnclosureInstance.enclosure_template_id == EnclosureTemplate.id)
            .where(EnclosureInstance.revision_id == revision_id)
            .order_by(EnclosureInstance.created_at)
        )
        enc_rows = enc_result.all()
        children_by_parent: dict[UUID | None, list[tuple[EnclosureInstance, EnclosureTemplate]]] = {}
        for enc, tmpl in enc_rows:
            children_by_parent.setdefault(enc.parent_enclosure_instance_id, []).append((enc, tmpl))

        for enc, tmpl in children_by_parent.get(None, []):
            root.children.append(
                await self._build_enclosure_node(
                    enc, tmpl, revision_id, slot_lookup, children_by_parent
                )
            )

        vehicle_pcb_result = await self.db.execute(
            select(PcbInstance, PcbTemplate)
            .join(PcbTemplate, PcbInstance.pcb_template_id == PcbTemplate.id)
            .where(
                PcbInstance.revision_id == revision_id,
                PcbInstance.enclosure_instance_id.is_(None),
            )
            .order_by(PcbInstance.created_at)
        )
        for pcb, pcb_tmpl in vehicle_pcb_result.all():
            root.children.append(
                await self._build_pcb_node(pcb, pcb_tmpl, revision_id, slot_lookup)
            )

        await self._attach_inline_connectors(root, revision_id, slot_lookup)

        return VehicleHierarchyResponse(vehicle_id=vehicle_id, revision_id=revision_id, root=root)

    async def _build_enclosure_node(
        self,
        enc: EnclosureInstance,
        tmpl: EnclosureTemplate,
        revision_id: UUID,
        slot_lookup: dict,
        children_by_parent: dict[UUID | None, list[tuple[EnclosureInstance, EnclosureTemplate]]],
    ) -> HierarchyNode:
        enc_label, enc_template = resolve_connector_labels(
            template_name=tmpl.name,
            nickname=enc.nickname,
            use_template_name=enc.use_template_name,
        )
        enc_node = HierarchyNode(
            id=enc.id,
            kind="enclosure",
            label=enc_label,
            template_label=enc_template,
            children=[],
        )

        for child_enc, child_tmpl in children_by_parent.get(enc.id, []):
            enc_node.children.append(
                await self._build_enclosure_node(
                    child_enc, child_tmpl, revision_id, slot_lookup, children_by_parent
                )
            )

        pcb_result = await self.db.execute(
            select(PcbInstance, PcbTemplate)
            .join(PcbTemplate, PcbInstance.pcb_template_id == PcbTemplate.id)
            .where(
                PcbInstance.revision_id == revision_id,
                PcbInstance.enclosure_instance_id == enc.id,
            )
            .order_by(PcbInstance.created_at)
        )
        for pcb, pcb_tmpl in pcb_result.all():
            enc_node.children.append(
                await self._build_pcb_node(pcb, pcb_tmpl, revision_id, slot_lookup)
            )

        await self._attach_panel_connectors(
            enc_node, revision_id, slot_lookup, enclosure_instance_id=enc.id
        )
        await self._attach_inline_connectors(
            enc_node, revision_id, slot_lookup, enclosure_instance_id=enc.id
        )
        return enc_node

    async def _build_pcb_node(
        self,
        pcb: PcbInstance,
        pcb_tmpl: PcbTemplate,
        revision_id: UUID,
        slot_lookup: dict,
    ) -> HierarchyNode:
        pcb_label, pcb_template = resolve_connector_labels(
            template_name=pcb_tmpl.name,
            nickname=pcb.nickname,
            use_template_name=pcb.use_template_name,
        )
        pcb_node = HierarchyNode(
            id=pcb.id,
            kind="node",
            label=pcb_label,
            template_label=pcb_template,
            children=[],
        )
        await self._attach_pcb_connectors(pcb_node, revision_id, slot_lookup, pcb_instance_id=pcb.id)
        return pcb_node

    async def _build_connector_node(
        self,
        conn: ConnectorInstance,
        tmpl: ConnectorTemplate,
        slot_lookup: dict,
        *,
        panel_only: bool = False,
    ) -> HierarchyNode:
        slot_key, slot_nickname = self._slot_for_connector(conn, slot_lookup)
        label, template_label, _ = resolve_connector_with_slot(
            template_name=tmpl.name,
            instance_nickname=conn.nickname,
            use_template_name=conn.use_template_name,
            slot_key=slot_key,
            slot_nickname=slot_nickname,
        )
        if panel_only and conn.source_pcb_instance_id:
            label = f"{label} (from PCB)"
        if self._is_inline_connector(conn, tmpl):
            kind = "inlineConnector"
        elif conn.is_panel_mount:
            kind = "panelMount"
        else:
            kind = "connector"
        return HierarchyNode(
            id=conn.id,
            kind=kind,
            label=label,
            template_label=template_label,
            children=[],
        )

    @staticmethod
    def _is_inline_connector(conn: ConnectorInstance, tmpl: ConnectorTemplate) -> bool:
        return (
            conn.pcb_instance_id is None
            and not conn.is_panel_mount
            and is_inline_connector_template(tmpl)
        )

    async def _attach_pcb_connectors(
        self,
        parent: HierarchyNode,
        revision_id: UUID,
        slot_lookup: dict,
        pcb_instance_id: UUID,
    ) -> None:
        result = await self.db.execute(
            select(ConnectorInstance, ConnectorTemplate)
            .join(ConnectorTemplate, ConnectorInstance.connector_template_id == ConnectorTemplate.id)
            .where(
                ConnectorInstance.revision_id == revision_id,
                ConnectorInstance.pcb_instance_id == pcb_instance_id,
                ConnectorInstance.source_pcb_instance_id.is_(None),
            )
            .order_by(ConnectorInstance.created_at)
        )
        for conn, tmpl in result.all():
            parent.children.append(
                await self._build_connector_node(conn, tmpl, slot_lookup)
            )

    async def _attach_panel_connectors(
        self,
        parent: HierarchyNode,
        revision_id: UUID,
        slot_lookup: dict,
        enclosure_instance_id: UUID,
    ) -> None:
        result = await self.db.execute(
            select(ConnectorInstance, ConnectorTemplate)
            .join(ConnectorTemplate, ConnectorInstance.connector_template_id == ConnectorTemplate.id)
            .where(
                ConnectorInstance.revision_id == revision_id,
                ConnectorInstance.enclosure_instance_id == enclosure_instance_id,
                ConnectorInstance.is_panel_mount.is_(True),
            )
            .order_by(ConnectorInstance.created_at)
        )
        for conn, tmpl in result.all():
            parent.children.append(
                await self._build_connector_node(
                    conn, tmpl, slot_lookup, panel_only=True
                )
            )

    async def _attach_inline_connectors(
        self,
        parent: HierarchyNode,
        revision_id: UUID,
        slot_lookup: dict,
        enclosure_instance_id: UUID | None = None,
    ) -> None:
        q = (
            select(ConnectorInstance, ConnectorTemplate)
            .join(ConnectorTemplate, ConnectorInstance.connector_template_id == ConnectorTemplate.id)
            .where(
                ConnectorInstance.revision_id == revision_id,
                ConnectorInstance.pcb_instance_id.is_(None),
                ConnectorInstance.is_panel_mount.is_(False),
                ConnectorTemplate.connector_category == ConnectorCategory.WIRE_TO_WIRE,
                ConnectorTemplate.is_inline_template.is_(True),
            )
            .order_by(ConnectorInstance.created_at)
        )
        if enclosure_instance_id is None:
            q = q.where(ConnectorInstance.enclosure_instance_id.is_(None))
        else:
            q = q.where(ConnectorInstance.enclosure_instance_id == enclosure_instance_id)

        result = await self.db.execute(q)
        for conn, tmpl in result.all():
            parent.children.append(
                await self._build_connector_node(conn, tmpl, slot_lookup)
            )

    async def _slot_lookup(self, revision_id: UUID) -> dict:
        lookup: dict = {}
        for slot_id, slot_key, nickname in (
            await self.db.execute(
                select(
                    PcbTemplateConnectorSlot.id,
                    PcbTemplateConnectorSlot.slot_key,
                    PcbTemplateConnectorSlot.nickname,
                ).where(
                    PcbTemplateConnectorSlot.pcb_template_id.in_(
                        select(PcbInstance.pcb_template_id).where(
                            PcbInstance.revision_id == revision_id
                        )
                    )
                )
            )
        ).all():
            lookup[slot_id] = (slot_key, nickname)
        for slot_id, slot_key in (
            await self.db.execute(
                select(EnclosureTemplatePanelSlot.id, EnclosureTemplatePanelSlot.slot_key).where(
                    EnclosureTemplatePanelSlot.enclosure_template_id.in_(
                        select(EnclosureInstance.enclosure_template_id).where(
                            EnclosureInstance.revision_id == revision_id
                        )
                    )
                )
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
