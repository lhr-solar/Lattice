from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

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
        nodes: list[DesignNodeDto] = []
        enc_ids: dict[UUID, str] = {}
        for i, (enc, tmpl) in enumerate(enc_result.all()):
            node_id = f"enclosure:{enc.id}"
            enc_ids[enc.id] = node_id
            pos = layouts.get(node_id)
            nodes.append(
                DesignNodeDto(
                    id=node_id,
                    kind="enclosure",
                    label=resolve_display_name(
                        template_name=tmpl.name,
                        nickname=enc.nickname,
                        use_template_name=enc.use_template_name,
                    ),
                    position={"x": pos[0], "y": pos[1]} if pos else {"x": 100 + i * 220, "y": 200},
                    data={"enclosureInstanceId": str(enc.id)},
                )
            )

        edges_result = await self.db.execute(
            select(ConnectionEdge).where(
                ConnectionEdge.revision_id == revision_id,
                ConnectionEdge.enclosure_a_id.isnot(None),
                ConnectionEdge.enclosure_b_id.isnot(None),
            )
        )
        edge_dtos: list[DesignEdgeDto] = []
        seen_pairs: set[tuple[str, str]] = set()
        for edge in edges_result.scalars().all():
            if not edge.enclosure_a_id or not edge.enclosure_b_id:
                continue
            src = enc_ids.get(edge.enclosure_a_id)
            tgt = enc_ids.get(edge.enclosure_b_id)
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

        nodes: list[DesignNodeDto] = []
        node_map: dict[UUID, str] = {}

        pcb_result = await self.db.execute(
            select(PcbInstance, PcbTemplate)
            .join(PcbTemplate, PcbInstance.pcb_template_id == PcbTemplate.id)
            .where(PcbInstance.revision_id == revision_id, PcbInstance.enclosure_instance_id == enclosure_id)
        )
        for i, (pcb, tmpl) in enumerate(pcb_result.all()):
            nid = f"pcb:{pcb.id}"
            node_map[pcb.id] = nid
            pos = layouts.get(nid)
            nodes.append(
                DesignNodeDto(
                    id=nid,
                    kind="pcb",
                    label=resolve_display_name(
                        template_name=tmpl.name,
                        nickname=pcb.nickname,
                        use_template_name=pcb.use_template_name,
                    ),
                    position={"x": pos[0], "y": pos[1]} if pos else {"x": 80, "y": 80 + i * 100},
                    data={"pcbInstanceId": str(pcb.id)},
                )
            )

        conn_result = await self.db.execute(
            select(ConnectorInstance)
            .where(
                ConnectorInstance.revision_id == revision_id,
                ConnectorInstance.enclosure_instance_id == enclosure_id,
            )
        )
        from app.infrastructure.db.models.catalog import ConnectorTemplate

        for i, conn in enumerate(conn_result.scalars().all()):
            tmpl = await self.db.get(ConnectorTemplate, conn.connector_template_id)
            nid = f"connector:{conn.id}"
            node_map[conn.id] = nid
            pos = layouts.get(nid)
            nodes.append(
                DesignNodeDto(
                    id=nid,
                    kind="panelMount" if conn.is_panel_mount else "connector",
                    label=resolve_display_name(
                        template_name=tmpl.name if tmpl else "?",
                        nickname=conn.nickname,
                        use_template_name=conn.use_template_name,
                    ),
                    position={"x": pos[0], "y": pos[1]} if pos else {"x": 280, "y": 80 + i * 80},
                    data={"connectorInstanceId": str(conn.id), "isPanelMount": conn.is_panel_mount},
                )
            )

        edges_result = await self.db.execute(
            select(ConnectionEdge).where(
                ConnectionEdge.revision_id == revision_id,
                ConnectionEdge.enclosure_a_id == enclosure_id,
                ConnectionEdge.enclosure_b_id == enclosure_id,
            )
        )
        pin_to_node = await self._pin_node_map(revision_id, enclosure_id)
        edge_dtos = []
        for edge in edges_result.scalars().all():
            src = pin_to_node.get(edge.pin_a_id)
            tgt = pin_to_node.get(edge.pin_b_id)
            if src and tgt:
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
            nodes.append(
                DesignNodeDto(
                    id=nid,
                    kind="pin",
                    label=f"{pin.pin_number}: {pin.name}",
                    position={"x": pos[0], "y": pos[1]} if pos else {"x": 120, "y": 60 + i * 50},
                    data={"pinId": str(pin.id), "pinNumber": pin.pin_number},
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
            select(Pin, ConnectorInstance)
            .join(ConnectorInstance, Pin.connector_instance_id == ConnectorInstance.id)
            .where(Pin.revision_id == revision_id, ConnectorInstance.enclosure_instance_id == enclosure_id)
        )
        for pin, conn in pins.all():
            mapping[pin.id] = f"connector:{conn.id}"
        pcb_pins = await self.db.execute(
            select(Pin, ConnectorInstance, PcbInstance)
            .join(ConnectorInstance, Pin.connector_instance_id == ConnectorInstance.id)
            .join(PcbInstance, ConnectorInstance.pcb_instance_id == PcbInstance.id)
            .where(Pin.revision_id == revision_id, PcbInstance.enclosure_instance_id == enclosure_id)
        )
        for pin, conn, _pcb in pcb_pins.all():
            mapping[pin.id] = f"connector:{conn.id}"
        return mapping

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
