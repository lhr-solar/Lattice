"""Integration tests for the topology-graph HTTP endpoints.

Feature: topology-graph-view (tasks 3.2 and 3.3)

These tests drive the real FastAPI app through an in-process ASGI client
(httpx ``ASGITransport``) with two dependency overrides:

  * ``get_db`` yields the per-test session so seeded-but-uncommitted rows are
    visible across requests, and the whole transaction is rolled back at the
    end of each test for isolation (mirroring the property-test harness).
  * ``get_current_user`` returns a fixed in-memory user so the protected
    routes are reachable without a real session cookie.

Covered behavior:
  * GET seeded revision -> 200 + a valid ``TopologyGraphProjectionDto`` (Req 2.10)
  * GET empty revision -> empty ``nodes``/``edges`` (Req 2.11)
  * GET unknown / wrong-vehicle revision -> 404 with a descriptive message (Req 2.12)
  * PATCH layout then GET reflects positions; repeat PATCH updates in place with
    no duplicate ``node_layouts`` rows (Req 3.2, 3.3)
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select

from app.api.deps import get_db
from app.core.auth_context import UserContext, get_current_user
from app.infra.db.enums import ConnectorCategory, EntityKind
from app.infra.db.models.catalog import ConnectorTemplate
from app.infra.db.models.instances import (
    ConnectorInstance,
    EnclosureInstance,
    PcbInstance,
    Pin,
)
from app.infra.db.models.layout import NodeLayout
from app.infra.db.models.templates import EnclosureTemplate, PcbTemplate
from app.infra.db.models.topology import ConnectionEdge
from app.infra.db.models.vehicle import Revision, Vehicle
from app.main import app

VIEW_KEY = "topology-graph:vehicle"


# ---------------------------------------------------------------------------
# Seeding helpers
# ---------------------------------------------------------------------------


class Seeded:
    """Ids produced by :func:`seed_basic` for assertions in the tests."""

    def __init__(self) -> None:
        self.vehicle_id: uuid.UUID
        self.revision_id: uuid.UUID
        self.enclosure_a_id: uuid.UUID
        self.enclosure_b_id: uuid.UUID
        self.pcb_id: uuid.UUID


async def _new_revision(session, *, immutable: bool = False) -> tuple[uuid.UUID, uuid.UUID]:
    """Insert a fresh vehicle + revision and return ``(vehicle_id, revision_id)``."""
    now = datetime.now(timezone.utc)
    vehicle_id = uuid.uuid4()
    revision_id = uuid.uuid4()
    session.add(Vehicle(id=vehicle_id, name=f"veh-{vehicle_id}"))
    session.add(
        Revision(
            id=revision_id,
            vehicle_id=vehicle_id,
            revision_number=1,
            created_at=now,
            is_immutable=immutable,
        )
    )
    await session.flush()
    return vehicle_id, revision_id


async def seed_basic(session) -> Seeded:
    """Seed two top-level enclosures + one standalone PCB, with one wire A<->B.

    Produces exactly three graph nodes (enclosure A, enclosure B, standalone
    PCB) and exactly one graph edge between the two enclosures.
    """
    now = datetime.now(timezone.utc)
    vehicle_id, revision_id = await _new_revision(session)

    s = Seeded()
    s.vehicle_id = vehicle_id
    s.revision_id = revision_id

    # Two top-level enclosures, each with a template.
    enc_ids: list[uuid.UUID] = []
    for label in ("a", "b"):
        tmpl_id = uuid.uuid4()
        session.add(
            EnclosureTemplate(id=tmpl_id, vehicle_id=vehicle_id, name=f"enc-tmpl-{label}")
        )
        await session.flush()
        enc_id = uuid.uuid4()
        enc_ids.append(enc_id)
        session.add(
            EnclosureInstance(
                id=enc_id,
                revision_id=revision_id,
                vehicle_id=vehicle_id,
                enclosure_template_id=tmpl_id,
                parent_enclosure_instance_id=None,
                nickname=None,
                use_template_name=True,
                created_at=now,
            )
        )
        await session.flush()
    s.enclosure_a_id, s.enclosure_b_id = enc_ids

    # One standalone PCB (no enclosure parent) => its own top-level node.
    pcb_tmpl_id = uuid.uuid4()
    session.add(PcbTemplate(id=pcb_tmpl_id, vehicle_id=vehicle_id, name="pcb-tmpl"))
    await session.flush()
    pcb_id = uuid.uuid4()
    s.pcb_id = pcb_id
    session.add(
        PcbInstance(
            id=pcb_id,
            revision_id=revision_id,
            vehicle_id=vehicle_id,
            pcb_template_id=pcb_tmpl_id,
            enclosure_instance_id=None,
            nickname=None,
            use_template_name=True,
            created_at=now,
        )
    )
    await session.flush()

    # A panel-mount connector + pin on each enclosure, then a wire between them.
    pin_ids: list[uuid.UUID] = []
    for enc_id in enc_ids:
        ct_id = uuid.uuid4()
        session.add(
            ConnectorTemplate(
                id=ct_id,
                name=f"conn-tmpl-{enc_id}",
                pin_count=1,
                connector_category=ConnectorCategory.WIRE_TO_WIRE,
                is_inline_template=False,
                default_is_panel_mount=True,
            )
        )
        await session.flush()
        ci_id = uuid.uuid4()
        session.add(
            ConnectorInstance(
                id=ci_id,
                revision_id=revision_id,
                vehicle_id=vehicle_id,
                connector_template_id=ct_id,
                enclosure_instance_id=enc_id,
                is_panel_mount=True,
                use_template_name=True,
                created_at=now,
            )
        )
        await session.flush()
        pin_id = uuid.uuid4()
        pin_ids.append(pin_id)
        session.add(
            Pin(
                id=pin_id,
                revision_id=revision_id,
                connector_instance_id=ci_id,
                pin_number=1,
                name="p1",
            )
        )
    await session.flush()

    session.add(
        ConnectionEdge(
            id=uuid.uuid4(),
            revision_id=revision_id,
            vehicle_id=vehicle_id,
            pin_a_id=pin_ids[0],
            pin_b_id=pin_ids[1],
            created_at=now,
        )
    )
    await session.flush()
    return s


# ---------------------------------------------------------------------------
# Client / override plumbing
# ---------------------------------------------------------------------------


def _override_user() -> UserContext:
    return UserContext(
        user_id=uuid.uuid4(),
        username="tester",
        is_admin=True,
        session_id=uuid.uuid4(),
    )


async def _run_with_client(session_factory, scenario):
    """Open one session, install overrides, run ``scenario(client, session)``.

    The session is shared by every request (so uncommitted seed data is
    visible) and rolled back afterwards for isolation. Overrides are always
    cleared even if the scenario raises.
    """
    async with session_factory() as session:

        async def _get_db_override():
            yield session

        app.dependency_overrides[get_db] = _get_db_override
        app.dependency_overrides[get_current_user] = _override_user
        transport = ASGITransport(app=app)
        try:
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                return await scenario(client, session)
        finally:
            app.dependency_overrides.pop(get_db, None)
            app.dependency_overrides.pop(get_current_user, None)
            await session.rollback()


# ---------------------------------------------------------------------------
# Task 3.2 -- GET endpoint behavior
# ---------------------------------------------------------------------------


def test_get_seeded_revision_returns_200_and_valid_dto(session_factory, db_loop):
    # Req 2.10: seeded revision returns 200 + a valid TopologyGraphProjectionDto.
    async def scenario(client, session):
        s = await seed_basic(session)
        resp = await client.get(
            f"/api/v1/vehicles/{s.vehicle_id}/revisions/{s.revision_id}/topology-graph"
        )
        return s, resp

    s, resp = db_loop.run_until_complete(_run_with_client(session_factory, scenario))

    assert resp.status_code == 200, resp.text
    body = resp.json()

    # Top-level DTO shape.
    assert body["revision_id"] == str(s.revision_id)
    assert body["view_key"] == VIEW_KEY
    assert isinstance(body["nodes"], list)
    assert isinstance(body["edges"], list)
    assert isinstance(body["meta"], dict)

    # Exactly the three expected top-level nodes.
    node_ids = {n["id"] for n in body["nodes"]}
    assert node_ids == {
        f"tg-node:{s.enclosure_a_id}",
        f"tg-node:{s.enclosure_b_id}",
        f"tg-node:{s.pcb_id}",
    }

    # Each node carries the required fields with valid kinds and null positions.
    kinds_by_id = {n["id"]: n["entity_kind"] for n in body["nodes"]}
    assert kinds_by_id[f"tg-node:{s.enclosure_a_id}"] == "enclosure_instance"
    assert kinds_by_id[f"tg-node:{s.enclosure_b_id}"] == "enclosure_instance"
    assert kinds_by_id[f"tg-node:{s.pcb_id}"] == "pcb_instance"
    for n in body["nodes"]:
        assert set(n) >= {"id", "entity_kind", "label", "template_label", "position"}
        assert isinstance(n["label"], str)
        assert n["position"] is None  # no saved layout yet

    # Exactly one edge between the two enclosures, sorted endpoints, wire_count 1.
    assert len(body["edges"]) == 1
    edge = body["edges"][0]
    lo, hi = sorted([f"tg-node:{s.enclosure_a_id}", f"tg-node:{s.enclosure_b_id}"])
    assert edge["source"] == lo
    assert edge["target"] == hi
    assert edge["id"] == f"tg-edge:{lo}:{hi}"
    assert edge["wire_count"] == 1


def test_get_empty_revision_returns_empty_nodes_and_edges(session_factory, db_loop):
    # Req 2.11: a revision with no instances yields empty nodes/edges.
    async def scenario(client, session):
        vehicle_id, revision_id = await _new_revision(session)
        resp = await client.get(
            f"/api/v1/vehicles/{vehicle_id}/revisions/{revision_id}/topology-graph"
        )
        return resp

    resp = db_loop.run_until_complete(_run_with_client(session_factory, scenario))

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["nodes"] == []
    assert body["edges"] == []


def test_get_unknown_revision_returns_404(session_factory, db_loop):
    # Req 2.12: unknown revision id -> 404 with a descriptive message.
    async def scenario(client, session):
        vehicle_id, _revision_id = await _new_revision(session)
        unknown_revision_id = uuid.uuid4()
        resp = await client.get(
            f"/api/v1/vehicles/{vehicle_id}/revisions/{unknown_revision_id}/topology-graph"
        )
        return resp

    resp = db_loop.run_until_complete(_run_with_client(session_factory, scenario))

    assert resp.status_code == 404, resp.text
    detail = resp.json()["detail"]
    assert isinstance(detail, str) and detail  # descriptive, non-empty
    assert "not found" in detail.lower()


def test_get_wrong_vehicle_revision_returns_404(session_factory, db_loop):
    # Req 2.12: revision that exists but belongs to another vehicle -> 404.
    async def scenario(client, session):
        s = await seed_basic(session)
        other_vehicle_id = uuid.uuid4()
        session.add(Vehicle(id=other_vehicle_id, name=f"veh-{other_vehicle_id}"))
        await session.flush()
        resp = await client.get(
            f"/api/v1/vehicles/{other_vehicle_id}/revisions/{s.revision_id}/topology-graph"
        )
        return resp

    resp = db_loop.run_until_complete(_run_with_client(session_factory, scenario))

    assert resp.status_code == 404, resp.text
    detail = resp.json()["detail"]
    assert isinstance(detail, str) and detail
    assert "not found" in detail.lower()


# ---------------------------------------------------------------------------
# Task 3.3 -- PATCH layout round-trip
# ---------------------------------------------------------------------------


def test_patch_layout_then_get_reflects_positions(session_factory, db_loop):
    # Req 3.2, 3.3: PATCH positions then GET shows populated positions.
    async def scenario(client, session):
        s = await seed_basic(session)
        base = f"/api/v1/vehicles/{s.vehicle_id}/revisions/{s.revision_id}/topology-graph"
        payload = [
            {
                "entity_kind": EntityKind.ENCLOSURE_INSTANCE.value,
                "entity_id": str(s.enclosure_a_id),
                "x": 12.5,
                "y": -7.0,
            },
            {
                "entity_kind": EntityKind.PCB_INSTANCE.value,
                "entity_id": str(s.pcb_id),
                "x": 100.0,
                "y": 200.0,
            },
        ]
        patch_resp = await client.patch(f"{base}/layout", json=payload)
        get_resp = await client.get(base)
        return s, patch_resp, get_resp

    s, patch_resp, get_resp = db_loop.run_until_complete(
        _run_with_client(session_factory, scenario)
    )

    assert patch_resp.status_code == 200, patch_resp.text
    assert get_resp.status_code == 200, get_resp.text

    positions = {n["id"]: n["position"] for n in get_resp.json()["nodes"]}
    assert positions[f"tg-node:{s.enclosure_a_id}"] == {"x": 12.5, "y": -7.0}
    assert positions[f"tg-node:{s.pcb_id}"] == {"x": 100.0, "y": 200.0}
    # Enclosure B was never PATCHed, so it has no saved position.
    assert positions[f"tg-node:{s.enclosure_b_id}"] is None


def test_repeat_patch_updates_in_place_without_duplicate_rows(session_factory, db_loop):
    # Req 3.2: repeated PATCH for the same node upserts in place (unique
    # constraint on revision_id/view_key/entity_kind/entity_id) -- no dup rows.
    async def scenario(client, session):
        s = await seed_basic(session)
        base = f"/api/v1/vehicles/{s.vehicle_id}/revisions/{s.revision_id}/topology-graph"
        first = [
            {
                "entity_kind": EntityKind.ENCLOSURE_INSTANCE.value,
                "entity_id": str(s.enclosure_a_id),
                "x": 1.0,
                "y": 2.0,
            }
        ]
        second = [
            {
                "entity_kind": EntityKind.ENCLOSURE_INSTANCE.value,
                "entity_id": str(s.enclosure_a_id),
                "x": 50.0,
                "y": 60.0,
            }
        ]
        await client.patch(f"{base}/layout", json=first)
        await client.patch(f"{base}/layout", json=second)
        get_resp = await client.get(base)

        row_count = await session.scalar(
            select(func.count())
            .select_from(NodeLayout)
            .where(
                NodeLayout.revision_id == s.revision_id,
                NodeLayout.view_key == VIEW_KEY,
                NodeLayout.entity_kind == EntityKind.ENCLOSURE_INSTANCE,
                NodeLayout.entity_id == s.enclosure_a_id,
            )
        )
        return s, get_resp, row_count

    s, get_resp, row_count = db_loop.run_until_complete(
        _run_with_client(session_factory, scenario)
    )

    # Exactly one persisted row for the node -> updated in place, not duplicated.
    assert row_count == 1
    assert get_resp.status_code == 200, get_resp.text
    positions = {n["id"]: n["position"] for n in get_resp.json()["nodes"]}
    # GET reflects the latest PATCH value.
    assert positions[f"tg-node:{s.enclosure_a_id}"] == {"x": 50.0, "y": 60.0}
