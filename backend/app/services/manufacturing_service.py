from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth_context import UserContext
from app.core.revision_guard import ensure_mutable_revision, get_revision_or_404
from app.core.time import utc_now
from app.domains.manufacturing.classifier import classify_edge_scope, harness_group_key
from app.domains.topology.pin_context import load_pin_context
from app.infra.db.enums import HarnessScope
from app.infra.db.models.catalog import ConnectorTemplate
from app.infra.db.models.instances import ConnectorInstance, Pin
from app.infra.db.models.manufacturing import (
    ContinuityCheck,
    EdgeManufacturingAudit,
    HarnessGroup,
    HarnessGroupEdge,
    ManufacturingRecord,
)
from app.infra.db.models.topology import ConnectionEdge
from app.schemas.connections import ConnectionDestination, PinConnectionRow
from app.infra.db.models.user import User
from app.schemas.manufacturing import (
    BomRow,
    ConnectorBomResponse,
    ContinuityCheckCreate,
    ContinuityCheckResponse,
    EdgeManufacturingUpdate,
    HarnessGroupResponse,
    ManufacturerGroup,
    ManufacturingProjectionResponse,
    ManufacturingRecordCreate,
    ManufacturingRecordResponse,
    ManufacturingRecordUpdate,
    WireManufacturingUserInfo,
    WireRow,
    WireTableResponse,
)
from app.services.connection_service import ConnectionService
from app.services.revision_sync_service import DOMAINS_MANUFACTURING, RevisionSyncService


