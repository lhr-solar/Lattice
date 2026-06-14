"""Property-based tests for the topology-graph projection.

Feature: topology-graph-view

These tests exercise ``ProjectionService.build_topology_graph_projection`` (and,
transitively, the ``OwnershipResolver``) against a real Postgres test database.
A single Hypothesis hierarchy generator produces random sets of enclosures (with
optional parents / sub-enclosures), PCBs (enclosed or standalone), connectors
(board / board-source / panel / inline) seated via the real ownership columns,
pins, and ``ConnectionEdge`` rows -- including the empty revision (n=0) and
intra-node wires (for the no-self-loop property). Each generated example is
materialized inside a transaction that is rolled back for isolation, so 100+
iterations stay cheap.

Properties implemented (one test each):
  * Property 1 (task 2.3) -- node set is exactly top-level enclosures + standalone PCBs
  * Property 2 (task 2.4) -- one edge per connected node pair (endpoints, id, wire_count)
  * Property 3 (task 2.5) -- no self-loops
  * Property 4 (task 2.6) -- node fields and position reflect source data + saved positions
"""

from __future__ import annotations

import uuid
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timezone

from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.core.display import resolve_connector_labels
from app.infra.db.enums import ConnectorCategory
from app.infra.db.models.catalog import ConnectorTemplate
from app.infra.db.models.instances import (
    ConnectorInstance,
    EnclosureInstance,
    PcbInstance,
    Pin,
)
from app.infra.db.models.templates import EnclosureTemplate, PcbTemplate
from app.infra.db.models.topology import ConnectionEdge
from app.infra.db.models.vehicle import Revision, Vehicle
from app.services.projection_service import ProjectionService

VIEW_KEY = "topology-graph:vehicle"

HYPOTHESIS_SETTINGS = settings(
    max_examples=100,
    deadline=None,
    suppress_health_check=[
        HealthCheck.function_scoped_fixture,
        HealthCheck.too_slow,
    ],
)


# ---------------------------------------------------------------------------
# Plan model: a pure, hashable description of a random vehicle hierarchy.
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class EnclosureSpec:
    idx: int
    parent_idx: int | None
    nickname: str | None
    use_template_name: bool


@dataclass(frozen=True)
class PcbSpec:
    idx: int
    enclosure_idx: int | None  # None => standalone (top-level) PCB
    nickname: str | None
    use_template_name: bool


@dataclass(frozen=True)
class ConnectorSpec:
    idx: int
    kind: str  # "board" | "board_source" | "panel" | "inline"
    target_idx: int | None  # pcb idx for board*, enclosure idx for panel, None for inline
    n_pins: int


@dataclass(frozen=True)
class HierarchyPlan:
    enclosures: tuple[EnclosureSpec, ...]
    pcbs: tuple[PcbSpec, ...]
    connectors: tuple[ConnectorSpec, ...]
    pins: tuple[int, ...]  # global pin list: each entry is the owning connector idx
    edges: tuple[tuple[int, int], ...]  # pairs of global pin indices (distinct)
    enc_positions: tuple[tuple[float, float] | None, ...]  # by enclosure idx
    pcb_positions: tuple[tuple[float, float] | None, ...]  # by pcb idx


# Exclude NUL (\x00) and other C0 control characters: Postgres text columns
# reject NUL bytes ("invalid byte sequence for encoding UTF8: 0x00"), which is
# unrelated to what these properties exercise.
_nickname = st.one_of(
    st.none(),
    st.text(
        alphabet=st.characters(min_codepoint=0x20, max_codepoint=0x7E),
        min_size=0,
        max_size=8,
    ),
)
_coord = st.floats(min_value=-1.0e6, max_value=1.0e6, allow_nan=False, allow_infinity=False)
_opt_pos = st.one_of(st.none(), st.tuples(_coord, _coord))


