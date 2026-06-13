from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

from app.api.deps import get_db
from app.infra.db.enums import ConnectorGender
from app.infra.db.models.catalog import ConnectorTemplate, ConnectorTemplatePin
from app.infra.db.models.shorts import ConnectorInstancePinShort
from app.infra.db.models.instances import ConnectorInstance, Pin
from app.infra.db.models.topology import ConnectionEdge, PinSignalAssignment, Signal, SpliceConnection
from app.infra.db.models.vehicle import Revision
from app.schemas.connector_templates import (
    ConnectorTemplateCreate,
    ConnectorTemplatePinResponse,
    ConnectorTemplateResponse,
    ConnectorTemplateUpdate,
)
from app.services.connector_reconcile_service import ConnectorReconcileService
from app.services.revision_sync_service import RevisionSyncService
from app.services.short_service import ShortService

router = APIRouter(prefix="/connector-templates", tags=["connector-templates"])
LIBRARY_INSTANCE_DOMAINS = [
    "hierarchy",
    "design-projection",
    "connection-table",
    "topology-summary",
    "pins",
    "nets",
    "shorts",
]


@router.get("", response_model=list[ConnectorTemplateResponse])
async def list_connector_templates(db: AsyncSession = Depends(get_db)) -> list[ConnectorTemplateResponse]:
    result = await db.execute(
        select(ConnectorTemplate).options(selectinload(ConnectorTemplate.pins)).order_by(ConnectorTemplate.name)
    )
    templates = result.scalars().all()
    return [_to_response(t) for t in templates]


@router.post("", response_model=ConnectorTemplateResponse, status_code=201)
async def create_connector_template(
    payload: ConnectorTemplateCreate,
    db: AsyncSession = Depends(get_db),
) -> ConnectorTemplateResponse:
    template = ConnectorTemplate(
        name=payload.name,
        manufacturer=payload.manufacturer,
        gender=payload.default_inline_gender or ConnectorGender.UNKNOWN,
        pin_count=payload.pin_count,
        wire_gauge_awg=payload.wire_gauge_awg,
        default_role=payload.default_role,
        male_part_number=payload.male_part_number,
        female_part_number=payload.female_part_number,
        male_crimp_part_number=payload.male_crimp_part_number,
        female_crimp_part_number=payload.female_crimp_part_number,
        male_image_url=payload.male_image_url,
        female_image_url=payload.female_image_url,
        key_code=payload.key_code,
        connector_category=payload.connector_category,
        default_is_panel_mount=payload.default_is_panel_mount,
        is_inline_template=payload.is_inline_template,
        part_number=payload.inline_part_number,
    )
    db.add(template)
    await db.flush()

    for pin in payload.pins:
        db.add(
            ConnectorTemplatePin(
                connector_template_id=template.id,
                pin_number=pin.pin_number,
                name=pin.name,
                role=pin.role,
                signal_kind=pin.signal_kind,
            )
        )
    await db.flush()
    short_svc = ShortService(db)
    for ps in payload.pin_shorts:
        await short_svc.add_template_short(template.id, ps)
    loaded = await _load_template_with_pins(db, template.id)
    return _to_response(loaded)