class ManufacturingService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def sync_harness_groups(self, vehicle_id: UUID, revision_id: UUID) -> list[HarnessGroupResponse]:
        await get_revision_or_404(self.db, revision_id, vehicle_id)
        ctx = await load_pin_context(self.db, revision_id)

        group_ids = select(HarnessGroup.id).where(HarnessGroup.revision_id == revision_id).scalar_subquery()
        await self.db.execute(delete(HarnessGroupEdge).where(HarnessGroupEdge.harness_group_id.in_(group_ids)))
        await self.db.execute(delete(HarnessGroup).where(HarnessGroup.revision_id == revision_id))

        edges_result = await self.db.execute(
            select(ConnectionEdge).where(ConnectionEdge.revision_id == revision_id)
        )
        buckets: dict[str, dict] = {}
        for edge in edges_result.scalars().all():
            scope = classify_edge_scope(ctx, edge.pin_a_id, edge.pin_b_id)
            enc_a = ctx.enclosure_for_pin(edge.pin_a_id)
            enc_b = ctx.enclosure_for_pin(edge.pin_b_id)
            key = harness_group_key(scope, enc_a, enc_b)
            if key not in buckets:
                name = self._group_name(scope, enc_a, enc_b)
                buckets[key] = {
                    "scope": scope,
                    "enclosure_id": enc_a if scope == HarnessScope.INTERNAL else None,
                    "edge_ids": [],
                    "name": name,
                }
            buckets[key]["edge_ids"].append(edge.id)
            edge.harness_scope = scope
            edge.enclosure_a_id = enc_a
            edge.enclosure_b_id = enc_b

        groups: list[HarnessGroup] = []
        for data in buckets.values():
            group = HarnessGroup(
                revision_id=revision_id,
                vehicle_id=vehicle_id,
                name=data["name"],
                scope=data["scope"],
                enclosure_instance_id=data["enclosure_id"],
            )
            self.db.add(group)
            await self.db.flush()
            for eid in data["edge_ids"]:
                self.db.add(HarnessGroupEdge(harness_group_id=group.id, connection_edge_id=eid))
            groups.append(group)

        await self.db.flush()
        return [await self._group_response(g) for g in groups]

    async def build_connector_bom(self, vehicle_id: UUID, revision_id: UUID) -> ConnectorBomResponse:
        await get_revision_or_404(self.db, revision_id, vehicle_id)

        # Count instances per template scoped to the revision
        counts_result = await self.db.execute(
            select(ConnectorInstance.connector_template_id, func.count())
            .where(ConnectorInstance.revision_id == revision_id)
            .group_by(ConnectorInstance.connector_template_id)
        )
        counts = {tid: n for tid, n in counts_result.all()}

        if not counts:
            return ConnectorBomResponse(groups=[])

        # Load only participating templates
        templates_result = await self.db.execute(
            select(ConnectorTemplate).where(ConnectorTemplate.id.in_(counts.keys()))
        )
        templates = templates_result.scalars().all()

        return self._aggregate_bom(templates, counts)

    def _aggregate_bom(self, templates: list[ConnectorTemplate], counts: dict[UUID, int]) -> ConnectorBomResponse:
        import unicodedata

        def normalize_manufacturer(m: str | None) -> str | None:
            if m is None or not m.strip():
                return None
            return m.strip().casefold()

        def normalize_name(name: str | None) -> str:
            if name is None:
                return ""
            return unicodedata.normalize("NFKD", name).casefold()

        # Group templates by normalized manufacturer
        groups_by_norm: dict[str | None, list[ConnectorTemplate]] = {}
        for tmpl in templates:
            norm = normalize_manufacturer(tmpl.manufacturer)
            groups_by_norm.setdefault(norm, []).append(tmpl)

        manufacturer_groups: list[ManufacturerGroup] = []

        # Sort groups by normalized key, Unassigned (None) last
        sorted_keys = sorted([k for k in groups_by_norm.keys() if k is not None])
        if None in groups_by_norm:
            sorted_keys.append(None)

        for norm in sorted_keys:
            members = groups_by_norm[norm]

            # Canonical label: trimmed, original-case manufacturer of earliest-created member
            if norm is None:
                canonical_label = None
            else:
                # Earliest created_at, break ties with id
                canonical_tmpl = min(members, key=lambda t: (t.created_at, t.id))
                canonical_label = canonical_tmpl.manufacturer.strip()

            # Build and sort rows within group
            rows: list[BomRow] = []
            for tmpl in members:
                rows.append(
                    BomRow(
                        connector_template_id=tmpl.id,
                        name=tmpl.name,
                        manufacturer=tmpl.manufacturer,
                        pin_count=tmpl.pin_count,
                        wire_gauge_awg=float(tmpl.wire_gauge_awg) if tmpl.wire_gauge_awg is not None else None,
                        connector_category=tmpl.connector_category,
                        default_role=tmpl.default_role,
                        male_part_number=tmpl.male_part_number,
                        female_part_number=tmpl.female_part_number,
                        male_crimp_part_number=tmpl.male_crimp_part_number,
                        female_crimp_part_number=tmpl.female_crimp_part_number,
                        key_code=tmpl.key_code,
                        is_inline_template=tmpl.is_inline_template,
                        default_is_panel_mount=tmpl.default_is_panel_mount,
                        inline_part_number=tmpl.part_number,
                        quantity=counts[tmpl.id],
                    )
                )

            # Sort rows by name ascending, null/empty last
            rows.sort(
                key=lambda r: (
                    r.name is None or not r.name.strip(),
                    normalize_name(r.name),
                    r.connector_template_id,
                )
            )

            manufacturer_groups.append(ManufacturerGroup(manufacturer=canonical_label, rows=rows))

        return ConnectorBomResponse(groups=manufacturer_groups)

    async def get_projection(self, vehicle_id: UUID, revision_id: UUID) -> ManufacturingProjectionResponse:
        await get_revision_or_404(self.db, revision_id, vehicle_id)
        groups_result = await self.db.execute(
            select(HarnessGroup).where(HarnessGroup.revision_id == revision_id)
        )
        groups = [await self._group_response(g) for g in groups_result.scalars().all()]
        internal = [g for g in groups if g.scope == HarnessScope.INTERNAL]
        external = [g for g in groups if g.scope == HarnessScope.EXTERNAL]

        records_result = await self.db.execute(
            select(ManufacturingRecord).where(ManufacturingRecord.revision_id == revision_id)
        )
        records = [await self._record_response(r) for r in records_result.scalars().all()]

        return ManufacturingProjectionResponse(
            revision_id=revision_id,
            internal_groups=internal,
            external_groups=external,
            records=records,
        )

    async def create_record(
        self, vehicle_id: UUID, revision_id: UUID, payload: ManufacturingRecordCreate
    ) -> ManufacturingRecordResponse:
        group = await self.db.get(HarnessGroup, payload.harness_group_id)
        if not group or group.revision_id != revision_id:
            raise HTTPException(status_code=404, detail="Harness group not found")
        record = ManufacturingRecord(
            revision_id=revision_id,
            harness_group_id=payload.harness_group_id,
            notes=payload.notes,
        )
        self.db.add(record)
        await self.db.flush()
        return await self._record_response(record)

    async def update_record(
        self,
        revision_id: UUID,
        record_id: UUID,
        payload: ManufacturingRecordUpdate,
        user_name: str | None,
    ) -> ManufacturingRecordResponse:
        record = await self.db.get(ManufacturingRecord, record_id)
        if not record or record.revision_id != revision_id:
            raise HTTPException(status_code=404, detail="Manufacturing record not found")
        data = payload.model_dump(exclude_unset=True)
        if "built_by" in data and data["built_by"] is None and user_name:
            data["built_by"] = user_name
        if "built_at" in data and data.get("built_at") is None and "built_by" in data:
            data["built_at"] = utc_now()
        for key, value in data.items():
            setattr(record, key, value)
        await self.db.flush()
        return await self._record_response(record)

    async def add_continuity_check(
        self,
        revision_id: UUID,
        record_id: UUID,
        payload: ContinuityCheckCreate,
        user_name: str,
    ) -> ContinuityCheckResponse:
        record = await self.db.get(ManufacturingRecord, record_id)
        if not record or record.revision_id != revision_id:
            raise HTTPException(status_code=404, detail="Manufacturing record not found")
        now = utc_now()
        check = ContinuityCheck(
            manufacturing_record_id=record_id,
            performed_by=user_name,
            performed_at=now,
            passed=payload.passed,
            details=payload.details,
        )
        self.db.add(check)
        record.continuity_checked_by = user_name
        record.continuity_checked_at = now
        await self.db.flush()
        return ContinuityCheckResponse.model_validate(check)

    async def build_wire_table(
        self,
        vehicle_id: UUID,
        revision_id: UUID,
        *,
        connector_instance_id: UUID | None = None,
        pcb_instance_id: UUID | None = None,
        enclosure_instance_id: UUID | None = None,
        vehicle_level: bool = False,
        search: str | None = None,
    ) -> WireTableResponse:
        revision = await get_revision_or_404(self.db, revision_id, vehicle_id)
        pin_rows = await ConnectionService(self.db).build_table(
            revision_id,
            connector_instance_id=connector_instance_id,
            pcb_instance_id=pcb_instance_id,
            enclosure_instance_id=enclosure_instance_id,
            vehicle_level=vehicle_level,
        )

        seen_edges: set[UUID] = set()
        edge_ids: list[UUID] = []
        wire_drafts: list[dict] = []

        for row in pin_rows:
            for dest in row.destinations:
                if dest.edge_id in seen_edges:
                    continue
                seen_edges.add(dest.edge_id)
                edge_ids.append(dest.edge_id)

                if vehicle_level:
                    section_key = row.enclosure_label or row.node_label or "__inline__"
                    section_title = section_key if section_key != "__inline__" else "Inline / standalone"
                elif enclosure_instance_id:
                    if row.connector_kind == "pcb" and row.node_label:
                        section_key = f"node:{row.node_label}"
                        section_title = row.node_label
                    else:
                        section_key = "__panel__"
                        section_title = "Panel / Pigtail"
                elif row.enclosure_label:
                    section_key = f"enc:{row.enclosure_label}"
                    section_title = row.enclosure_label
                elif row.node_label:
                    section_key = f"node:{row.node_label}"
                    section_title = row.node_label
                else:
                    section_key = "__inline__"
                    section_title = "Inline / standalone"

                pin_label = (
                    row.pin_name
                    if row.pin_name and row.pin_name.strip() != str(row.pin_number)
                    else f"#{row.pin_number}"
                )
                dest_pin_label = (
                    dest.other_pin_name
                    if dest.other_pin_name and dest.other_pin_name.strip() != str(dest.other_pin_number)
                    else f"#{dest.other_pin_number}"
                )

                wire_drafts.append(
                    {
                        "edge_id": dest.edge_id,
                        "signal_name": row.primary_net_name,
                        "source_node": row.node_label,
                        "source_slot_id": row.slot_key,
                        "source_connector": row.connector_label,
                        "source_pin": pin_label,
                        "source_pin_number": row.pin_number,
                        "source_pin_name": row.pin_name,
                        "destination_node": dest.other_node_label,
                        "destination_enclosure": dest.other_enclosure_label,
                        "destination_slot_id": dest.other_slot_key,
                        "destination_connector_kind": dest.other_connector_kind,
                        "destination_connector": dest.other_connector_label,
                        "destination_pin": dest_pin_label,
                        "destination_pin_number": dest.other_pin_number,
                        "destination_pin_name": dest.other_pin_name,
                        "wire_color": dest.wire_color,
                        "effective_wire_color": dest.effective_wire_color,
                        "gauge_label": dest.gauge_label,
                        "section_key": section_key,
                        "section_title": section_title,
                    }
                )

        edges_by_id: dict[UUID, ConnectionEdge] = {}
        if edge_ids:
            edges_result = await self.db.execute(
                select(ConnectionEdge).where(ConnectionEdge.id.in_(edge_ids))
            )
            edges_by_id = {e.id: e for e in edges_result.scalars().all()}

        pin_ctx = await load_pin_context(self.db, revision_id)
        wire_drafts = [
            d
            for d in wire_drafts
            if self._edge_in_scope(
                edges_by_id.get(d["edge_id"]),
                pin_ctx=pin_ctx,
                vehicle_level=vehicle_level,
                enclosure_instance_id=enclosure_instance_id,
                connector_instance_id=connector_instance_id,
                pcb_instance_id=pcb_instance_id,
            )
        ]

        user_ids: set[UUID] = set()
        for edge in edges_by_id.values():
            if edge.manufactured_by_user_id:
                user_ids.add(edge.manufactured_by_user_id)
            if edge.continuity_checked_by_user_id:
                user_ids.add(edge.continuity_checked_by_user_id)

        users_by_id: dict[UUID, User] = {}
        if user_ids:
            users_result = await self.db.execute(select(User).where(User.id.in_(user_ids)))
            users_by_id = {u.id: u for u in users_result.scalars().all()}

        def user_info(uid: UUID | None) -> WireManufacturingUserInfo | None:
            if uid is None:
                return None
            user = users_by_id.get(uid)
            if user is None:
                return None
            return WireManufacturingUserInfo(user_id=user.id, username=user.username)

        edit_seq = revision.edit_sequence
        rows: list[WireRow] = []
        for draft in wire_drafts:
            edge = edges_by_id.get(draft["edge_id"])
            if edge is None:
                continue
            rows.append(
                WireRow(
                    edge_id=edge.id,
                    signal_name=draft["signal_name"],
                    source_node=draft["source_node"],
                    source_slot_id=draft.get("source_slot_id"),
                    source_connector=draft["source_connector"],
                    source_pin=draft["source_pin"],
                    source_pin_number=draft["source_pin_number"],
                    source_pin_name=draft["source_pin_name"],
                    destination_node=draft["destination_node"],
                    destination_enclosure=draft["destination_enclosure"],
                    destination_slot_id=draft.get("destination_slot_id"),
                    destination_connector_kind=draft["destination_connector_kind"],
                    destination_connector=draft["destination_connector"],
                    destination_pin=draft["destination_pin"],
                    destination_pin_number=draft["destination_pin_number"],
                    destination_pin_name=draft["destination_pin_name"],
                    wire_color=draft["wire_color"],
                    effective_wire_color=draft["effective_wire_color"],
                    gauge_label=draft["gauge_label"],
                    notes=edge.notes,
                    harness_scope=edge.harness_scope,
                    section_key=draft["section_key"],
                    section_title=draft["section_title"],
                    manufactured=edge.manufactured,
                    manufactured_by=user_info(edge.manufactured_by_user_id),
                    manufactured_at=edge.manufactured_at,
                    manufactured_stale=bool(
                        edge.manufactured
                        and edge.manufactured_at_edit_sequence is not None
                        and edge.manufactured_at_edit_sequence < edit_seq
                    ),
                    continuity_checked=edge.continuity_checked,
                    continuity_checked_by=user_info(edge.continuity_checked_by_user_id),
                    continuity_checked_at=edge.continuity_checked_at,
                    continuity_checked_stale=bool(
                        edge.continuity_checked
                        and edge.continuity_checked_at_edit_sequence is not None
                        and edge.continuity_checked_at_edit_sequence < edit_seq
                    ),
                )
            )

        query = (search or "").strip().lower()
        if query:
            rows = [
                r
                for r in rows
                if query
                in " ".join(
                    filter(
                        None,
                        [
                            r.signal_name,
                            r.source_node,
                            r.source_connector,
                            r.source_pin,
                            r.destination_node,
                            r.destination_enclosure,
                            r.destination_connector,
                            r.destination_pin,
                            r.wire_color,
                            r.effective_wire_color,
                            r.gauge_label,
                            r.notes,
                        ],
                    )
                ).lower()
            ]

        rows.sort(
            key=lambda r: (
                r.section_title or "",
                r.source_connector,
                r.source_pin_number,
                r.destination_connector,
                r.destination_pin_number,
            )
        )

        return WireTableResponse(revision_id=revision_id, edit_sequence=edit_seq, rows=rows)

    async def update_edge_manufacturing(
        self,
        vehicle_id: UUID,
        revision_id: UUID,
        edge_id: UUID,
        payload: EdgeManufacturingUpdate,
        user: UserContext,
    ) -> WireRow:
        await ensure_mutable_revision(self.db, revision_id, vehicle_id)
        edge = await self.db.get(ConnectionEdge, edge_id)
        if not edge or edge.revision_id != revision_id:
            raise HTTPException(status_code=404, detail="Connection edge not found")

        revision = await get_revision_or_404(self.db, revision_id, vehicle_id)
        now = utc_now()
        data = payload.model_dump(exclude_unset=True)

        if "manufactured" in data:
            prev = edge.manufactured
            new_val = data["manufactured"]
            if new_val:
                edge.manufactured = True
                edge.manufactured_by_user_id = user.user_id
                edge.manufactured_at = now
                edge.manufactured_at_edit_sequence = revision.edit_sequence
            else:
                edge.manufactured = False
                edge.manufactured_by_user_id = None
                edge.manufactured_at = None
                edge.manufactured_at_edit_sequence = None
            await self._audit_manufacturing_change(
                edge=edge,
                field="manufactured",
                previous_value={"value": prev},
                new_value={"value": new_val},
                user_id=user.user_id,
                changed_at=now,
            )

        if "continuity_checked" in data:
            prev = edge.continuity_checked
            new_val = data["continuity_checked"]
            if new_val:
                edge.continuity_checked = True
                edge.continuity_checked_by_user_id = user.user_id
                edge.continuity_checked_at = now
                edge.continuity_checked_at_edit_sequence = revision.edit_sequence
            else:
                edge.continuity_checked = False
                edge.continuity_checked_by_user_id = None
                edge.continuity_checked_at = None
                edge.continuity_checked_at_edit_sequence = None
            await self._audit_manufacturing_change(
                edge=edge,
                field="continuity_checked",
                previous_value={"value": prev},
                new_value={"value": new_val},
                user_id=user.user_id,
                changed_at=now,
            )

        await self.db.flush()
        await RevisionSyncService(self.db).notify_domains(
            vehicle_id=vehicle_id,
            revision_id=revision_id,
            domains=DOMAINS_MANUFACTURING,
            changed_by=user.username,
        )

        return await self._wire_row_for_edge(vehicle_id, revision_id, edge)

    async def _wire_row_for_edge(
        self, vehicle_id: UUID, revision_id: UUID, edge: ConnectionEdge
    ) -> WireRow:
        revision = await get_revision_or_404(self.db, revision_id, vehicle_id)
        pin_a = await self.db.get(Pin, edge.pin_a_id)
        pin_b = await self.db.get(Pin, edge.pin_b_id)
        if not pin_a or not pin_b:
            raise HTTPException(status_code=404, detail="Wire row not found after update")

        conn_svc = ConnectionService(self.db)
        draft: dict | None = None
        for connector_id in {pin_a.connector_instance_id, pin_b.connector_instance_id}:
            pin_rows = await conn_svc.build_table(
                revision_id, connector_instance_id=connector_id
            )
            for row in pin_rows:
                for dest in row.destinations:
                    if dest.edge_id == edge.id:
                        draft = self._draft_from_pin_dest(row, dest)
                        break
                if draft:
                    break
            if draft:
                break

        if draft is None:
            raise HTTPException(status_code=404, detail="Wire row not found after update")

        user_ids: set[UUID] = set()
        if edge.manufactured_by_user_id:
            user_ids.add(edge.manufactured_by_user_id)
        if edge.continuity_checked_by_user_id:
            user_ids.add(edge.continuity_checked_by_user_id)
        users_by_id: dict[UUID, User] = {}
        if user_ids:
            users_result = await self.db.execute(select(User).where(User.id.in_(user_ids)))
            users_by_id = {u.id: u for u in users_result.scalars().all()}

        return self._wire_row_from_draft(draft, edge, revision.edit_sequence, users_by_id)

    @staticmethod
    def _draft_from_pin_dest(row: PinConnectionRow, dest: ConnectionDestination) -> dict:
        if row.enclosure_label:
            section_key = f"enc:{row.enclosure_label}"
            section_title = row.enclosure_label
        elif row.node_label:
            section_key = f"node:{row.node_label}"
            section_title = row.node_label
        else:
            section_key = "__inline__"
            section_title = "Inline / standalone"

        pin_label = (
            row.pin_name
            if row.pin_name and row.pin_name.strip() != str(row.pin_number)
            else f"#{row.pin_number}"
        )
        dest_pin_label = (
            dest.other_pin_name
            if dest.other_pin_name and dest.other_pin_name.strip() != str(dest.other_pin_number)
            else f"#{dest.other_pin_number}"
        )

        return {
            "edge_id": dest.edge_id,
            "signal_name": row.primary_net_name,
            "source_node": row.node_label,
            "source_connector": row.connector_label,
            "source_pin": pin_label,
            "source_pin_number": row.pin_number,
            "source_pin_name": row.pin_name,
            "destination_node": dest.other_node_label,
            "destination_enclosure": dest.other_enclosure_label,
            "destination_connector_kind": dest.other_connector_kind,
            "destination_connector": dest.other_connector_label,
            "destination_pin": dest_pin_label,
            "destination_pin_number": dest.other_pin_number,
            "destination_pin_name": dest.other_pin_name,
            "wire_color": dest.wire_color,
            "effective_wire_color": dest.effective_wire_color,
            "gauge_label": dest.gauge_label,
            "section_key": section_key,
            "section_title": section_title,
        }

    def _wire_row_from_draft(
        self,
        draft: dict,
        edge: ConnectionEdge,
        edit_seq: int,
        users_by_id: dict[UUID, User],
    ) -> WireRow:
        def user_info(uid: UUID | None) -> WireManufacturingUserInfo | None:
            if uid is None:
                return None
            user = users_by_id.get(uid)
            if user is None:
                return None
            return WireManufacturingUserInfo(user_id=user.id, username=user.username)

        return WireRow(
            edge_id=edge.id,
            signal_name=draft["signal_name"],
            source_node=draft["source_node"],
            source_slot_id=draft.get("source_slot_id"),
            source_connector=draft["source_connector"],
            source_pin=draft["source_pin"],
            source_pin_number=draft["source_pin_number"],
            source_pin_name=draft["source_pin_name"],
            destination_node=draft["destination_node"],
            destination_enclosure=draft["destination_enclosure"],
            destination_slot_id=draft.get("destination_slot_id"),
            destination_connector_kind=draft["destination_connector_kind"],
            destination_connector=draft["destination_connector"],
            destination_pin=draft["destination_pin"],
            destination_pin_number=draft["destination_pin_number"],
            destination_pin_name=draft["destination_pin_name"],
            wire_color=draft["wire_color"],
            effective_wire_color=draft["effective_wire_color"],
            gauge_label=draft["gauge_label"],
            notes=edge.notes,
            harness_scope=edge.harness_scope,
            section_key=draft["section_key"],
            section_title=draft["section_title"],
            manufactured=edge.manufactured,
            manufactured_by=user_info(edge.manufactured_by_user_id),
            manufactured_at=edge.manufactured_at,
            manufactured_stale=bool(
                edge.manufactured
                and edge.manufactured_at_edit_sequence is not None
                and edge.manufactured_at_edit_sequence < edit_seq
            ),
            continuity_checked=edge.continuity_checked,
            continuity_checked_by=user_info(edge.continuity_checked_by_user_id),
            continuity_checked_at=edge.continuity_checked_at,
            continuity_checked_stale=bool(
                edge.continuity_checked
                and edge.continuity_checked_at_edit_sequence is not None
                and edge.continuity_checked_at_edit_sequence < edit_seq
            ),
        )

    async def _audit_manufacturing_change(
        self,
        *,
        edge: ConnectionEdge,
        field: str,
        previous_value: dict | None,
        new_value: dict,
        user_id: UUID,
        changed_at,
    ) -> None:
        self.db.add(
            EdgeManufacturingAudit(
                connection_edge_id=edge.id,
                revision_id=edge.revision_id,
                field=field,
                previous_value=previous_value,
                new_value=new_value,
                changed_by_user_id=user_id,
                changed_at=changed_at,
            )
        )

    async def _group_response(self, group: HarnessGroup) -> HarnessGroupResponse:
        edges = await self.db.execute(
            select(HarnessGroupEdge.connection_edge_id).where(
                HarnessGroupEdge.harness_group_id == group.id
            )
        )
        return HarnessGroupResponse(
            id=group.id,
            name=group.name,
            scope=group.scope,
            enclosure_instance_id=group.enclosure_instance_id,
            edge_ids=list(edges.scalars().all()),
        )

    async def _record_response(self, record: ManufacturingRecord) -> ManufacturingRecordResponse:
        group = await self.db.get(HarnessGroup, record.harness_group_id)
        checks_result = await self.db.execute(
            select(ContinuityCheck).where(ContinuityCheck.manufacturing_record_id == record.id)
        )
        return ManufacturingRecordResponse(
            id=record.id,
            revision_id=record.revision_id,
            harness_group_id=record.harness_group_id,
            harness_group_name=group.name if group else None,
            harness_scope=group.scope if group else None,
            built_by=record.built_by,
            built_at=record.built_at,
            continuity_checked_by=record.continuity_checked_by,
            continuity_checked_at=record.continuity_checked_at,
            status=record.status,
            notes=record.notes,
            continuity_checks=[
                ContinuityCheckResponse.model_validate(c) for c in checks_result.scalars().all()
            ],
        )

    @staticmethod
    def _edge_in_scope(
        edge: ConnectionEdge | None,
        *,
        pin_ctx,
        vehicle_level: bool,
        enclosure_instance_id: UUID | None,
        connector_instance_id: UUID | None,
        pcb_instance_id: UUID | None,
    ) -> bool:
        if edge is None:
            return False
        scope = edge.harness_scope
        if scope is None:
            scope = classify_edge_scope(pin_ctx, edge.pin_a_id, edge.pin_b_id)
        if vehicle_level:
            return scope == HarnessScope.EXTERNAL
        if enclosure_instance_id:
            enc_a = pin_ctx.enclosure_for_pin(edge.pin_a_id)
            enc_b = pin_ctx.enclosure_for_pin(edge.pin_b_id)
            return (
                scope == HarnessScope.INTERNAL
                and enc_a == enclosure_instance_id
                and enc_b == enclosure_instance_id
            )
        if connector_instance_id or pcb_instance_id:
            return True
        return True

    @staticmethod
    def _group_name(scope: HarnessScope, enc_a: UUID | None, enc_b: UUID | None) -> str:
        if scope == HarnessScope.INTERNAL and enc_a:
            return f"Internal harness ({str(enc_a)[:8]})"
        if enc_a and enc_b:
            return f"External {str(enc_a)[:8]} ↔ {str(enc_b)[:8]}"
        return "External vehicle harness"