@st.composite
def hierarchy_plan(draw: st.DrawFn) -> HierarchyPlan:
    # Top-level enclosures (parent None), then sub-enclosures nested under any
    # already-created enclosure (guarantees an acyclic parent chain).
    n_top = draw(st.integers(min_value=0, max_value=4))
    enclosures: list[EnclosureSpec] = [
        EnclosureSpec(i, None, draw(_nickname), draw(st.booleans())) for i in range(n_top)
    ]
    n_sub = draw(st.integers(min_value=0, max_value=3))
    for _ in range(n_sub):
        if not enclosures:
            break
        parent = draw(st.integers(min_value=0, max_value=len(enclosures) - 1))
        enclosures.append(
            EnclosureSpec(len(enclosures), parent, draw(_nickname), draw(st.booleans()))
        )

    # PCBs: each either enclosed in an existing enclosure or standalone.
    n_pcb = draw(st.integers(min_value=0, max_value=4))
    pcbs: list[PcbSpec] = []
    for i in range(n_pcb):
        if enclosures and draw(st.booleans()):
            enc_idx: int | None = draw(st.integers(min_value=0, max_value=len(enclosures) - 1))
        else:
            enc_idx = None
        pcbs.append(PcbSpec(i, enc_idx, draw(_nickname), draw(st.booleans())))

    # Connectors seated via real ownership columns.
    n_conn = draw(st.integers(min_value=0, max_value=6))
    connectors: list[ConnectorSpec] = []
    for i in range(n_conn):
        kinds = ["inline"]
        if pcbs:
            kinds += ["board", "board_source"]
        if enclosures:
            kinds += ["panel"]
        kind = draw(st.sampled_from(kinds))
        if kind in ("board", "board_source"):
            target: int | None = draw(st.integers(min_value=0, max_value=len(pcbs) - 1))
        elif kind == "panel":
            target = draw(st.integers(min_value=0, max_value=len(enclosures) - 1))
        else:
            target = None
        n_pins = draw(st.integers(min_value=1, max_value=3))
        connectors.append(ConnectorSpec(i, kind, target, n_pins))

    # Global pin list: each pin is owned by its connector idx.
    pins: list[int] = []
    for c in connectors:
        pins.extend([c.idx] * c.n_pins)

    # Connection edges: random distinct pin pairs (includes intra-node wires).
    edges: list[tuple[int, int]] = []
    n_edge = draw(st.integers(min_value=0, max_value=8))
    if len(pins) >= 2:
        for _ in range(n_edge):
            a = draw(st.integers(min_value=0, max_value=len(pins) - 1))
            b = draw(st.integers(min_value=0, max_value=len(pins) - 1))
            if a == b:
                continue
            edges.append((a, b))

    enc_positions = tuple(draw(_opt_pos) for _ in enclosures)
    pcb_positions = tuple(draw(_opt_pos) for _ in pcbs)

    return HierarchyPlan(
        enclosures=tuple(enclosures),
        pcbs=tuple(pcbs),
        connectors=tuple(connectors),
        pins=tuple(pins),
        edges=tuple(edges),
        enc_positions=enc_positions,
        pcb_positions=pcb_positions,
    )


# ---------------------------------------------------------------------------
# Materialization: turn a plan into real DB rows in a single flushed transaction.
# ---------------------------------------------------------------------------


@dataclass
class Materialized:
    revision_id: uuid.UUID
    vehicle_id: uuid.UUID
    enclosure_ids: list[uuid.UUID]
    pcb_ids: list[uuid.UUID]
    enclosure_template_names: list[str]
    pcb_template_names: list[str]
    connector_owner_node_id: list[str | None] = field(default_factory=list)


def _category_for_kind(kind: str) -> tuple[ConnectorCategory, bool, bool]:
    """Return (category, is_inline_template, default_is_panel_mount) for a kind."""
    if kind in ("board", "board_source"):
        return ConnectorCategory.WIRE_TO_BOARD, False, False
    if kind == "panel":
        return ConnectorCategory.WIRE_TO_WIRE, False, True
    return ConnectorCategory.WIRE_TO_WIRE, True, False  # inline


def _top_level_ancestor_idx(plan: HierarchyPlan, enc_idx: int) -> int:
    root = enc_idx
    seen: set[int] = set()
    while root not in seen:
        seen.add(root)
        parent = plan.enclosures[root].parent_idx
        if parent is None:
            break
        root = parent
    return root


