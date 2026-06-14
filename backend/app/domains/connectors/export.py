from uuid import UUID

from app.infra.db.enums import ConnectorCategory
from app.infra.db.models.catalog import ConnectorTemplate
from app.infra.db.models.instances import ConnectorInstance
from app.infra.db.models.templates import PcbTemplateConnectorSlot


def should_export_from_node_slot(
    template: ConnectorTemplate,
    slot: PcbTemplateConnectorSlot,
    enclosure_instance_id: UUID | None,
) -> bool:
    """Whether a node-slot connector surfaces on the direct parent enclosure panel."""
    if enclosure_instance_id is None:
        return False
    if template.connector_category == ConnectorCategory.WIRE_TO_BOARD:
        if template.default_is_panel_mount:
            return True
        return bool(slot.export_to_enclosure)
    return bool(slot.export_to_enclosure)


def supports_node_slot_pigtail_option(template: ConnectorTemplate) -> bool:
    return (
        template.connector_category == ConnectorCategory.WIRE_TO_BOARD
        and not template.default_is_panel_mount
    )


def node_slot_auto_bubbles_to_enclosure(template: ConnectorTemplate) -> bool:
    return (
        template.connector_category == ConnectorCategory.WIRE_TO_BOARD
        and template.default_is_panel_mount
    )


def is_inline_connector_template(template: ConnectorTemplate) -> bool:
    return (
        template.connector_category == ConnectorCategory.WIRE_TO_WIRE
        and template.is_inline_template
    )


def supports_enclosure_panel_template(template: ConnectorTemplate) -> bool:
    return (
        template.connector_category == ConnectorCategory.WIRE_TO_WIRE
        and template.default_is_panel_mount
    )


def supports_node_slot_template(template: ConnectorTemplate) -> bool:
    return template.connector_category == ConnectorCategory.WIRE_TO_BOARD


def is_node_slot_panel_mount_template(template: ConnectorTemplate) -> bool:
    return (
        template.connector_category == ConnectorCategory.WIRE_TO_BOARD
        and template.default_is_panel_mount
    )


def is_pigtail_instance(conn: ConnectorInstance, template: ConnectorTemplate) -> bool:
    """Node-slot connector shown as pigtail (dotted), not panel mount."""
    if conn.pcb_instance_id is not None and not conn.is_panel_mount:
        if template.connector_category == ConnectorCategory.WIRE_TO_BOARD:
            return not template.default_is_panel_mount
        return False

    # Exported from a node slot — pigtail unless the template auto-bubbles as panel mount.
    if conn.pcb_instance_id is not None and conn.is_panel_mount:
        return not is_node_slot_panel_mount_template(template)

    if conn.source_pcb_instance_id is not None:
        return not is_node_slot_panel_mount_template(template)

    return False


def connector_kind_for_instance(conn: ConnectorInstance, template: ConnectorTemplate) -> str:
    # On-board node slot, not exported to the enclosure panel area.
    if conn.pcb_instance_id is not None and not conn.is_panel_mount:
        return "pcb"

    # Exported from a node slot (is_panel_mount); classify by template bubble behavior.
    if conn.pcb_instance_id is not None and conn.is_panel_mount:
        if is_node_slot_panel_mount_template(template):
            return "panel"
        return "pigtail"

    if conn.source_pcb_instance_id is not None:
        if is_node_slot_panel_mount_template(template):
            return "panel"
        return "pigtail"

    if conn.is_panel_mount:
        return "panel"
    if conn.pcb_instance_id is not None:
        return "pcb"
    return "inline"
