from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.graph.deletion_analyzer import DeletionAnalyzer
from app.domains.graph.topology_graph import EdgeRef, TopologyGraph
from app.infrastructure.db.models.topology import ConnectionEdge, PinSignalAssignment
from app.schemas.graph import ImpactAnalysisRequest, ImpactAnalysisResponse, TraceResponse


class GraphService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.deletion_analyzer = DeletionAnalyzer()

    async def load_graph(self, revision_id: UUID) -> TopologyGraph:
        edges_result = await self.db.execute(
            select(ConnectionEdge).where(ConnectionEdge.revision_id == revision_id)
        )
        edges = edges_result.scalars().all()

        assignments_result = await self.db.execute(
            select(PinSignalAssignment).where(PinSignalAssignment.revision_id == revision_id)
        )
        assignments = assignments_result.scalars().all()

        graph = TopologyGraph(revision_id=revision_id)
        for edge in edges:
            ref = EdgeRef(
                edge_id=edge.id,
                pin_a_id=edge.pin_a_id,
                pin_b_id=edge.pin_b_id,
                signal_id=edge.signal_id,
            )
            graph.adjacency.setdefault(edge.pin_a_id, []).append(ref)
            graph.adjacency.setdefault(edge.pin_b_id, []).append(ref)

        for assignment in assignments:
            graph.pin_signals.setdefault(assignment.pin_id, set()).add(assignment.signal_id)

        return graph

    async def trace_pin(
        self, revision_id: UUID, pin_id: UUID, signal_id: UUID | None = None
    ) -> TraceResponse:
        graph = await self.load_graph(revision_id)
        pin_ids, edge_ids = graph.trace_pins(pin_id)
        signal_ids: set[UUID] = set()
        for pid in pin_ids:
            signal_ids |= graph.pin_signals.get(pid, set())
        if signal_id:
            signal_ids &= {signal_id}
        return TraceResponse(
            pin_ids=sorted(pin_ids),
            edge_ids=sorted(edge_ids),
            signal_ids=sorted(signal_ids),
        )

    async def impact_analysis(
        self, revision_id: UUID, request: ImpactAnalysisRequest
    ) -> ImpactAnalysisResponse:
        graph = await self.load_graph(revision_id)
        pins_to_remove: set[UUID] = set()
        edges_to_remove: set[UUID] = set()
        for target in request.targets:
            if target.kind.value == "pin":
                pins_to_remove.add(target.id)
        for pin_id in pins_to_remove:
            for edge in graph.incident_edges(pin_id):
                edges_to_remove.add(edge.edge_id)

        return self.deletion_analyzer.analyze(
            graph=graph,
            targets=request.targets,
            pins_to_remove=pins_to_remove,
            edges_to_remove=edges_to_remove,
        )