async def materialize(session, plan: HierarchyPlan) -> Materialized:
    now = datetime.now(timezone.utc)
    vehicle_id = uuid.uuid4()
    revision_id = uuid.uuid4()

    session.add(Vehicle(id=vehicle_id, name=f"veh-{vehicle_id}"))
    session.add(
        Revision(id=revision_id, vehicle_id=vehicle_id, revision_number=1, created_at=now)
    )
    # Flush parents first so every FK target (vehicle/revision) exists before
    # dependent rows are inserted (avoids cross-table insert-ordering issues).
    await session.flush()

    # Enclosures (+ their templates).
    enclosure_ids: list[uuid.UUID] = []
    enclosure_template_names: list[str] = []
    for spec in plan.enclosures:
        tmpl_id = uuid.uuid4()
        tmpl_name = f"enc-tmpl-{spec.idx}"
        session.add(EnclosureTemplate(id=tmpl_id, vehicle_id=vehicle_id, name=tmpl_name))
        await session.flush()
        enc_id = uuid.uuid4()
        enclosure_ids.append(enc_id)
        enclosure_template_names.append(tmpl_name)
        parent_id = (
            enclosure_ids[spec.parent_idx] if spec.parent_idx is not None else None
        )
        session.add(
            EnclosureInstance(
                id=enc_id,
                revision_id=revision_id,
                vehicle_id=vehicle_id,
                enclosure_template_id=tmpl_id,
                parent_enclosure_instance_id=parent_id,
                nickname=spec.nickname,
                use_template_name=spec.use_template_name,
                created_at=now,
            )
        )
        await session.flush()

    # PCBs (+ their templates).
    pcb_ids: list[uuid.UUID] = []
    pcb_template_names: list[str] = []
    for spec in plan.pcbs:
        tmpl_id = uuid.uuid4()
        tmpl_name = f"pcb-tmpl-{spec.idx}"
        session.add(PcbTemplate(id=tmpl_id, vehicle_id=vehicle_id, name=tmpl_name))
        await session.flush()
        pcb_id = uuid.uuid4()
        pcb_ids.append(pcb_id)
        pcb_template_names.append(tmpl_name)
        enc_instance_id = (
            enclosure_ids[spec.enclosure_idx] if spec.enclosure_idx is not None else None
        )
        session.add(
            PcbInstance(
                id=pcb_id,
                revision_id=revision_id,
                vehicle_id=vehicle_id,
                pcb_template_id=tmpl_id,
                enclosure_instance_id=enc_instance_id,
                nickname=spec.nickname,
                use_template_name=spec.use_template_name,
                created_at=now,
            )
        )
        await session.flush()

    # Connectors + pins. Track each connector's expected owning graph node id.
    connector_owner: list[str | None] = []
    pin_ids_by_connector: list[list[uuid.UUID]] = []
    for spec in plan.connectors:
        category, is_inline, panel_mount = _category_for_kind(spec.kind)
        ct_id = uuid.uuid4()
        session.add(
            ConnectorTemplate(
                id=ct_id,
                name=f"conn-tmpl-{spec.idx}",
                pin_count=max(1, spec.n_pins),
                connector_category=category,
                is_inline_template=is_inline,
                default_is_panel_mount=panel_mount,
            )
        )
        await session.flush()
        ci_id = uuid.uuid4()
        pcb_instance_id = None
        source_pcb_instance_id = None
        enclosure_instance_id = None
        owner: str | None
        if spec.kind == "board":
            pcb_instance_id = pcb_ids[spec.target_idx]
            owner = _owner_for_pcb(plan, enclosure_ids, pcb_ids, spec.target_idx)
        elif spec.kind == "board_source":
            source_pcb_instance_id = pcb_ids[spec.target_idx]
            owner = _owner_for_pcb(plan, enclosure_ids, pcb_ids, spec.target_idx)
        elif spec.kind == "panel":
            enclosure_instance_id = enclosure_ids[spec.target_idx]
            root = _top_level_ancestor_idx(plan, spec.target_idx)
            owner = f"tg-node:{enclosure_ids[root]}"
        else:  # inline
            owner = None
        connector_owner.append(owner)
        session.add(
            ConnectorInstance(
                id=ci_id,
                revision_id=revision_id,
                vehicle_id=vehicle_id,
                connector_template_id=ct_id,
                pcb_instance_id=pcb_instance_id,
                source_pcb_instance_id=source_pcb_instance_id,
                enclosure_instance_id=enclosure_instance_id,
                is_panel_mount=panel_mount,
                use_template_name=True,
                created_at=now,
            )
        )
        await session.flush()
        conn_pin_ids: list[uuid.UUID] = []
        for pin_number in range(1, spec.n_pins + 1):
            pin_id = uuid.uuid4()
            conn_pin_ids.append(pin_id)
            session.add(
                Pin(
                    id=pin_id,
                    revision_id=revision_id,
                    connector_instance_id=ci_id,
                    pin_number=pin_number,
                    name=f"p{pin_number}",
                )
            )
        pin_ids_by_connector.append(conn_pin_ids)

    # Flatten the global pin id list in the same order the plan built plan.pins.
    global_pin_ids: list[uuid.UUID] = []
    for conn_pins in pin_ids_by_connector:
        global_pin_ids.extend(conn_pins)

    # Connection edges between global pins.
    await session.flush()  # connectors + pins exist before edges reference pins
    for a, b in plan.edges:
        session.add(
            ConnectionEdge(
                id=uuid.uuid4(),
                revision_id=revision_id,
                vehicle_id=vehicle_id,
                pin_a_id=global_pin_ids[a],
                pin_b_id=global_pin_ids[b],
                created_at=now,
            )
        )

    await session.flush()

    return Materialized(
        revision_id=revision_id,
        vehicle_id=vehicle_id,
        enclosure_ids=enclosure_ids,
        pcb_ids=pcb_ids,
        enclosure_template_names=enclosure_template_names,
        pcb_template_names=pcb_template_names,
        connector_owner_node_id=connector_owner,
    )


