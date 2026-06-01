from dataclasses import dataclass, field
from uuid import UUID


@dataclass
class EdgeRef:
    edge_id: UUID
    pin_a_id: UUID
    pin_b_id: UUID
    signal_id: UUID | None = None


@dataclass
class TopologyGraph:
    """In-memory adjacency index for a single revision."""

    revision_id: UUID
    adjacency: dict[UUID, list[EdgeRef]] = field(default_factory=dict)
    pin_signals: dict[UUID, set[UUID]] = field(default_factory=dict)

    def incident_edges(self, pin_id: UUID) -> list[EdgeRef]:
        return list(self.adjacency.get(pin_id, []))

    def neighbor_pin(self, edge: EdgeRef, pin_id: UUID) -> UUID:
        return edge.pin_b_id if edge.pin_a_id == pin_id else edge.pin_a_id

    def trace_pins(self, start_pin_id: UUID, max_depth: int = 10_000) -> tuple[set[UUID], set[UUID]]:
        visited: set[UUID] = set()
        edge_ids: set[UUID] = set()
        queue: list[tuple[UUID, int]] = [(start_pin_id, 0)]

        while queue:
            pin_id, depth = queue.pop(0)
            if pin_id in visited or depth > max_depth:
                continue
            visited.add(pin_id)
            for edge in self.incident_edges(pin_id):
                edge_ids.add(edge.edge_id)
                neighbor = self.neighbor_pin(edge, pin_id)
                if neighbor not in visited:
                    queue.append((neighbor, depth + 1))

        return visited, edge_ids

    def connected_components(self) -> list[set[UUID]]:
        seen: set[UUID] = set()
        components: list[set[UUID]] = []
        all_pins = set(self.adjacency.keys())
        for pin_id in all_pins:
            if pin_id in seen:
                continue
            component, _ = self.trace_pins(pin_id)
            components.append(component)
            seen |= component
        return components
