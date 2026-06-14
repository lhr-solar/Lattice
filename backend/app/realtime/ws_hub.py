import json
from dataclasses import dataclass, field
from uuid import UUID

from fastapi import WebSocket


@dataclass
class WsSubscription:
    websocket: WebSocket
    vehicle_id: UUID
    revision_id: UUID
    user_id: UUID


@dataclass
class PresenceSubscription:
    websocket: WebSocket
    user_id: UUID


@dataclass
class WsHub:
    _subscriptions: list[WsSubscription] = field(default_factory=list)
    _presence: list[PresenceSubscription] = field(default_factory=list)

    async def connect(
        self,
        websocket: WebSocket,
        vehicle_id: UUID,
        revision_id: UUID,
        *,
        user_id: UUID,
    ) -> None:
        await websocket.accept()
        self._subscriptions.append(
            WsSubscription(
                websocket=websocket,
                vehicle_id=vehicle_id,
                revision_id=revision_id,
                user_id=user_id,
            )
        )

    async def connect_presence(self, websocket: WebSocket, *, user_id: UUID) -> None:
        await websocket.accept()
        self._presence.append(PresenceSubscription(websocket=websocket, user_id=user_id))
        payload = self._presence_payload()
        try:
            await websocket.send_text(payload)
        except Exception:
            pass
        await self._broadcast_presence_changed()

    def connected_user_ids(self) -> set[UUID]:
        revision_users = {sub.user_id for sub in self._subscriptions}
        presence_users = {sub.user_id for sub in self._presence}
        return revision_users | presence_users

    def connected_count(self) -> int:
        return len(self.connected_user_ids())

    async def disconnect(self, websocket: WebSocket, *, broadcast: bool = True) -> None:
        old_users = self.connected_user_ids()
        self._subscriptions = [s for s in self._subscriptions if s.websocket is not websocket]
        self._presence = [s for s in self._presence if s.websocket is not websocket]
        if broadcast and self.connected_user_ids() != old_users:
            await self._broadcast_presence_changed()

    def _presence_payload(self) -> str:
        ids = sorted(str(uid) for uid in self.connected_user_ids())
        return json.dumps(
            {
                "type": "presence_changed",
                "connected_user_ids": ids,
                "connected_count": len(ids),
            }
        )

    async def _broadcast_presence_changed(self) -> None:
        while True:
            payload = self._presence_payload()
            dead: list[WebSocket] = []
            for sub in list(self._presence):
                try:
                    await sub.websocket.send_text(payload)
                except Exception:
                    dead.append(sub.websocket)
            if not dead:
                break
            self._subscriptions = [s for s in self._subscriptions if s.websocket not in dead]
            self._presence = [s for s in self._presence if s.websocket not in dead]

    async def broadcast_revision_changed(
        self,
        *,
        vehicle_id: UUID,
        revision_id: UUID,
        edit_sequence: int,
        domains: list[str],
        changed_by: str | None,
    ) -> None:
        payload = json.dumps(
            {
                "type": "revision_changed",
                "vehicle_id": str(vehicle_id),
                "revision_id": str(revision_id),
                "edit_sequence": edit_sequence,
                "domains": domains,
                "changed_by": changed_by,
            }
        )
        await self._broadcast_to_revision(vehicle_id, revision_id, payload)

    async def broadcast_revision_published(
        self,
        *,
        vehicle_id: UUID,
        old_revision_id: UUID,
        new_revision_id: UUID,
        changed_by: str | None,
    ) -> None:
        payload = json.dumps(
            {
                "type": "revision_published",
                "vehicle_id": str(vehicle_id),
                "old_revision_id": str(old_revision_id),
                "new_revision_id": str(new_revision_id),
                "edit_sequence": 0,
                "changed_by": changed_by,
            }
        )
        await self._broadcast_to_revision(vehicle_id, old_revision_id, payload)

    async def broadcast_mutation_patch(
        self,
        *,
        vehicle_id: UUID,
        revision_id: UUID,
        edit_sequence: int,
        domains: list[str],
        covered_domains: list[str],
        changed_by: str | None,
        event_id: str,
        occurred_at: str,
        patch: dict,
    ) -> None:
        payload = json.dumps(
            {
                "type": "mutation_patch",
                "vehicle_id": str(vehicle_id),
                "revision_id": str(revision_id),
                "edit_sequence": edit_sequence,
                "domains": domains,
                "covered_domains": covered_domains,
                "changed_by": changed_by,
                "event_id": event_id,
                "occurred_at": occurred_at,
                "patch": patch,
            }
        )
        await self._broadcast_to_revision(vehicle_id, revision_id, payload)

    async def _broadcast_to_revision(self, vehicle_id: UUID, revision_id: UUID, payload: str) -> None:
        dead: list[WebSocket] = []
        for sub in list(self._subscriptions):
            if sub.vehicle_id != vehicle_id or sub.revision_id != revision_id:
                continue
            try:
                await sub.websocket.send_text(payload)
            except Exception:
                dead.append(sub.websocket)
        for ws in dead:
            await self.disconnect(ws, broadcast=False)


ws_hub = WsHub()