def _owner_for_pcb(
    plan: HierarchyPlan,
    enclosure_ids: list[uuid.UUID],
    pcb_ids: list[uuid.UUID],
    pcb_idx: int,
) -> str:
    """Graph-node owner of a connector seated on PCB ``pcb_idx``."""
    enc_idx = plan.pcbs[pcb_idx].enclosure_idx
    if enc_idx is not None:
        root = _top_level_ancestor_idx(plan, enc_idx)
        return f"tg-node:{enclosure_ids[root]}"
    return f"tg-node:{pcb_ids[pcb_idx]}"


# ---------------------------------------------------------------------------
# Expected-value helpers computed independently from the plan + materialized ids.
# ---------------------------------------------------------------------------


def expected_node_ids(plan: HierarchyPlan, mat: Materialized) -> set[str]:
    ids: set[str] = set()
    for spec in plan.enclosures:
        if spec.parent_idx is None:
            ids.add(f"tg-node:{mat.enclosure_ids[spec.idx]}")
    for spec in plan.pcbs:
        if spec.enclosure_idx is None:
            ids.add(f"tg-node:{mat.pcb_ids[spec.idx]}")
    return ids


def pin_owner_node_ids(plan: HierarchyPlan, mat: Materialized) -> list[str | None]:
    """Owner graph-node id for each global pin (parallel to plan.pins)."""
    return [mat.connector_owner_node_id[connector_idx] for connector_idx in plan.pins]


def expected_edges(plan: HierarchyPlan, mat: Materialized) -> dict[str, tuple[str, str, int]]:
    pin_owner = pin_owner_node_ids(plan, mat)
    counts: Counter[tuple[str, str]] = Counter()
    for a, b in plan.edges:
        oa, ob = pin_owner[a], pin_owner[b]
        if oa is None or ob is None:
            continue
        if oa == ob:
            continue
        pair = (oa, ob) if oa < ob else (ob, oa)
        counts[pair] += 1
    return {
        f"tg-edge:{lo}:{hi}": (lo, hi, count) for (lo, hi), count in counts.items()
    }


async def _run_projection(session_factory, plan, saved_positions):
    """Materialize the plan, run the projection, then roll back for isolation."""
    async with session_factory() as session:
        try:
            mat = await materialize(session, plan)
            service = ProjectionService(session)
            result = await service.build_topology_graph_projection(
                mat.revision_id, VIEW_KEY, saved_positions(mat)
            )
            return result, mat
        finally:
            await session.rollback()


# ---------------------------------------------------------------------------
# Property 1 (task 2.3)
# ---------------------------------------------------------------------------


@given(plan=hierarchy_plan())
@HYPOTHESIS_SETTINGS
def test_property_1_node_set_is_top_level_enclosures_plus_standalone_pcbs(
    session_factory, db_loop, plan
):
    # Feature: topology-graph-view, Property 1: Node set is exactly top-level
    # enclosures plus standalone PCBs.
    # Validates: Requirements 2.2, 2.3, 2.4
    result, mat = db_loop.run_until_complete(
        _run_projection(session_factory, plan, lambda _m: {})
    )

    actual_ids = {node.id for node in result.nodes}
    assert actual_ids == expected_node_ids(plan, mat)
    # No duplicate node ids.
    assert len(result.nodes) == len(actual_ids)

    # No node for any sub-enclosure or enclosed PCB.
    for spec in plan.enclosures:
        if spec.parent_idx is not None:
            assert f"tg-node:{mat.enclosure_ids[spec.idx]}" not in actual_ids
    for spec in plan.pcbs:
        if spec.enclosure_idx is not None:
            assert f"tg-node:{mat.pcb_ids[spec.idx]}" not in actual_ids

    # Every node's kind is consistent with the entity it came from.
    enclosure_node_ids = {f"tg-node:{e}" for e in mat.enclosure_ids}
    pcb_node_ids = {f"tg-node:{p}" for p in mat.pcb_ids}
    for node in result.nodes:
        if node.entity_kind == "enclosure_instance":
            assert node.id in enclosure_node_ids
        else:
            assert node.entity_kind == "pcb_instance"
            assert node.id in pcb_node_ids


