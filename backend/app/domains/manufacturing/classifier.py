from uuid import UUID

from app.domains.topology.pin_context import PinContext
from app.infrastructure.db.enums import HarnessScope


def classify_edge_scope(ctx: PinContext, pin_a_id: UUID, pin_b_id: UUID) -> HarnessScope:
    enc_a = ctx.enclosure_for_pin(pin_a_id)
    enc_b = ctx.enclosure_for_pin(pin_b_id)
    if enc_a is not None and enc_a == enc_b:
        return HarnessScope.INTERNAL
    return HarnessScope.EXTERNAL


def harness_group_key(scope: HarnessScope, enc_a: UUID | None, enc_b: UUID | None) -> str:
    if scope == HarnessScope.INTERNAL and enc_a:
        return f"internal:{enc_a}"
    pair = sorted([str(e) for e in (enc_a, enc_b) if e])
    return f"external:{'-'.join(pair) if pair else 'vehicle'}"
