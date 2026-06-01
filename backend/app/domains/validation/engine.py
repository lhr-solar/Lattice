from uuid import UUID

from app.domains.graph.topology_graph import TopologyGraph
from app.domains.validation.rules import DEFAULT_RULES, ValidationContext
from app.schemas.validation import ValidationRunResponse


class ValidationEngine:
    def __init__(self, rules=None):
        self.rules = rules or DEFAULT_RULES

    def run(self, revision_id: UUID, graph: TopologyGraph, mode: str = "design") -> ValidationRunResponse:
        ctx = ValidationContext(graph=graph, mode=mode)
        findings = []
        for rule in self.rules:
            findings.extend(rule.check(ctx))
        summary = {
            "error_count": sum(1 for f in findings if f.severity == "error"),
            "warning_count": sum(1 for f in findings if f.severity == "warning"),
        }
        return ValidationRunResponse(revision_id=revision_id, findings=findings, summary=summary)