# ---------------------------------------------------------------------------
# Property 2 (task 2.4)
# ---------------------------------------------------------------------------


@given(plan=hierarchy_plan())
@HYPOTHESIS_SETTINGS
def test_property_2_one_edge_per_connected_pair_with_correct_fields(
    session_factory, db_loop, plan
):
    # Feature: topology-graph-view, Property 2: One edge per connected node pair,
    # with correct endpoints, id, and wire_count.
    # Validates: Requirements 2.5, 2.6, 2.9
    result, mat = db_loop.run_until_complete(
        _run_projection(session_factory, plan, lambda _m: {})
    )

    expected = expected_edges(plan, mat)

    # Exactly one edge per connected pair (no duplicate pair keys).
    edge_ids = [edge.id for edge in result.edges]
    assert len(edge_ids) == len(set(edge_ids))
    assert set(edge_ids) == set(expected.keys())

    for edge in result.edges:
        exp_source, exp_target, exp_count = expected[edge.id]
        # source/target are the two node ids sorted lexicographically.
        assert edge.source == exp_source
        assert edge.target == exp_target
        assert edge.source < edge.target
        assert edge.id == f"tg-edge:{edge.source}:{edge.target}"
        assert edge.wire_count == exp_count
        assert edge.wire_count >= 1


# ---------------------------------------------------------------------------
# Property 3 (task 2.5)
# ---------------------------------------------------------------------------


@given(plan=hierarchy_plan())
@HYPOTHESIS_SETTINGS
def test_property_3_no_self_loops(session_factory, db_loop, plan):
    # Feature: topology-graph-view, Property 3: No self-loops.
    # Validates: Requirements 2.7
    result, _mat = db_loop.run_until_complete(
        _run_projection(session_factory, plan, lambda _m: {})
    )

    for edge in result.edges:
        assert edge.source != edge.target


# ---------------------------------------------------------------------------
# Property 4 (task 2.6)
# ---------------------------------------------------------------------------


def _saved_positions_for(plan: HierarchyPlan):
    """Build a saved_positions map keyed by node id from the plan's position draws."""

    def builder(mat: Materialized) -> dict[str, tuple[float, float]]:
        saved: dict[str, tuple[float, float]] = {}
        for spec in plan.enclosures:
            pos = plan.enc_positions[spec.idx]
            if spec.parent_idx is None and pos is not None:
                saved[f"tg-node:{mat.enclosure_ids[spec.idx]}"] = pos
        for spec in plan.pcbs:
            pos = plan.pcb_positions[spec.idx]
            if spec.enclosure_idx is None and pos is not None:
                saved[f"tg-node:{mat.pcb_ids[spec.idx]}"] = pos
        return saved

    return builder


@given(plan=hierarchy_plan())
@HYPOTHESIS_SETTINGS
def test_property_4_node_fields_and_position(session_factory, db_loop, plan):
    # Feature: topology-graph-view, Property 4: Node fields and position reflect
    # source data and saved positions.
    # Validates: Requirements 2.8, 3.3, 3.4
    builder = _saved_positions_for(plan)
    result, mat = db_loop.run_until_complete(
        _run_projection(session_factory, plan, builder)
    )
    saved = builder(mat)

    # Build expected per-node field values keyed by node id.
    expected: dict[str, tuple[str, str, str | None]] = {}
    for spec in plan.enclosures:
        if spec.parent_idx is None:
            node_id = f"tg-node:{mat.enclosure_ids[spec.idx]}"
            label, template_label = resolve_connector_labels(
                template_name=mat.enclosure_template_names[spec.idx],
                nickname=spec.nickname,
                use_template_name=spec.use_template_name,
            )
            expected[node_id] = ("enclosure_instance", label, template_label)
    for spec in plan.pcbs:
        if spec.enclosure_idx is None:
            node_id = f"tg-node:{mat.pcb_ids[spec.idx]}"
            label, template_label = resolve_connector_labels(
                template_name=mat.pcb_template_names[spec.idx],
                nickname=spec.nickname,
                use_template_name=spec.use_template_name,
            )
            expected[node_id] = ("pcb_instance", label, template_label)

    for node in result.nodes:
        assert node.id.startswith("tg-node:")
        exp_kind, exp_label, exp_template_label = expected[node.id]
        assert node.entity_kind == exp_kind
        assert node.label == exp_label
        assert node.template_label == exp_template_label

        if node.id in saved:
            x, y = saved[node.id]
            assert node.position == {"x": x, "y": y}
        else:
            assert node.position is None
