from uuid import uuid4

from app.domains.connectors.export import connector_kind_for_instance, is_pigtail_instance
from app.infra.db.enums import ConnectorCategory
from app.infra.db.models.catalog import ConnectorTemplate
from app.infra.db.models.instances import ConnectorInstance


def _conn(**kwargs) -> ConnectorInstance:
    defaults = {
        "id": uuid4(),
        "revision_id": uuid4(),
        "vehicle_id": uuid4(),
        "connector_template_id": uuid4(),
        "pcb_instance_id": None,
        "source_pcb_instance_id": None,
        "is_panel_mount": False,
    }
    defaults.update(kwargs)
    return ConnectorInstance(**defaults)


def _tmpl(**kwargs) -> ConnectorTemplate:
    defaults = {
        "id": uuid4(),
        "name": "Test",
        "connector_category": ConnectorCategory.WIRE_TO_BOARD,
        "default_is_panel_mount": False,
        "is_inline_template": False,
    }
    defaults.update(kwargs)
    return ConnectorTemplate(**defaults)


def test_on_node_pigtail_is_pcb_kind_but_pigtail_visual():
    pcb_id = uuid4()
    conn = _conn(pcb_instance_id=pcb_id, is_panel_mount=False)
    tmpl = _tmpl(default_is_panel_mount=False)
    assert is_pigtail_instance(conn, tmpl) is True
    assert connector_kind_for_instance(conn, tmpl) == "pcb"


def test_exported_pigtail_not_panel():
    pcb_id = uuid4()
    conn = _conn(pcb_instance_id=pcb_id, is_panel_mount=True, source_pcb_instance_id=pcb_id)
    tmpl = _tmpl(default_is_panel_mount=False)
    assert is_pigtail_instance(conn, tmpl) is True
    assert connector_kind_for_instance(conn, tmpl) == "pigtail"


def test_exported_pigtail_without_source_pcb_still_pigtail():
    pcb_id = uuid4()
    conn = _conn(pcb_instance_id=pcb_id, is_panel_mount=True, source_pcb_instance_id=None)
    tmpl = _tmpl(default_is_panel_mount=False)
    assert connector_kind_for_instance(conn, tmpl) == "pigtail"


def test_exported_panel_mount_template_is_panel():
    pcb_id = uuid4()
    conn = _conn(pcb_instance_id=pcb_id, is_panel_mount=True, source_pcb_instance_id=pcb_id)
    tmpl = _tmpl(default_is_panel_mount=True)
    assert is_pigtail_instance(conn, tmpl) is False
    assert connector_kind_for_instance(conn, tmpl) == "panel"


def test_enclosure_panel_mount_is_panel():
    conn = _conn(is_panel_mount=True)
    tmpl = _tmpl(connector_category=ConnectorCategory.WIRE_TO_WIRE, default_is_panel_mount=True)
    assert connector_kind_for_instance(conn, tmpl) == "panel"
