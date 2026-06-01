import re
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.display import resolve_display_name
from app.infrastructure.db.models.catalog import ConnectorTemplate
from app.infrastructure.db.models.instances import ConnectorInstance, Pin
from app.infrastructure.db.models.topology import Signal

NET_ARROW = " -> "


def sanitize_net_token(value: str) -> str:
    cleaned = re.sub(r"[^\w.-]+", "_", value.strip())
    return cleaned or "pin"


def is_auto_net_name(name: str) -> bool:
    return NET_ARROW in name


def is_user_named_net(name: str) -> bool:
    return not is_auto_net_name(name)


def format_endpoint(connector_label: str, pin_name: str) -> str:
    return f"{sanitize_net_token(connector_label)}.{sanitize_net_token(pin_name)}"


def derive_pair_net_name(origin_conn: str, origin_pin: str, dest_conn: str, dest_pin: str) -> str:
    left = format_endpoint(origin_conn, origin_pin)
    right = format_endpoint(dest_conn, dest_pin)
    if left > right:
        left, right = right, left
    return f"{left}{NET_ARROW}{right}"


def derive_short_net_name(connector_label: str, pin_name: str) -> str:
    return format_endpoint(connector_label, pin_name)


async def get_pin_endpoint(db: AsyncSession, pin_id: UUID) -> tuple[str, str]:
    result = await db.execute(
        select(Pin, ConnectorInstance, ConnectorTemplate)
        .join(ConnectorInstance, Pin.connector_instance_id == ConnectorInstance.id)
        .join(ConnectorTemplate, ConnectorInstance.connector_template_id == ConnectorTemplate.id)
        .where(Pin.id == pin_id)
    )
    row = result.one_or_none()
    if not row:
        return "unknown", "unknown"
    pin, conn, tmpl = row
    label = resolve_display_name(
        template_name=tmpl.name,
        nickname=conn.nickname,
        use_template_name=conn.use_template_name,
    )
    return label, pin.name


async def derive_pair_net_name_for_pins(db: AsyncSession, pin_a_id: UUID, pin_b_id: UUID) -> str:
    conn_a, pin_a = await get_pin_endpoint(db, pin_a_id)
    conn_b, pin_b = await get_pin_endpoint(db, pin_b_id)
    if conn_a == conn_b:
        return derive_short_net_name(conn_a, pin_a if pin_a <= pin_b else pin_b)
    return derive_pair_net_name(conn_a, pin_a, conn_b, pin_b)


async def derive_lone_pin_net_name(db: AsyncSession, pin_id: UUID) -> str:
    conn, pin_name = await get_pin_endpoint(db, pin_id)
    return derive_short_net_name(conn, pin_name)


async def ensure_unique_net_name(db: AsyncSession, revision_id: UUID, base_name: str) -> str:
    candidate = base_name
    suffix = 2
    while True:
        exists = await db.execute(
            select(Signal.id).where(Signal.revision_id == revision_id, Signal.name == candidate)
        )
        if not exists.scalar_one_or_none():
            return candidate
        candidate = f"{base_name} ({suffix})"
        suffix += 1
