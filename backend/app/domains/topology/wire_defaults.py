"""Resolve default wire gauge and effective wire color for connection edges."""

from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infra.db.models.catalog import ConnectorTemplate
from app.infra.db.models.instances import ConnectorInstance, Pin


def resolve_pair_gauge(ga: Decimal | None, gb: Decimal | None) -> Decimal | None:
    """Pick the smaller AWG number (thicker wire) when both connectors define gauge."""
    vals = [v for v in (ga, gb) if v is not None]
    if not vals:
        return None
    return min(vals)


def format_gauge_label(gauge_awg: Decimal | None) -> str:
    if gauge_awg is None:
        return "No gauge defined"
    if gauge_awg == gauge_awg.to_integral_value():
        return f"{int(gauge_awg)} AWG"
    return f"{gauge_awg} AWG"


def effective_wire_color(edge_color: str | None, net_default: str | None) -> str | None:
    return edge_color if edge_color is not None else net_default


async def template_gauge_for_pin(db: AsyncSession, pin_id: UUID) -> Decimal | None:
    row = await db.execute(
        select(ConnectorTemplate.wire_gauge_awg)
        .join(ConnectorInstance, ConnectorInstance.connector_template_id == ConnectorTemplate.id)
        .join(Pin, Pin.connector_instance_id == ConnectorInstance.id)
        .where(Pin.id == pin_id)
    )
    return row.scalar_one_or_none()


async def default_gauge_for_pin_pair(
    db: AsyncSession, pin_a_id: UUID, pin_b_id: UUID
) -> Decimal | None:
    ga = await template_gauge_for_pin(db, pin_a_id)
    gb = await template_gauge_for_pin(db, pin_b_id)
    return resolve_pair_gauge(ga, gb)


async def pin_template_gauges_for_revision(
    db: AsyncSession, revision_id: UUID
) -> dict[UUID, Decimal | None]:
    rows = await db.execute(
        select(Pin.id, ConnectorTemplate.wire_gauge_awg)
        .join(ConnectorInstance, Pin.connector_instance_id == ConnectorInstance.id)
        .join(ConnectorTemplate, ConnectorInstance.connector_template_id == ConnectorTemplate.id)
        .where(Pin.revision_id == revision_id)
    )
    return {pin_id: gauge for pin_id, gauge in rows.all()}
