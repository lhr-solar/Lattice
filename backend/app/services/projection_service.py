from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infra.db.models.catalog import ConnectorTemplate
from app.infra.db.models.instances import (
    ConnectorInstance,
    EnclosureInstance,
    PcbInstance,
    Pin,
)
from app.infra.db.models.layout import NodeLayout
from app.infra.db.models.templates import (
    EnclosureTemplate,
    EnclosureTemplatePanelSlot,
    PcbTemplate,
    PcbTemplateConnectorSlot,
)
from app.infra.db.models.shorts import ConnectorInstancePinShort
from app.infra.db.models.topology import ConnectionEdge, PinSignalAssignment, Signal
from app.core.display import (
    resolve_connector_labels,
    resolve_connector_with_slot,
    resolve_display_name,
)
from app.schemas.projections import (
    BusGroupDto,
    DesignEdgeDto,
    DesignGraphProjectionDto,
    DesignNodeDto,
    ProjectionLevel,
)


class ProjectionService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def build_design_projection(
        self,
        revision_id: UUID,
        level: ProjectionLevel,
        view_key: str,
        focus_id: UUID | None = None,
    ) -> DesignGraphProjectionDto:
        layouts = await self._load_layouts(revision_id, view_key)

        if level == "vehicle":
            return await self._vehicle_projection(revision_id, view_key, layouts)
        if level == "enclosure":
            return await self._enclosure_projection(revision_id, view_key, layouts, focus_id)
        if level == "node":
            return await self._node_projection(revision_id, view_key, layouts, focus_id)
        if level == "connector":
            return await self._connector_projection(revision_id, view_key, layouts, focus_id)
        return await self._pin_projection(revision_id, view_key, layouts, focus_id)

    async def _vehicle_projection(
        self, revision_id: UUID, view_key: str, layouts: dict[str, tuple[float, float]]
    ) -> DesignGraphProjectionDto:
        enclosure_rows = (
            await self.db.execute(
                select(EnclosureInstance, EnclosureTemplate)
                .join(EnclosureTemplate, EnclosureInstance.enclosure_template_id == EnclosureTemplate.id)
                .where(EnclosureInstance.revision_id == revision_id)
            )
        ).all()
        top_node_rows = (
            await self.db.execute(
                select(PcbInstance, PcbTemplate)
                .join(PcbTemplate, PcbInstance.pcb_template_id == PcbTemplate.id)
                .where(PcbInstance.revision_id == revision_id, PcbInstance.enclosure_instance_id.is_(None))
            )
        ).all()

        item_specs: list[dict] = []
        for idx, (enc, tmpl) in enumerate(enclosure_rows):
            enc_label, enc_template = resolve_connector_labels(
                template_name=tmpl.name, nickname=enc.nickname, use_template_name=enc.use_template_name
            )
            item_specs.append(
                {
                    "item_id": f"enclosure:{enc.id}",
                    "item_kind": "vehicleItem",
                    "item_label": enc_label,
                    "item_template_label": enc_template,
                    "item_position": layouts.get(f"enclosure:{enc.id}") or (90 + idx * 520, 100),
                    "connectors": await self._vehicle_level_connectors_for_enclosure(revision_id, enc.id),
                }
            )
        for idx, (node_inst, tmpl) in enumerate(top_node_rows):
            node_label, node_template = resolve_connector_labels(
                template_name=tmpl.name,
                nickname=node_inst.nickname,
                use_template_name=node_inst.use_template_name,
            )
            item_specs.append(
                {
                    "item_id": f"node:{node_inst.id}",
                    "item_kind": "vehicleItem",
                    "item_label": node_label,
                    "item_template_label": node_template,
                    "item_position": layouts.get(f"node:{node_inst.id}") or (90 + idx * 520, 460),
                    "connectors": await self._connectors_for_node(revision_id, node_inst.id),
                }
            )
        return await self._build_grouped_pin_projection(
            revision_id=revision_id,
            level="vehicle",
            view_key=view_key,
            item_specs=item_specs,
            harness_scope=None,
            enclosure_id_for_internal=None,
            meta={},
        )

    async def _enclosure_projection(
        self,
        revision_id: UUID,
        view_key: str,
        layouts: dict[str, tuple[float, float]],
        enclosure_id: UUID | None,
    ) -> DesignGraphProjectionDto:
        if not enclosure_id:
            return DesignGraphProjectionDto(
                revision_id=revision_id,
                level="enclosure",
                view_key=view_key,
                nodes=[],
                edges=[],
                meta={"error": "focus_id required for enclosure level"},
            )
        node_rows = (
            await self.db.execute(
                select(PcbInstance, PcbTemplate)
                .join(PcbTemplate, PcbInstance.pcb_template_id == PcbTemplate.id)
                .where(
                    PcbInstance.revision_id == revision_id,
                    PcbInstance.enclosure_instance_id == enclosure_id,
                )
            )
        ).all()

        item_specs: list[dict] = []
        panel_connectors = await self._panel_connectors_for_enclosure(revision_id, enclosure_id)
        item_specs.append(
            {
                "item_id": f"enclosure-panel:{enclosure_id}",
                "item_kind": "enclosurePanelItem",
                "item_label": "Panel / Pigtail",
                "item_position": layouts.get(f"enclosure-panel:{enclosure_id}") or (90, 80),
                "connectors": panel_connectors,
            }
        )
        for idx, (node_inst, tmpl) in enumerate(node_rows):
            node_key = f"node:{node_inst.id}"
            # Exported pigtail connectors are represented in the Panel / Pigtail
            # item above, so exclude them here to avoid duplicate pin port nodes.
            node_connectors = [
                (conn, ctmpl)
                for conn, ctmpl in await self._connectors_for_node(revision_id, node_inst.id)
                if conn.source_pcb_instance_id is None
            ]
            node_label, node_template = resolve_connector_labels(
                template_name=tmpl.name,
                nickname=node_inst.nickname,
                use_template_name=node_inst.use_template_name,
            )
            item_specs.append(
                {
                    "item_id": node_key,
                    "item_kind": "nodeItem",
                    "item_label": node_label,
                    "item_template_label": node_template,
                    "item_position": layouts.get(node_key) or (90 + idx * 520, 360),
                    "connectors": node_connectors,
                }
            )
        return await self._build_grouped_pin_projection(
            revision_id=revision_id,
            level="enclosure",
            view_key=view_key,
            item_specs=item_specs,
            harness_scope="internal",
            enclosure_id_for_internal=enclosure_id,
            meta={"enclosureId": str(enclosure_id)},
        )

    async def _connector_projection(
        self,
        revision_id: UUID,
        view_key: str,
        layouts: dict[str, tuple[float, float]],
        connector_id: UUID | None,
    ) -> DesignGraphProjectionDto:
        if not connector_id:
            return DesignGraphProjectionDto(
                revision_id=revision_id, level="connector", view_key=view_key, nodes=[], edges=[]
            )

        pins = (
            await self.db.execute(
                select(Pin)
                .where(Pin.revision_id == revision_id, Pin.connector_instance_id == connector_id)
                .order_by(Pin.pin_number)
            )
        ).scalars().all()
        pin_ids = [pin.id for pin in pins]
        net_by_pin = await self._pin_net_names(revision_id, pin_ids)
        nodes = []
        for i, pin in enumerate(pins):
            nid = f"pin-box:{pin.id}"
            pos = layouts.get(nid)
            net_name = net_by_pin.get(pin.id, "UNASSIGNED")
            nodes.append(
                DesignNodeDto(
                    id=nid,
                    kind="connectorPinBox",
                    label=f"{pin.pin_number} · {net_name}",
                    position={"x": pos[0], "y": pos[1]} if pos else {"x": 120, "y": 80 + i * 72},
                    data={
                        "pinId": str(pin.id),
                        "pinNumber": pin.pin_number,
                        "pinName": pin.name,
                        "netName": net_name,
                    },
                )
            )

        # Connector view is for pin/net assignment only.
        return DesignGraphProjectionDto(
            revision_id=revision_id,
            level="connector",
            view_key=view_key,
            nodes=nodes,
            edges=[],
            meta={"connectorId": str(connector_id)},
        )

    async def _pin_projection(
        self,
        revision_id: UUID,
        view_key: str,
        layouts: dict[str, tuple[float, float]],
        pin_id: UUID | None,
    ) -> DesignGraphProjectionDto:
        if not pin_id:
            return DesignGraphProjectionDto(
                revision_id=revision_id, level="pin", view_key=view_key, nodes=[], edges=[]
            )
        pin = await self.db.get(Pin, pin_id)
        if not pin:
            return DesignGraphProjectionDto(
                revision_id=revision_id, level="pin", view_key=view_key, nodes=[], edges=[]
            )
        nid = f"pin:{pin.id}"
        pos = layouts.get(nid)
        nodes = [
            DesignNodeDto(
                id=nid,
                kind="pin",
                label=f"{pin.pin_number}: {pin.name}",
                position={"x": pos[0], "y": pos[1]} if pos else {"x": 200, "y": 200},
                data={"pinId": str(pin.id)},
            )
        ]
        return DesignGraphProjectionDto(
            revision_id=revision_id, level="pin", view_key=view_key, nodes=nodes, edges=[], meta={}
        )

    async def _node_projection(
        self,
        revision_id: UUID,
        view_key: str,
        layouts: dict[str, tuple[float, float]],
        node_id: UUID | None,
    ) -> DesignGraphProjectionDto:
        if not node_id:
            return DesignGraphProjectionDto(
                revision_id=revision_id,
                level="node",
                view_key=view_key,
                nodes=[],
                edges=[],
                meta={"error": "focus_id required for node level"},
            )
        node = await self.db.get(PcbInstance, node_id)
        if not node or node.revision_id != revision_id:
            return DesignGraphProjectionDto(
                revision_id=revision_id,
                level="node",
                view_key=view_key,
                nodes=[],
                edges=[],
                meta={"error": "node not found"},
            )
        tmpl = await self.db.get(PcbTemplate, node.pcb_template_id)
        node_label, node_template = resolve_connector_labels(
            template_name=tmpl.name if tmpl else "?",
            nickname=node.nickname,
            use_template_name=node.use_template_name,
        )
        connectors = await self._connectors_for_node(revision_id, node_id)
        base = await self._build_grouped_pin_projection(
            revision_id=revision_id,
            level="node",
            view_key=view_key,
            item_specs=[
                {
                    "item_id": f"node:{node.id}",
                    "item_kind": "nodeItem",
                    "item_label": node_label,
                    "item_template_label": node_template,
                    "item_position": layouts.get(f"node:{node.id}") or (120, 120),
                    "connectors": connectors,
                }
            ],
            harness_scope=None,
            enclosure_id_for_internal=None,
            meta={"nodeId": str(node_id)},
        )
        displayed_pin_ids = {
            UUID(str(n.data.get("pinId")))
            for n in base.nodes
            if n.kind == "pinPort" and n.data.get("pinId") is not None
        }
        short_edges = await self._short_edges_for_displayed_pins(revision_id, displayed_pin_ids)
        return DesignGraphProjectionDto(
            revision_id=base.revision_id,
            level=base.level,
            view_key=base.view_key,
            nodes=base.nodes,
            edges=short_edges,
            bus_groups=base.bus_groups,
            meta=base.meta,
        )

    async def _build_grouped_pin_projection(
        self,
        *,
        revision_id: UUID,
        level: ProjectionLevel,
        view_key: str,
        item_specs: list[dict],
        harness_scope: str | None,
        enclosure_id_for_internal: UUID | None,
        meta: dict,
    ) -> DesignGraphProjectionDto:
        nodes: list[DesignNodeDto] = []
        edges: list[DesignEdgeDto] = []
        pin_to_port_node: dict[UUID, str] = {}

        all_pin_ids: list[UUID] = []
        for item in item_specs:
            for conn, _tmpl in item["connectors"]:
                pins = await self._pins_for_connector(revision_id, conn.id)
                all_pin_ids.extend([pin.id for pin in pins])
        net_by_pin = await self._pin_net_names(revision_id, all_pin_ids)
        slot_lookup = await self._slot_lookup(revision_id)

        for item in item_specs:
            item_id = item["item_id"]
            ix, iy = item["item_position"]
            container_data: dict = {"container": True}
            if item.get("item_template_label"):
                container_data["templateLabel"] = item["item_template_label"]
            nodes.append(
                DesignNodeDto(
                    id=item_id,
                    kind=item["item_kind"],
                    label=item["item_label"],
                    position={"x": ix, "y": iy},
                    data=container_data,
                )
            )
            group_index = 0
            for conn, tmpl in item["connectors"]:
                slot_key, slot_nickname = self._slot_for_connector(conn, slot_lookup)
                connector_label, template_label, slot_chip = resolve_connector_with_slot(
                    template_name=tmpl.name,
                    instance_nickname=conn.nickname,
                    use_template_name=conn.use_template_name,
                    slot_key=slot_key,
                    slot_nickname=slot_nickname,
                )
                group_id = f"group:{item_id}:{conn.id}"
                group_y = 50 + group_index * 94
                nodes.append(
                    DesignNodeDto(
                        id=group_id,
                        kind="connectorGroup",
                        label=connector_label,
                        parent_id=item_id,
                        position={"x": 18, "y": group_y},
                        data={
                            "connectorInstanceId": str(conn.id),
                            "templateLabel": template_label,
                            "slotKey": slot_chip,
                            "isPigtail": bool(conn.source_pcb_instance_id),
                            "isPanelMount": conn.is_panel_mount,
                            "groupBorder": "dotted" if conn.source_pcb_instance_id else "solid",
                        },
                    )
                )
                pins = await self._pins_for_connector(revision_id, conn.id)
                for pin_idx, pin in enumerate(pins):
                    port_id = f"port:{pin.id}"
                    net_name = net_by_pin.get(pin.id, "UNASSIGNED")
                    nodes.append(
                        DesignNodeDto(
                            id=port_id,
                            kind="pinPort",
                            label=f"{pin.pin_number} · {net_name}",
                            parent_id=group_id,
                            position={"x": 218, "y": 16 + pin_idx * 20},
                            data={
                                "pinId": str(pin.id),
                                "pinNumber": pin.pin_number,
                                "pinName": pin.name,
                                "netName": net_name,
                                "connectorInstanceId": str(conn.id),
                            },
                        )
                    )
                    pin_to_port_node[pin.id] = port_id
                group_index += 1

        edges_result = await self.db.execute(select(ConnectionEdge).where(ConnectionEdge.revision_id == revision_id))
        seen_pairs: set[tuple[str, str]] = set()
        for edge in edges_result.scalars().all():
            if harness_scope is not None:
                scope = edge.harness_scope.value if hasattr(edge.harness_scope, "value") else edge.harness_scope
                if scope != harness_scope:
                    continue
            if enclosure_id_for_internal is not None and (
                edge.enclosure_a_id != enclosure_id_for_internal
                or edge.enclosure_b_id != enclosure_id_for_internal
            ):
                continue
            src = pin_to_port_node.get(edge.pin_a_id)
            tgt = pin_to_port_node.get(edge.pin_b_id)
            if not src or not tgt or src == tgt:
                continue
            pair = tuple(sorted((src, tgt)))
            if pair in seen_pairs:
                continue
            seen_pairs.add(pair)
            edges.append(
                DesignEdgeDto(
                    id=str(edge.id),
                    source=src,
                    target=tgt,
                    label=edge.wire_color or edge.signal_type,
                    data={"edgeIds": [str(edge.id)]},
                )
            )

        return DesignGraphProjectionDto(
            revision_id=revision_id,
            level=level,
            view_key=view_key,
            nodes=nodes,
            edges=edges,
            bus_groups=await self._bus_groups(revision_id),
            meta=meta | {"nodeCount": len(nodes), "edgeCount": len(edges)},
        )

    async def _vehicle_level_connectors_for_enclosure(
        self, revision_id: UUID, enclosure_id: UUID
    ) -> list[tuple[ConnectorInstance, ConnectorTemplate]]:
        rows = (
            await self.db.execute(
                select(ConnectorInstance, ConnectorTemplate)
                .join(ConnectorTemplate, ConnectorInstance.connector_template_id == ConnectorTemplate.id)
                .where(
                    ConnectorInstance.revision_id == revision_id,
                    ConnectorInstance.enclosure_instance_id == enclosure_id,
                )
            )
        ).all()
        return [
            (conn, tmpl)
            for conn, tmpl in rows
            if conn.pcb_instance_id is None or conn.source_pcb_instance_id is not None
        ]

    async def _panel_connectors_for_enclosure(
        self, revision_id: UUID, enclosure_id: UUID
    ) -> list[tuple[ConnectorInstance, ConnectorTemplate]]:
        rows = (
            await self.db.execute(
                select(ConnectorInstance, ConnectorTemplate)
                .join(ConnectorTemplate, ConnectorInstance.connector_template_id == ConnectorTemplate.id)
                .where(
                    ConnectorInstance.revision_id == revision_id,
                    ConnectorInstance.enclosure_instance_id == enclosure_id,
                )
            )
        ).all()
        return [
            (conn, tmpl)
            for conn, tmpl in rows
            if conn.is_panel_mount or conn.source_pcb_instance_id is not None
        ]

    async def _connectors_for_node(
        self, revision_id: UUID, node_id: UUID
    ) -> list[tuple[ConnectorInstance, ConnectorTemplate]]:
        return (
            await self.db.execute(
                select(ConnectorInstance, ConnectorTemplate)
                .join(ConnectorTemplate, ConnectorInstance.connector_template_id == ConnectorTemplate.id)
                .where(
                    ConnectorInstance.revision_id == revision_id,
                    ConnectorInstance.pcb_instance_id == node_id,
                )
            )
        ).all()

    async def _pins_for_connector(self, revision_id: UUID, connector_id: UUID) -> list[Pin]:
        return (
            await self.db.execute(
                select(Pin)
                .where(Pin.revision_id == revision_id, Pin.connector_instance_id == connector_id)
                .order_by(Pin.pin_number)
            )
        ).scalars().all()

    async def _pin_net_names(self, revision_id: UUID, pin_ids: list[UUID]) -> dict[UUID, str]:
        if not pin_ids:
            return {}
        rows = (
            await self.db.execute(
                select(PinSignalAssignment.pin_id, Signal.name)
                .join(Signal, PinSignalAssignment.signal_id == Signal.id)
                .where(
                    PinSignalAssignment.revision_id == revision_id,
                    PinSignalAssignment.assignment_role == "primary",
                    PinSignalAssignment.pin_id.in_(pin_ids),
                )
            )
        ).all()
        mapping: dict[UUID, str] = {}
        for pin_id, net_name in rows:
            mapping[pin_id] = net_name
        return mapping

    async def _short_edges_for_displayed_pins(
        self, revision_id: UUID, pin_ids: set[UUID]
    ) -> list[DesignEdgeDto]:
        if not pin_ids:
            return []
        conn_rows = (await self.db.execute(select(Pin.connector_instance_id).where(Pin.id.in_(list(pin_ids))))).all()
        connector_ids = {row[0] for row in conn_rows if row[0] is not None}
        if not connector_ids:
            return []
        shorts = (
            await self.db.execute(
                select(ConnectorInstancePinShort).where(
                    ConnectorInstancePinShort.revision_id == revision_id,
                    ConnectorInstancePinShort.connector_instance_id.in_(list(connector_ids)),
                )
            )
        ).scalars().all()
        edge_dtos: list[DesignEdgeDto] = []
        for short in shorts:
            if short.pin_a_id not in pin_ids or short.pin_b_id not in pin_ids:
                continue
            edge_dtos.append(
                DesignEdgeDto(
                    id=f"short:{short.id}",
                    source=f"port:{short.pin_a_id}",
                    target=f"port:{short.pin_b_id}",
                    kind="short",
                    label="no-harness short",
                    data={
                        "short": True,
                        "shortId": str(short.id),
                        "connectorInstanceId": str(short.connector_instance_id),
                    },
                )
            )
        return edge_dtos

    async def _bus_groups(self, revision_id: UUID) -> list[BusGroupDto]:
        result = await self.db.execute(
            select(Signal).where(Signal.revision_id == revision_id, Signal.bus_group_id.isnot(None))
        )
        groups: dict[UUID, list[UUID]] = {}
        for sig in result.scalars().all():
            if sig.bus_group_id:
                groups.setdefault(sig.bus_group_id, []).append(sig.id)
        return [
            BusGroupDto(
                id=str(gid),
                label=f"Bus {str(gid)[:8]}",
                signal_ids=[str(s) for s in sids],
                collapsed=True,
            )
            for gid, sids in groups.items()
        ]

    async def _slot_lookup(self, revision_id: UUID) -> dict[UUID, tuple[str, str | None]]:
        """Map template-slot id -> (slot_key, slot_nickname)."""
        lookup: dict[UUID, tuple[str, str | None]] = {}
        for slot_id, slot_key, nickname in (
            await self.db.execute(
                select(
                    PcbTemplateConnectorSlot.id,
                    PcbTemplateConnectorSlot.slot_key,
                    PcbTemplateConnectorSlot.nickname,
                )
                .join(PcbTemplate, PcbTemplateConnectorSlot.pcb_template_id == PcbTemplate.id)
                .join(PcbInstance, PcbInstance.pcb_template_id == PcbTemplate.id)
                .where(PcbInstance.revision_id == revision_id)
            )
        ).all():
            lookup[slot_id] = (slot_key, nickname)
        for slot_id, slot_key in (
            await self.db.execute(
                select(EnclosureTemplatePanelSlot.id, EnclosureTemplatePanelSlot.slot_key)
                .join(
                    EnclosureTemplate,
                    EnclosureTemplatePanelSlot.enclosure_template_id == EnclosureTemplate.id,
                )
                .join(
                    EnclosureInstance,
                    EnclosureInstance.enclosure_template_id == EnclosureTemplate.id,
                )
                .where(EnclosureInstance.revision_id == revision_id)
            )
        ).all():
            lookup[slot_id] = (slot_key, None)
        return lookup

    @staticmethod
    def _slot_for_connector(
        conn: ConnectorInstance, lookup: dict[UUID, tuple[str, str | None]]
    ) -> tuple[str | None, str | None]:
        for slot_id in (
            conn.pcb_template_slot_id,
            conn.enclosure_panel_slot_id,
            conn.source_pcb_template_slot_id,
        ):
            if slot_id and slot_id in lookup:
                return lookup[slot_id]
        return None, None

    async def _load_layouts(self, revision_id: UUID, view_key: str) -> dict[str, tuple[float, float]]:
        result = await self.db.execute(
            select(NodeLayout).where(NodeLayout.revision_id == revision_id, NodeLayout.view_key == view_key)
        )
        layouts: dict[str, tuple[float, float]] = {}
        for layout in result.scalars().all():
            key = f"{layout.entity_kind.value}:{layout.entity_id}"
            layouts[key] = (layout.x, layout.y)
        return layouts
