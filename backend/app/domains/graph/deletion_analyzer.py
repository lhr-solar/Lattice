from uuid import UUID

from app.domains.graph.topology_graph import TopologyGraph
from app.infrastructure.db.enums import EntityKind
from app.schemas.graph import ImpactAnalysisResponse, ImpactTarget, SeveredConnection


class DeletionAnalyzer:
    def analyze(
        self,
        graph: TopologyGraph,
        targets: list[ImpactTarget],
        pins_to_remove: set[UUID],
        edges_to_remove: set[UUID],
    ) -> ImpactAnalysisResponse:
        severed: list[SeveredConnection] = []
        for edge_id in edges_to_remove:
            edge = self._find_edge(graph, edge_id)
            if not edge:
                continue
            for pin_id in (edge.pin_a_id, edge.pin_b_id):
                if pin_id not in pins_to_remove:
                    severed.append(
                        SeveredConnection(
                            edge_id=edge_id,
                            remaining_pin_id=pin_id,
                            signal_ids=sorted(graph.pin_signals.get(pin_id, set())),
                        )
                    )

        return ImpactAnalysisResponse(
            entities_removed=[{"kind": t.kind.value, "id": str(t.id)} for t in targets],
            severed_connections=severed,
            affected_signals=[],
            affected_manufacturing=[],
            warnings=[],
        )

    @staticmethod
    def _find_edge(graph: TopologyGraph, edge_id: UUID):
        for edges in graph.adjacency.values():
            for edge in edges:
                if edge.edge_id == edge_id:
                    return edge
        return None
