from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infra.db.enums import ConnectorCategory
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
from app.domains.connectors.export import connector_kind_for_instance, is_inline_connector_template, is_pigtail_instance
from app.schemas.projections import (
    BusGroupDto,
    DesignEdgeDto,
    DesignGraphProjectionDto,
    DesignNodeDto,
    ProjectionLevel,
    TopologyGraphEdgeDto,
    TopologyGraphNodeDto,
    TopologyGraphProjectionDto,
)


@dataclass
class OwnershipResolver:
    """Resolves a pin or connector to the top-level graph node that owns it.

    Backed entirely by bulk precomputed maps so every resolution is a pure
    in-memory lookup/walk (no per-pin database queries). Used by
    ``build_topology_graph_projection`` to attribute each ``ConnectionEdge``
    pin to either its top-level enclosure node or a standalone PCB node.

    Ownership chain (Req 2.6):
      pin -> connector instance -> (pcb instance -> enclosure instance)
                                 or (enclosure panel slot -> enclosure instance)
    Sub-enclosures roll up to their top-level ancestor enclosure node.
    """

    enclosure_by_pcb: dict[UUID, UUID | None]
    parent_by_enclosure: dict[UUID, UUID | None]
    standalone_pcb_ids: set[UUID]
    connector_by_pin: dict[UUID, ConnectorInstance]

    def top_level_node_for_enclosure(self, enclosure_id: UUID) -> str:
        """Walk ``parent_enclosure_instance_id`` up to the top-level ancestor.

        Returns the graph node id (``"tg-node:{root_enclosure_id}"``) for the
        top-level enclosure that became a graph node. Guards against cycles.
        """
        root = enclosure_id
        seen: set[UUID] = set()
        while root not in seen:
            seen.add(root)
            parent = self.parent_by_enclosure.get(root)
            if parent is None:
                break
            root = parent
        return f"tg-node:{root}"

    def resolve_owner_node_id(self, conn: ConnectorInstance) -> str | None:
        """Resolve a connector instance to its owning graph node id, or None.

        Board connectors resolve to their PCB's top-level enclosure (or the
        standalone PCB node); panel mounts / enclosure-attached connectors
        resolve to the top-level enclosure; inline / unattached connectors
        with no PCB or enclosure owner resolve to ``None``.
        """
        # 1. Board connector: seated in a PCB.
        pcb_id = conn.pcb_instance_id or conn.source_pcb_instance_id
        if pcb_id is not None:
            enclosure_id = self.enclosure_by_pcb.get(pcb_id)
            if enclosure_id is not None:
                return self.top_level_node_for_enclosure(enclosure_id)
            if pcb_id in self.standalone_pcb_ids:
                return f"tg-node:{pcb_id}"
            return None
        # 2. Panel mount / enclosure-attached connector.
        if conn.enclosure_instance_id is not None:
            return self.top_level_node_for_enclosure(conn.enclosure_instance_id)
        # 3. Inline / wire-to-wire connector with no PCB or enclosure owner.
        return None

    def owner_node_id_for_pin(self, pin_id: UUID) -> str | None:
        """Resolve a pin id to its owning graph node id via its connector."""
        conn = self.connector_by_pin.get(pin_id)
        if conn is None:
            return None
        return self.resolve_owner_node_id(conn)


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

    async def build_topology_graph_projection(
        self,
        revision_id: UUID,
        view_key: str,
        saved_positions: dict[str, tuple[float, float]],
    ) -> TopologyGraphProjectionDto:
        """Build the flattened topology graph projection for a revision.

        Nodes are the top-level enclosures (``parent_enclosure_instance_id IS
        NULL``) and standalone PCBs (``enclosure_instance_id IS NULL``). Edges
        collapse every ``ConnectionEdge`` whose two pins resolve (via the
        ownership chain) to two distinct graph nodes into a single edge per
        unordered node pair, carrying a ``wire_count`` of the contributing
        edges. Self-loops and pins with no owning graph node are skipped.

        ``saved_positions`` maps a node ``id`` (``"tg-node:{uuid}"``) to an
        ``(x, y)`` pair; a node's ``position`` is populated from it when present
        and left ``None`` otherwise (so the frontend applies the circular
        layout).
        """
        # 1. Collect nodes: top-level enclosures + standalone PCBs.
        enclosure_rows = (
            await self.db.execute(
                select(EnclosureInstance, EnclosureTemplate)
                .join(
                    EnclosureTemplate,
                    EnclosureInstance.enclosure_template_id == EnclosureTemplate.id,
                )
                .where(
                    EnclosureInstance.revision_id == revision_id,
                    EnclosureInstance.parent_enclosure_instance_id.is_(None),
                )
            )
        ).all()
        pcb_rows = (
            await self.db.execute(
                select(PcbInstance, PcbTemplate)
                .join(PcbTemplate, PcbInstance.pcb_template_id == PcbTemplate.id)
                .where(
                    PcbInstance.revision_id == revision_id,
                    PcbInstance.enclosure_instance_id.is_(None),
                )
            )
        ).all()

        nodes: list[TopologyGraphNodeDto] = []
        valid_node_ids: set[str] = set()

        for enc, tmpl in enclosure_rows:
            node_id = f"tg-node:{enc.id}"
            label, template_label = resolve_connector_labels(
                template_name=tmpl.name,
                nickname=enc.nickname,
                use_template_name=enc.use_template_name,
            )
            nodes.append(
                TopologyGraphNodeDto(
                    id=node_id,
                    entity_kind="enclosure_instance",
                    label=label,
                    template_label=template_label,
                    position=self._position_from_saved(node_id, saved_positions),
                )
            )
            valid_node_ids.add(node_id)

        for pcb, tmpl in pcb_rows:
            node_id = f"tg-node:{pcb.id}"
            label, template_label = resolve_connector_labels(
                template_name=tmpl.name,
                nickname=pcb.nickname,
                use_template_name=pcb.use_template_name,
            )
            nodes.append(
                TopologyGraphNodeDto(
                    id=node_id,
                    entity_kind="pcb_instance",
                    label=label,
                    template_label=template_label,
                    position=self._position_from_saved(node_id, saved_positions),
                )
            )
            valid_node_ids.add(node_id)

        # 2. Resolve pin ownership via the bulk precomputed maps (task 2.1).
        resolver = await self._build_ownership_resolver(revision_id)

        # 3. Aggregate ConnectionEdge rows into one edge per unordered node pair.
        edge_rows = (
            await self.db.execute(
                select(ConnectionEdge.pin_a_id, ConnectionEdge.pin_b_id).where(
                    ConnectionEdge.revision_id == revision_id
                )
            )
        ).all()

        wire_count_by_pair: dict[tuple[str, str], int] = {}
        for pin_a_id, pin_b_id in edge_rows:
            node_a = resolver.owner_node_id_for_pin(pin_a_id)
            node_b = resolver.owner_node_id_for_pin(pin_b_id)
            # Skip pins not owned by a graph node (e.g. inline connectors).
            if node_a is None or node_b is None:
                continue
            if node_a not in valid_node_ids or node_b not in valid_node_ids:
                continue
            # Skip self-loops (Req 2.7).
            if node_a == node_b:
                continue
            pair = (node_a, node_b) if node_a < node_b else (node_b, node_a)
            wire_count_by_pair[pair] = wire_count_by_pair.get(pair, 0) + 1

        # 4. Emit one edge DTO per connected pair (ids sorted lexicographically).
        edges = [
            TopologyGraphEdgeDto(
                id=f"tg-edge:{node_a_id}:{node_b_id}",
                source=node_a_id,
                target=node_b_id,
                wire_count=count,
            )
            for (node_a_id, node_b_id), count in wire_count_by_pair.items()
        ]

        return TopologyGraphProjectionDto(
            revision_id=revision_id,
            view_key=view_key,
            nodes=nodes,
            edges=edges,
            meta={},
        )

    @staticmethod
    def _position_from_saved(
        node_id: str, saved_positions: dict[str, tuple[float, float]]
    ) -> dict[str, float] | None:
        """Return ``{"x", "y"}`` for a node id when saved, else ``None``."""
        saved = saved_positions.get(node_id)
        if saved is None:
            return None
        return {"x": saved[0], "y": saved[1]}

    async def _vehicle_projection(
        self, revision_id: UUID, view_key: str, layouts: dict[str, tuple[float, float]]
    ) -> DesignGraphProjectionDto:
        enclosure_rows = (
            await self.db.execute(
                select(EnclosureInstance, EnclosureTemplate)
                .join(EnclosureTemplate, EnclosureInstance.enclosure_template_id == EnclosureTemplate.id)
                .where(
                    EnclosureInstance.revision_id == revision_id,
                    EnclosureInstance.parent_enclosure_instance_id.is_(None),
                )
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
        await self._append_inline_connectors_to_item_specs(
            item_specs,
            revision_id,
            layouts,
            enclosure_instance_id=None,
            y_offset=620,
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
        panel_y = 80
        # Rough vertical estimate so downstream default layouts do not overlap.
        panel_height_estimate = 120 + len(panel_connectors) * 96
        child_y = max(220, panel_y + panel_height_estimate + 48)
        child_enclosure_rows = (
            await self.db.execute(
                select(EnclosureInstance, EnclosureTemplate)
                .join(EnclosureTemplate, EnclosureInstance.enclosure_template_id == EnclosureTemplate.id)
                .where(
                    EnclosureInstance.revision_id == revision_id,
                    EnclosureInstance.parent_enclosure_instance_id == enclosure_id,
                )
            )
        ).all()
        child_specs: list[tuple[EnclosureInstance, EnclosureTemplate, list[tuple[ConnectorInstance, ConnectorTemplate]]]] = []
        for child_enc, child_tmpl in child_enclosure_rows:
            child_connectors = await self._enclosure_surface_connectors(revision_id, child_enc.id)
            child_specs.append((child_enc, child_tmpl, child_connectors))
        max_child_connectors = max((len(connectors) for _, _, connectors in child_specs), default=0)
        child_height_estimate = 120 + max_child_connectors * 96
        node_y = max(360, child_y + child_height_estimate + 48)
        for idx, (child_enc, child_tmpl, child_connectors) in enumerate(child_specs):
            child_label, child_template = resolve_connector_labels(
                template_name=child_tmpl.name,
                nickname=child_enc.nickname,
                use_template_name=child_enc.use_template_name,
            )
            item_specs.append(
                {
                    "item_id": f"enclosure:{child_enc.id}",
                    "item_kind": "vehicleItem",
                    "item_label": child_label,
                    "item_template_label": child_template,
                    "item_position": layouts.get(f"enclosure:{child_enc.id}") or (90 + idx * 520, child_y),
                    "connectors": child_connectors,
                }
            )
        item_specs.append(
            {
                "item_id": f"enclosure-panel:{enclosure_id}",
                "item_kind": "enclosurePanelItem",
                "item_label": "Panel / Pigtail",
                "item_position": layouts.get(f"enclosure-panel:{enclosure_id}") or (90, panel_y),
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
                    "item_position": layouts.get(node_key) or (90 + idx * 520, node_y),
                    "connectors": node_connectors,
                }
            )
        await self._append_inline_connectors_to_item_specs(
            item_specs,
            revision_id,
            layouts,
            enclosure_instance_id=enclosure_id,
            y_offset=node_y + 180,
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

        conn = await self.db.get(ConnectorInstance, connector_id)
        if not conn or conn.revision_id != revision_id:
            return DesignGraphProjectionDto(
                revision_id=revision_id,
                level="connector",
                view_key=view_key,
                nodes=[],
                edges=[],
                meta={"error": "connector not found"},
            )
        tmpl = await self.db.get(ConnectorTemplate, conn.connector_template_id)
        if (
            tmpl
            and is_inline_connector_template(tmpl)
            and conn.pcb_instance_id is None
            and not conn.is_panel_mount
        ):
            label, template_label = resolve_connector_labels(
                template_name=tmpl.name,
                nickname=conn.nickname,
                use_template_name=conn.use_template_name,
            )
            return await self._build_grouped_pin_projection(
                revision_id=revision_id,
                level="connector",
                view_key=view_key,
                item_specs=[
                    {
                        "item_id": f"inline:{conn.id}",
                        "item_kind": "nodeItem",
                        "item_label": label,
                        "item_template_label": template_label,
                        "item_position": layouts.get(f"inline:{conn.id}") or (120, 120),
                        "connectors": [(conn, tmpl)],
                        "hide_title": True,
                    }
                ],
                harness_scope=None,
                enclosure_id_for_internal=None,
                meta={"connectorId": str(connector_id)},
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

        connector_ids = [conn.id for item in item_specs for conn, _ in item["connectors"]]
        pins_by_connector = await self._pins_for_connectors(revision_id, connector_ids)
        all_pin_ids = [pin.id for pins in pins_by_connector.values() for pin in pins]
        net_by_pin = await self._pin_net_names(revision_id, all_pin_ids)
        slot_lookup = await self._slot_lookup(revision_id)

        for item in item_specs:
            item_id = item["item_id"]
            ix, iy = item["item_position"]
            container_data: dict = {"container": True}
            if item.get("hide_title"):
                container_data["hideTitle"] = True
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
                            "isPigtail": is_pigtail_instance(conn, tmpl),
                            "isPanelMount": conn.is_panel_mount,
                            "isInline": bool(
                                is_inline_connector_template(tmpl) and conn.pcb_instance_id is None
                            ),
                            "groupBorder": "dotted" if is_pigtail_instance(conn, tmpl) else "solid",
                        },
                    )
                )
                pins = pins_by_connector.get(conn.id, [])
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

    async def _inline_connectors_for_scope(
        self,
        revision_id: UUID,
        *,
        enclosure_instance_id: UUID | None,
    ) -> list[tuple[ConnectorInstance, ConnectorTemplate]]:
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
        return list((await self.db.execute(q)).all())

    async def _append_inline_connectors_to_item_specs(
        self,
        item_specs: list[dict],
        revision_id: UUID,
        layouts: dict[str, tuple[float, float]],
        *,
        enclosure_instance_id: UUID | None,
        y_offset: int,
    ) -> None:
        inlines = await self._inline_connectors_for_scope(
            revision_id, enclosure_instance_id=enclosure_instance_id
        )
        if not inlines:
            return

        if enclosure_instance_id is None:
            node_items = [
                item
                for item in item_specs
                if item["item_kind"] == "vehicleItem" and item["item_id"].startswith("node:")
            ]
            if node_items:
                node_items[0]["connectors"].extend(inlines)
                return
            for idx, (conn, tmpl) in enumerate(inlines):
                label, template_label = resolve_connector_labels(
                    template_name=tmpl.name,
                    nickname=conn.nickname,
                    use_template_name=conn.use_template_name,
                )
                item_id = f"inline:{conn.id}"
                item_specs.append(
                    {
                        "item_id": item_id,
                        "item_kind": "nodeItem",
                        "item_label": label,
                        "item_template_label": template_label,
                        "item_position": layouts.get(item_id) or (90 + idx * 320, y_offset),
                        "connectors": [(conn, tmpl)],
                        "hide_title": True,
                    }
                )
            return

        node_items = [
            item
            for item in item_specs
            if item["item_kind"] == "nodeItem" and item["item_id"].startswith("node:")
        ]
        if node_items:
            node_items[0]["connectors"].extend(inlines)
            return
        panel_id = f"enclosure-panel:{enclosure_instance_id}"
        panel_items = [item for item in item_specs if item["item_id"] == panel_id]
        if panel_items:
            panel_items[0]["connectors"].extend(inlines)

    async def _template_panel_slot_ids(self, enclosure_template_id: UUID) -> set[UUID]:
        return set(
            (
                await self.db.execute(
                    select(EnclosureTemplatePanelSlot.id).where(
                        EnclosureTemplatePanelSlot.enclosure_template_id == enclosure_template_id
                    )
                )
            ).scalars().all()
        )

    async def _descendant_enclosure_ids(self, enclosure_id: UUID) -> set[UUID]:
        descendants: set[UUID] = set()
        frontier = [enclosure_id]
        while frontier:
            rows = (
                await self.db.execute(
                    select(EnclosureInstance.id).where(
                        EnclosureInstance.parent_enclosure_instance_id.in_(frontier)
                    )
                )
            ).scalars().all()
            next_frontier = [row for row in rows if row not in descendants]
            descendants.update(next_frontier)
            frontier = next_frontier
        return descendants

    async def _connectors_for_enclosure_instance(
        self, revision_id: UUID, enclosure_id: UUID
    ) -> list[tuple[ConnectorInstance, ConnectorTemplate]]:
        enc = await self.db.get(EnclosureInstance, enclosure_id)
        if not enc:
            return []

        own_template_slot_ids = await self._template_panel_slot_ids(enc.enclosure_template_id)
        direct_pcb_ids = set(await self._pcb_ids_for_enclosure(enclosure_id))

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

        result: list[tuple[ConnectorInstance, ConnectorTemplate]] = []
        for conn, tmpl in rows:
            if (
                is_inline_connector_template(tmpl)
                and conn.pcb_instance_id is None
                and not conn.is_panel_mount
            ):
                continue
            if conn.is_panel_mount and conn.source_pcb_instance_id is None:
                if (
                    conn.enclosure_instance_id == enclosure_id
                    or (
                        conn.enclosure_panel_slot_id
                        and conn.enclosure_panel_slot_id in own_template_slot_ids
                    )
                ):
                    result.append((conn, tmpl))
            elif conn.source_pcb_instance_id and conn.source_pcb_instance_id in direct_pcb_ids:
                result.append((conn, tmpl))
        return result

    async def _enclosure_surface_connectors(
        self, revision_id: UUID, enclosure_id: UUID
    ) -> list[tuple[ConnectorInstance, ConnectorTemplate]]:
        return await self._connectors_for_enclosure_instance(revision_id, enclosure_id)

    async def _vehicle_level_connectors_for_enclosure(
        self, revision_id: UUID, enclosure_id: UUID
    ) -> list[tuple[ConnectorInstance, ConnectorTemplate]]:
        return await self._connectors_for_enclosure_instance(revision_id, enclosure_id)

    async def _panel_connectors_for_enclosure(
        self, revision_id: UUID, enclosure_id: UUID
    ) -> list[tuple[ConnectorInstance, ConnectorTemplate]]:
        enc = await self.db.get(EnclosureInstance, enclosure_id)
        if not enc:
            return []

        own_template_slot_ids = await self._template_panel_slot_ids(enc.enclosure_template_id)
        direct_pcb_ids = set(await self._pcb_ids_for_enclosure(enclosure_id))
        descendant_ids = await self._descendant_enclosure_ids(enclosure_id)
        descendant_template_ids: set[UUID] = set()
        if descendant_ids:
            descendant_template_ids = set(
                (
                    await self.db.execute(
                        select(EnclosureInstance.enclosure_template_id).where(
                            EnclosureInstance.id.in_(descendant_ids)
                        )
                    )
                ).scalars().all()
            )
        descendant_slot_ids: set[UUID] = set()
        if descendant_template_ids:
            descendant_slot_ids = set(
                (
                    await self.db.execute(
                        select(EnclosureTemplatePanelSlot.id).where(
                            EnclosureTemplatePanelSlot.enclosure_template_id.in_(
                                descendant_template_ids
                            )
                        )
                    )
                ).scalars().all()
            )

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

        result: list[tuple[ConnectorInstance, ConnectorTemplate]] = []
        for conn, tmpl in rows:
            if (
                is_inline_connector_template(tmpl)
                and conn.pcb_instance_id is None
                and not conn.is_panel_mount
            ):
                continue
            if conn.is_panel_mount and conn.source_pcb_instance_id is None:
                if (
                    conn.enclosure_panel_slot_id
                    and conn.enclosure_panel_slot_id not in own_template_slot_ids
                ):
                    continue
                if conn.enclosure_panel_slot_id and conn.enclosure_panel_slot_id in descendant_slot_ids:
                    continue
                result.append((conn, tmpl))
            elif conn.source_pcb_instance_id and conn.source_pcb_instance_id in direct_pcb_ids:
                result.append((conn, tmpl))
        return result

    async def _pcb_ids_for_enclosure(self, enclosure_id: UUID) -> list[UUID]:
        result = await self.db.execute(
            select(PcbInstance.id).where(PcbInstance.enclosure_instance_id == enclosure_id)
        )
        return list(result.scalars().all())

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
        by_connector = await self._pins_for_connectors(revision_id, [connector_id])
        return by_connector.get(connector_id, [])

    async def _pins_for_connectors(
        self, revision_id: UUID, connector_ids: list[UUID]
    ) -> dict[UUID, list[Pin]]:
        if not connector_ids:
            return {}
        rows = (
            await self.db.execute(
                select(Pin)
                .where(
                    Pin.revision_id == revision_id,
                    Pin.connector_instance_id.in_(connector_ids),
                )
                .order_by(Pin.connector_instance_id, Pin.pin_number)
            )
        ).scalars().all()
        grouped: dict[UUID, list[Pin]] = {}
        for pin in rows:
            grouped.setdefault(pin.connector_instance_id, []).append(pin)
        return grouped

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

    async def _build_ownership_resolver(self, revision_id: UUID) -> OwnershipResolver:
        """Build the bulk ownership maps for a revision and wrap them in a resolver.

        All maps are populated with set-based queries scoped to the revision so
        that pin/connector ownership resolution requires no per-pin queries.
        """
        # pcb_instance_id -> enclosure_instance_id (None when standalone).
        enclosure_by_pcb: dict[UUID, UUID | None] = {}
        standalone_pcb_ids: set[UUID] = set()
        pcb_rows = (
            await self.db.execute(
                select(PcbInstance.id, PcbInstance.enclosure_instance_id).where(
                    PcbInstance.revision_id == revision_id
                )
            )
        ).all()
        for pcb_id, enclosure_id in pcb_rows:
            enclosure_by_pcb[pcb_id] = enclosure_id
            if enclosure_id is None:
                standalone_pcb_ids.add(pcb_id)

        # enclosure_instance_id -> parent_enclosure_instance_id (None at top level).
        parent_by_enclosure: dict[UUID, UUID | None] = {}
        enclosure_rows = (
            await self.db.execute(
                select(
                    EnclosureInstance.id,
                    EnclosureInstance.parent_enclosure_instance_id,
                ).where(EnclosureInstance.revision_id == revision_id)
            )
        ).all()
        for enclosure_id, parent_id in enclosure_rows:
            parent_by_enclosure[enclosure_id] = parent_id

        # pin_id -> ConnectorInstance (pins joined to their connector instance).
        connector_by_pin: dict[UUID, ConnectorInstance] = {}
        pin_connector_rows = (
            await self.db.execute(
                select(Pin.id, ConnectorInstance)
                .join(ConnectorInstance, Pin.connector_instance_id == ConnectorInstance.id)
                .where(Pin.revision_id == revision_id)
            )
        ).all()
        for pin_id, connector in pin_connector_rows:
            connector_by_pin[pin_id] = connector

        return OwnershipResolver(
            enclosure_by_pcb=enclosure_by_pcb,
            parent_by_enclosure=parent_by_enclosure,
            standalone_pcb_ids=standalone_pcb_ids,
            connector_by_pin=connector_by_pin,
        )

    async def _load_layouts(self, revision_id: UUID, view_key: str) -> dict[str, tuple[float, float]]:
        result = await self.db.execute(
            select(NodeLayout).where(NodeLayout.revision_id == revision_id, NodeLayout.view_key == view_key)
        )
        layouts: dict[str, tuple[float, float]] = {}
        for layout in result.scalars().all():
            key = f"{layout.entity_kind.value}:{layout.entity_id}"
            layouts[key] = (layout.x, layout.y)
        return layouts
