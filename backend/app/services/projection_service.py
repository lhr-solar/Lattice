from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.db.models.catalog import ConnectorTemplate
from app.infrastructure.db.models.instances import (
    ConnectorInstance,
    EnclosureInstance,
    PcbInstance,
    Pin,
)
from app.infrastructure.db.models.layout import NodeLayout
from app.infrastructure.db.models.templates import EnclosureTemplate, PcbTemplate
from app.infrastructure.db.models.shorts import ConnectorInstancePinShort
from app.infrastructure.db.models.topology import ConnectionEdge, Signal
from app.core.display import resolve_display_name
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
        if level == "connector":
            return await self._connector_projection(revision_id, view_key, layouts, focus_id)
        return await self._pin_projection(revision_id, view_key, layouts, focus_id)

    async def _vehicle_projection(
        self, revision_id: UUID, view_key: str, layouts: dict[str, tuple[float, float]]
    ) -> DesignGraphProjectionDto:
        enc_result = await self.db.execute(
            select(EnclosureInstance, EnclosureTemplate)
            .join(EnclosureTemplate, EnclosureInstance.enclosure_template_id == EnclosureTemplate.id)
            .where(EnclosureInstance.revision_id == revision_id)
        )
        nodes: list[DesignNodeDto] = [
            DesignNodeDto(
                id="vehicle:root",
                kind="vehicleRoot",
                label="Vehicle",
                position={"x": 40, "y": 40},
                data={"container": True},
            )
        ]
        edge_dtos: list[DesignEdgeDto] = []

        # Boundary nodes are grouped by connector so higher-level views remain readable.
        pin_to_boundary_node: dict[UUID, str] = {}
        enclosure_node_ids: dict[UUID, str] = {}

        for i, (enc, tmpl) in enumerate(enc_result.all()):
            enclosure_node_id = f"enclosure:{enc.id}"
            enclosure_node_ids[enc.id] = enclosure_node_id
            pos = layouts.get(enclosure_node_id)
            nodes.append(
                DesignNodeDto(
                    id=enclosure_node_id,
                    kind="enclosureContainer",
                    label=resolve_display_name(
                        template_name=tmpl.name,
                        nickname=enc.nickname,
                        use_template_name=enc.use_template_name,
                    ),
                    parent_id="vehicle:root",
                    position={"x": pos[0], "y": pos[1]} if pos else {"x": 80 + i * 460, "y": 120},
                    data={"enclosureInstanceId": str(enc.id), "container": True},
                )
            )

            connector_rows = await self.db.execute(
                select(ConnectorInstance, ConnectorTemplate).join(
                    ConnectorTemplate, ConnectorInstance.connector_template_id == ConnectorTemplate.id
                ).where(
                    ConnectorInstance.revision_id == revision_id,
                    ConnectorInstance.enclosure_instance_id == enc.id,
                )
            )
            pcb_rows = await self.db.execute(
                select(PcbInstance, PcbTemplate)
                .join(PcbTemplate, PcbInstance.pcb_template_id == PcbTemplate.id)
                .where(PcbInstance.revision_id == revision_id, PcbInstance.enclosure_instance_id == enc.id)
            )

            pcb_node_ids: dict[UUID, str] = {}
            for pcb_idx, (pcb, pcb_tmpl) in enumerate(pcb_rows.all()):
                pcb_node_id = f"pcb:{pcb.id}"
                pcb_node_ids[pcb.id] = pcb_node_id
                nodes.append(
                    DesignNodeDto(
                        id=pcb_node_id,
                        kind="pcbContainer",
                        label=resolve_display_name(
                            template_name=pcb_tmpl.name,
                            nickname=pcb.nickname,
                            use_template_name=pcb.use_template_name,
                        ),
                        parent_id=enclosure_node_id,
                        position={"x": 40, "y": 210 + pcb_idx * 190},
                        data={"pcbInstanceId": str(pcb.id), "container": True},
                    )
                )

            boundary_index = 0
            internal_index_by_pcb: dict[UUID, int] = {}
            for conn, conn_tmpl in connector_rows.all():
                display = resolve_display_name(
                    template_name=conn_tmpl.name,
                    nickname=conn.nickname,
                    use_template_name=conn.use_template_name,
                )
                if self._connector_visible_outside_pcb(conn, conn_tmpl):
                    boundary_node_id = f"boundary-connector:{conn.id}"
                    nodes.append(
                        DesignNodeDto(
                            id=boundary_node_id,
                            kind="boundaryConnector",
                            label=f"{display}",
                            parent_id=enclosure_node_id,
                            position={"x": 28 + (boundary_index % 3) * 140, "y": 62 + (boundary_index // 3) * 56},
                            data={
                                "connectorInstanceId": str(conn.id),
                                "groupedBoundaryPins": True,
                                "isPanelMount": conn.is_panel_mount,
                            },
                        )
                    )
                    boundary_index += 1
                    pins_result = await self.db.execute(
                        select(Pin.id).where(Pin.revision_id == revision_id, Pin.connector_instance_id == conn.id)
                    )
                    for pin_id in pins_result.scalars().all():
                        pin_to_boundary_node[pin_id] = boundary_node_id

                if conn.pcb_instance_id and conn.pcb_instance_id in pcb_node_ids:
                    idx = internal_index_by_pcb.get(conn.pcb_instance_id, 0)
                    internal_index_by_pcb[conn.pcb_instance_id] = idx + 1
                    nodes.append(
                        DesignNodeDto(
                            id=f"connector:{conn.id}",
                            kind="connector",
                            label=display,
                            parent_id=pcb_node_ids[conn.pcb_instance_id],
                            position={"x": 28 + (idx % 3) * 140, "y": 46 + (idx // 3) * 56},
                            data={"connectorInstanceId": str(conn.id), "internalToPcb": True},
                        )
                    )

        edges_result = await self.db.execute(select(ConnectionEdge).where(ConnectionEdge.revision_id == revision_id))
        seen_pairs: set[tuple[str, str]] = set()
        for edge in edges_result.scalars().all():
            src = pin_to_boundary_node.get(edge.pin_a_id)
            tgt = pin_to_boundary_node.get(edge.pin_b_id)
            if not src or not tgt or src == tgt:
                continue
            pair = tuple(sorted((src, tgt)))
            if pair in seen_pairs:
                continue
            seen_pairs.add(pair)
            harness_scope = (
                edge.harness_scope.value
                if edge.harness_scope is not None and hasattr(edge.harness_scope, "value")
                else edge.harness_scope
            )
            edge_dtos.append(
                DesignEdgeDto(
                    id=str(edge.id),
                    source=src,
                    target=tgt,
                    label=edge.wire_color or edge.signal_type,
                    data={"edgeIds": [str(edge.id)], "harnessScope": harness_scope},
                )
            )

        bus_groups = await self._bus_groups(revision_id)
        return DesignGraphProjectionDto(
            revision_id=revision_id,
            level="vehicle",
            view_key=view_key,
            nodes=nodes,
            edges=edge_dtos,
            bus_groups=bus_groups,
            meta={"nodeCount": len(nodes), "edgeCount": len(edge_dtos)},
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

        enclosure = await self.db.get(EnclosureInstance, enclosure_id)
        if not enclosure:
            return DesignGraphProjectionDto(
                revision_id=revision_id, level="enclosure", view_key=view_key, nodes=[], edges=[]
            )
        enc_tmpl = await self.db.get(EnclosureTemplate, enclosure.enclosure_template_id)
        enclosure_node_id = f"enclosure:{enclosure_id}"
        nodes: list[DesignNodeDto] = [
            DesignNodeDto(
                id=enclosure_node_id,
                kind="enclosureContainer",
                label=resolve_display_name(
                    template_name=enc_tmpl.name if enc_tmpl else "Enclosure",
                    nickname=enclosure.nickname,
                    use_template_name=enclosure.use_template_name,
                ),
                position={"x": 80, "y": 60},
                data={"enclosureInstanceId": str(enclosure_id), "container": True},
            )
        ]
        pin_to_node: dict[UUID, str] = {}

        pcb_result = await self.db.execute(
            select(PcbInstance, PcbTemplate)
            .join(PcbTemplate, PcbInstance.pcb_template_id == PcbTemplate.id)
            .where(PcbInstance.revision_id == revision_id, PcbInstance.enclosure_instance_id == enclosure_id)
        )
        pcb_node_ids: dict[UUID, str] = {}
        for i, (pcb, tmpl) in enumerate(pcb_result.all()):
            nid = f"pcb:{pcb.id}"
            pcb_node_ids[pcb.id] = nid
            pos = layouts.get(nid)
            nodes.append(
                DesignNodeDto(
                    id=nid,
                    kind="pcbContainer",
                    label=resolve_display_name(
                        template_name=tmpl.name,
                        nickname=pcb.nickname,
                        use_template_name=pcb.use_template_name,
                    ),
                    parent_id=enclosure_node_id,
                    position={"x": pos[0], "y": pos[1]} if pos else {"x": 36, "y": 220 + i * 200},
                    data={"pcbInstanceId": str(pcb.id), "container": True},
                )
            )

        conn_result = await self.db.execute(
            select(ConnectorInstance, ConnectorTemplate)
            .join(ConnectorTemplate, ConnectorInstance.connector_template_id == ConnectorTemplate.id)
            .where(
                ConnectorInstance.revision_id == revision_id,
                ConnectorInstance.enclosure_instance_id == enclosure_id,
            )
        )
        boundary_index = 0
        connector_index_by_pcb: dict[UUID, int] = {}
        for conn, tmpl in conn_result.all():
            display = resolve_display_name(
                template_name=tmpl.name,
                nickname=conn.nickname,
                use_template_name=conn.use_template_name,
            )
            if self._connector_visible_outside_pcb(conn, tmpl):
                boundary_nid = f"boundary-connector:{conn.id}"
                nodes.append(
                    DesignNodeDto(
                        id=boundary_nid,
                        kind="boundaryConnector",
                        label=display,
                        parent_id=enclosure_node_id,
                        position={"x": 24 + (boundary_index % 4) * 130, "y": 72 + (boundary_index // 4) * 56},
                        data={
                            "connectorInstanceId": str(conn.id),
                            "groupedBoundaryPins": True,
                            "isPanelMount": conn.is_panel_mount,
                        },
                    )
                )
                boundary_index += 1
                pins_result = await self.db.execute(
                    select(Pin.id).where(Pin.revision_id == revision_id, Pin.connector_instance_id == conn.id)
                )
                for pin_id in pins_result.scalars().all():
                    pin_to_node[pin_id] = boundary_nid

            if conn.pcb_instance_id and conn.pcb_instance_id in pcb_node_ids:
                idx = connector_index_by_pcb.get(conn.pcb_instance_id, 0)
                connector_index_by_pcb[conn.pcb_instance_id] = idx + 1
                nid = f"connector:{conn.id}"
                pos = layouts.get(nid)
                nodes.append(
                    DesignNodeDto(
                        id=nid,
                        kind="connector",
                        label=display,
                        parent_id=pcb_node_ids[conn.pcb_instance_id],
                        position={"x": pos[0], "y": pos[1]} if pos else {"x": 24 + (idx % 3) * 130, "y": 54 + (idx // 3) * 60},
                        data={"connectorInstanceId": str(conn.id), "internalToPcb": True},
                    )
                )

        for pin_id, connector_node in (await self._pin_node_map(revision_id, enclosure_id)).items():
            pin_to_node.setdefault(pin_id, connector_node)

        edges_result = await self.db.execute(
            select(ConnectionEdge).where(
                ConnectionEdge.revision_id == revision_id,
                ConnectionEdge.enclosure_a_id == enclosure_id,
                ConnectionEdge.enclosure_b_id == enclosure_id,
            )
        )
        edge_dtos = []
        for edge in edges_result.scalars().all():
            src = pin_to_node.get(edge.pin_a_id)
            tgt = pin_to_node.get(edge.pin_b_id)
            if src and tgt and src != tgt:
                edge_dtos.append(
                    DesignEdgeDto(
                        id=str(edge.id),
                        source=src,
                        target=tgt,
                        label=edge.wire_color,
                        data={"pinA": str(edge.pin_a_id), "pinB": str(edge.pin_b_id)},
                    )
                )

        return DesignGraphProjectionDto(
            revision_id=revision_id,
            level="enclosure",
            view_key=view_key,
            nodes=nodes,
            edges=edge_dtos,
            bus_groups=[],
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

        pins_result = await self.db.execute(
            select(Pin).where(Pin.revision_id == revision_id, Pin.connector_instance_id == connector_id)
        )
        nodes = []
        pin_ids: dict[UUID, str] = {}
        for i, pin in enumerate(pins_result.scalars().all()):
            nid = f"pin:{pin.id}"
            pin_ids[pin.id] = nid
            pos = layouts.get(nid)
            is_default_name = pin.name.strip() == str(pin.pin_number)
            nodes.append(
                DesignNodeDto(
                    id=nid,
                    kind="pin",
                    label=f"{pin.pin_number}: {pin.name}",
                    position={"x": pos[0], "y": pos[1]} if pos else {"x": 120, "y": 60 + i * 50},
                    data={
                        "pinId": str(pin.id),
                        "pinNumber": pin.pin_number,
                        "pinName": pin.name,
                        "isDefaultName": is_default_name,
                    },
                )
            )

        if not pin_ids:
            return DesignGraphProjectionDto(
                revision_id=revision_id, level="connector", view_key=view_key, nodes=[], edges=[]
            )

        pin_id_list = list(pin_ids.keys())
        edges_result = await self.db.execute(
            select(ConnectionEdge).where(
                ConnectionEdge.revision_id == revision_id,
                or_(
                    ConnectionEdge.pin_a_id.in_(pin_id_list),
                    ConnectionEdge.pin_b_id.in_(pin_id_list),
                ),
            )
        )
        edge_dtos = []
        for edge in edges_result.scalars().all():
            src = pin_ids.get(edge.pin_a_id)
            tgt = pin_ids.get(edge.pin_b_id)
            if src and tgt:
                edge_dtos.append(
                    DesignEdgeDto(
                        id=str(edge.id),
                        source=src,
                        target=tgt,
                        label=edge.wire_color,
                        kind="connection",
                    )
                )

        shorts_result = await self.db.execute(
            select(ConnectorInstancePinShort).where(
                ConnectorInstancePinShort.revision_id == revision_id,
                ConnectorInstancePinShort.connector_instance_id == connector_id,
            )
        )
        for short in shorts_result.scalars().all():
            src = pin_ids.get(short.pin_a_id)
            tgt = pin_ids.get(short.pin_b_id)
            if src and tgt:
                edge_dtos.append(
                    DesignEdgeDto(
                        id=f"short:{short.id}",
                        source=src,
                        target=tgt,
                        kind="short",
                        label="short",
                        data={"short": True},
                    )
                )

        return DesignGraphProjectionDto(
            revision_id=revision_id,
            level="connector",
            view_key=view_key,
            nodes=nodes,
            edges=edge_dtos,
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
        edges_result = await self.db.execute(
            select(ConnectionEdge).where(
                ConnectionEdge.revision_id == revision_id,
                (ConnectionEdge.pin_a_id == pin_id) | (ConnectionEdge.pin_b_id == pin_id),
            )
        )
        edge_dtos = []
        for i, edge in enumerate(edges_result.scalars().all()):
            other = edge.pin_b_id if edge.pin_a_id == pin_id else edge.pin_a_id
            other_nid = f"pin:{other}"
            edge_dtos.append(
                DesignEdgeDto(id=str(edge.id), source=nid, target=other_nid, label=edge.wire_color)
            )
            nodes.append(
                DesignNodeDto(
                    id=other_nid,
                    kind="pin",
                    label=f"peer",
                    position={"x": 360, "y": 120 + i * 60},
                    data={"pinId": str(other)},
                )
            )
        return DesignGraphProjectionDto(
            revision_id=revision_id, level="pin", view_key=view_key, nodes=nodes, edges=edge_dtos, meta={}
        )

    async def _pin_node_map(self, revision_id: UUID, enclosure_id: UUID) -> dict[UUID, str]:
        mapping: dict[UUID, str] = {}
        pins = await self.db.execute(
            select(Pin, ConnectorInstance, ConnectorTemplate)
            .join(ConnectorInstance, Pin.connector_instance_id == ConnectorInstance.id)
            .join(ConnectorTemplate, ConnectorInstance.connector_template_id == ConnectorTemplate.id)
            .where(Pin.revision_id == revision_id, ConnectorInstance.enclosure_instance_id == enclosure_id)
        )
        for pin, conn, tmpl in pins.all():
            mapping[pin.id] = f"connector:{conn.id}"
        return mapping

    @staticmethod
    def _connector_visible_outside_pcb(conn: ConnectorInstance, tmpl: ConnectorTemplate) -> bool:
        _ = tmpl
        # Boundary population is driven only by panel-mount connectors.
        return conn.is_panel_mount

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

    async def _load_layouts(self, revision_id: UUID, view_key: str) -> dict[str, tuple[float, float]]:
        result = await self.db.execute(
            select(NodeLayout).where(NodeLayout.revision_id == revision_id, NodeLayout.view_key == view_key)
        )
        layouts: dict[str, tuple[float, float]] = {}
        for layout in result.scalars().all():
            key = f"{layout.entity_kind.value}:{layout.entity_id}"
            layouts[key] = (layout.x, layout.y)
        return layouts
