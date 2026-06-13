"""Resolve and merge nets when wiring connects pins on different signals."""

from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.topology.net_naming import is_auto_named_signal
from app.infra.db.models.topology import ConnectionEdge, PinSignalAssignment, Signal


def resolve_net_merge(
    net_a: Signal, net_b: Signal, merge_target_net_id: UUID | None
) -> tuple[Signal | None, Signal | None]:
    """Decide which of two distinct nets survives when joining their pins.

    Returns (target, loser). (None, None) means an unresolved conflict that
    needs the caller to choose (both nets are user-named).

    ``net_a`` is the first pin's net; when both are auto-named, it wins.
    A user-named net always wins over an auto-named net.
    """
    if merge_target_net_id is not None:
        if merge_target_net_id == net_a.id:
            return net_a, net_b
        if merge_target_net_id == net_b.id:
            return net_b, net_a
        raise HTTPException(
            status_code=400, detail="merge_target_net_id must be one of the two pins' nets"
        )

    a_auto = is_auto_named_signal(net_a.metadata_, net_a.name)
    b_auto = is_auto_named_signal(net_b.metadata_, net_b.name)
    if a_auto and not b_auto:
        return net_b, net_a  # named net wins
    if b_auto and not a_auto:
        return net_a, net_b
    if a_auto and b_auto:
        return net_a, net_b  # both auto: first pin's net wins
    return None, None  # both user-named and different: needs a choice


async def get_primary_net(
    db: AsyncSession, revision_id: UUID, pin_id: UUID
) -> Signal | None:
    return (
        await db.execute(
            select(Signal)
            .join(PinSignalAssignment, PinSignalAssignment.signal_id == Signal.id)
            .where(
                PinSignalAssignment.revision_id == revision_id,
                PinSignalAssignment.pin_id == pin_id,
                PinSignalAssignment.assignment_role == "primary",
            )
        )
    ).scalars().first()


async def absorb_net(
    db: AsyncSession, revision_id: UUID, loser_id: UUID, target_id: UUID
) -> None:
    """Move every pin and edge off ``loser`` onto ``target`` and delete loser."""
    target_pins = set(
        (
            await db.execute(
                select(PinSignalAssignment.pin_id).where(
                    PinSignalAssignment.revision_id == revision_id,
                    PinSignalAssignment.signal_id == target_id,
                    PinSignalAssignment.assignment_role == "primary",
                )
            )
        ).scalars().all()
    )
    loser_assignments = (
        await db.execute(
            select(PinSignalAssignment).where(
                PinSignalAssignment.revision_id == revision_id,
                PinSignalAssignment.signal_id == loser_id,
                PinSignalAssignment.assignment_role == "primary",
            )
        )
    ).scalars().all()
    for assignment in loser_assignments:
        if assignment.pin_id in target_pins:
            await db.delete(assignment)
        else:
            assignment.signal_id = target_id
            target_pins.add(assignment.pin_id)

    await db.execute(
        update(ConnectionEdge)
        .where(
            ConnectionEdge.revision_id == revision_id,
            ConnectionEdge.signal_id == loser_id,
        )
        .values(signal_id=target_id)
    )

    loser = await db.get(Signal, loser_id)
    if loser is not None:
        await db.delete(loser)
    await db.flush()
