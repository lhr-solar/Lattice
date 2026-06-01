from dataclasses import dataclass
from typing import Protocol

from app.domains.graph.topology_graph import TopologyGraph
from app.schemas.validation import ValidationFinding


@dataclass
class ValidationContext:
    graph: TopologyGraph
    mode: str = "design"


class Rule(Protocol):
    code: str
    severity: str

    def check(self, ctx: ValidationContext) -> list[ValidationFinding]: ...


class DanglingWireRule:
    code = "DANGLING_WIRE"
    severity = "warning"

    def check(self, ctx: ValidationContext) -> list[ValidationFinding]:
        findings: list[ValidationFinding] = []
        for pin_id, edges in ctx.graph.adjacency.items():
            if not edges and ctx.graph.pin_signals.get(pin_id):
                findings.append(
                    ValidationFinding(
                        code=self.code,
                        severity=self.severity,
                        message=f"Pin {pin_id} has signal assignments but no connections",
                        entity_id=pin_id,
                    )
                )
        return findings


DEFAULT_RULES: list[Rule] = [DanglingWireRule()]