@router.get("/{template_id}", response_model=ConnectorTemplateResponse)
async def get_connector_template(
    template_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> ConnectorTemplateResponse:
    template = await _load_template_with_pins(db, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Connector template not found")
    return _to_response(template)


@router.patch("/{template_id}", response_model=ConnectorTemplateResponse)
async def update_connector_template(
    template_id: UUID,
    payload: ConnectorTemplateUpdate,
    db: AsyncSession = Depends(get_db),
) -> ConnectorTemplateResponse:
    template = await db.get(ConnectorTemplate, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Connector template not found")

    template.name = payload.name
    template.manufacturer = payload.manufacturer
    template.pin_count = payload.pin_count
    template.wire_gauge_awg = payload.wire_gauge_awg
    template.default_role = payload.default_role
    template.male_part_number = payload.male_part_number
    template.female_part_number = payload.female_part_number
    template.male_crimp_part_number = payload.male_crimp_part_number
    template.female_crimp_part_number = payload.female_crimp_part_number
    template.male_image_url = payload.male_image_url
    template.female_image_url = payload.female_image_url
    template.key_code = payload.key_code
    template.connector_category = payload.connector_category
    template.default_is_panel_mount = payload.default_is_panel_mount
    template.is_inline_template = payload.is_inline_template
    template.gender = payload.default_inline_gender or ConnectorGender.UNKNOWN
    template.part_number = payload.inline_part_number

    existing_pins_result = await db.execute(
        select(ConnectorTemplatePin).where(ConnectorTemplatePin.connector_template_id == template_id)
    )
    existing_pins = existing_pins_result.scalars().all()
    existing_by_number = {pin.pin_number: pin for pin in existing_pins}
    requested_numbers = {pin.pin_number for pin in payload.pins}

    # Upsert pins by pin_number so editing works even when template pins are referenced by instances.
    for pin_payload in payload.pins:
        current = existing_by_number.get(pin_payload.pin_number)
        if current:
            current.name = pin_payload.name
            current.role = pin_payload.role
            current.signal_kind = pin_payload.signal_kind
            continue
        db.add(
            ConnectorTemplatePin(
                connector_template_id=template.id,
                pin_number=pin_payload.pin_number,
                name=pin_payload.name,
                role=pin_payload.role,
                signal_kind=pin_payload.signal_kind,
            )
        )

    touched_revisions: set[UUID] = set()
    for pin in existing_pins:
        if pin.pin_number in requested_numbers:
            continue
        in_use_rows = (
            await db.execute(
                select(Pin.id, Pin.revision_id, Revision.is_immutable)
                .join(Revision, Revision.id == Pin.revision_id)
                .where(Pin.connector_template_pin_id == pin.id)
            )
        ).all()
        immutable_refs = [row for row in in_use_rows if row[2]]
        if immutable_refs:
            raise HTTPException(
                status_code=409,
                detail=(
                    f'Cannot remove pin "{pin.pin_number}" because it is used by a published revision'
                ),
            )
        mutable_pin_ids = [row[0] for row in in_use_rows if not row[2]]
        mutable_revision_ids = {row[1] for row in in_use_rows if not row[2]}
        if mutable_pin_ids:
            touched_revisions.update(mutable_revision_ids)
            await _delete_instance_pins(db, mutable_pin_ids)
        await db.delete(pin)

    for revision_id in touched_revisions:
        await _prune_orphan_signals(db, revision_id)

    await db.flush()
    await ConnectorReconcileService(db).reconcile_instances_for_template(template.id)
    await _notify_revisions_for_template(db, template.id)
    loaded = await _load_template_with_pins(db, template.id)
    return _to_response(loaded)


@router.delete("/{template_id}", status_code=204)
async def delete_connector_template(
    template_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> None:
    template = await db.get(ConnectorTemplate, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Connector template not found")
    try:
        await db.delete(template)
        await db.flush()
    except IntegrityError as exc:
        raise HTTPException(
            status_code=409,
            detail="Connector template is in use and cannot be deleted",
        ) from exc
    return None


def _to_response(template: ConnectorTemplate) -> ConnectorTemplateResponse:
    return ConnectorTemplateResponse(
        id=template.id,
        name=template.name,
        manufacturer=template.manufacturer,
        pin_count=template.pin_count,
        wire_gauge_awg=float(template.wire_gauge_awg) if template.wire_gauge_awg is not None else None,
        default_role=template.default_role,
        male_part_number=template.male_part_number,
        female_part_number=template.female_part_number,
        male_crimp_part_number=template.male_crimp_part_number,
        female_crimp_part_number=template.female_crimp_part_number,
        male_image_url=template.male_image_url,
        female_image_url=template.female_image_url,
        key_code=template.key_code,
        connector_category=template.connector_category,
        default_is_panel_mount=template.default_is_panel_mount,
        is_inline_template=template.is_inline_template,
        default_inline_gender=template.gender if template.gender != ConnectorGender.UNKNOWN else None,
        inline_part_number=template.part_number,
        pins=[
            ConnectorTemplatePinResponse(
                id=p.id,
                pin_number=p.pin_number,
                name=p.name,
                role=p.role,
                signal_kind=p.signal_kind,
            )
            for p in template.pins
        ],
        created_at=template.created_at,
        updated_at=template.updated_at,
    )


async def _load_template_with_pins(
    db: AsyncSession, template_id: UUID
) -> ConnectorTemplate | None:
    result = await db.execute(
        select(ConnectorTemplate)
        .options(selectinload(ConnectorTemplate.pins))
        .where(ConnectorTemplate.id == template_id)
    )
    return result.scalar_one_or_none()


async def _notify_revisions_for_template(db: AsyncSession, template_id: UUID) -> None:
    affected = (
        await db.execute(
            select(ConnectorInstance.vehicle_id, ConnectorInstance.revision_id)
            .join(Revision, ConnectorInstance.revision_id == Revision.id)
            .where(
                ConnectorInstance.connector_template_id == template_id,
                Revision.is_immutable.is_(False),
            )
            .distinct()
        )
    ).all()
    if not affected:
        return

    sync_svc = RevisionSyncService(db)
    for vehicle_id, revision_id in affected:
        await sync_svc.notify_domains(
            vehicle_id=vehicle_id,
            revision_id=revision_id,
            domains=LIBRARY_INSTANCE_DOMAINS,
        )


async def _delete_instance_pins(db: AsyncSession, pin_ids: list[UUID]) -> None:
    if not pin_ids:
        return
    edge_ids = select(ConnectionEdge.id).where(
        or_(ConnectionEdge.pin_a_id.in_(pin_ids), ConnectionEdge.pin_b_id.in_(pin_ids))
    )
    await db.execute(delete(ConnectionEdge).where(ConnectionEdge.id.in_(edge_ids)))
    await db.execute(
        delete(ConnectorInstancePinShort).where(
            or_(
                ConnectorInstancePinShort.pin_a_id.in_(pin_ids),
                ConnectorInstancePinShort.pin_b_id.in_(pin_ids),
            )
        )
    )
    await db.execute(delete(SpliceConnection).where(SpliceConnection.pin_id.in_(pin_ids)))
    await db.execute(delete(PinSignalAssignment).where(PinSignalAssignment.pin_id.in_(pin_ids)))
    await db.execute(delete(Pin).where(Pin.id.in_(pin_ids)))


async def _prune_orphan_signals(db: AsyncSession, revision_id: UUID) -> None:
    assigned = (
        select(PinSignalAssignment.signal_id)
        .where(
            PinSignalAssignment.revision_id == revision_id,
            PinSignalAssignment.assignment_role == "primary",
        )
        .distinct()
    )
    await db.execute(
        delete(Signal).where(
            Signal.revision_id == revision_id,
            Signal.id.not_in(assigned),
        )
    )
