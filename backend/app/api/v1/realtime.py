from uuid import UUID

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.auth_context import UserContext
from app.core.revision_guard import get_revision_or_404
from app.core.time import utc_now
from app.infra.db.models.revision import UserSession
from app.infra.db.models.user import User
from app.infra.db.session import async_session_factory
from app.realtime.ws_hub import ws_hub

router = APIRouter(tags=["realtime"])


async def _authenticate_ws(websocket: WebSocket) -> UserContext | None:
    session_id = websocket.cookies.get("lattice_session")
    if not session_id:
        return None
    try:
        parsed_session = UUID(session_id)
    except ValueError:
        return None

    async with async_session_factory() as db:
        session = await db.get(UserSession, parsed_session)
        if not session:
            return None
        user = await db.get(User, session.user_id)
        if not user:
            return None
        user_id = user.id
        username = user.username
        is_admin = user.is_admin
        session.last_seen_at = utc_now()
        await db.commit()
        return UserContext(
            user_id=user_id,
            username=username,
            is_admin=is_admin,
            session_id=parsed_session,
        )


@router.websocket("/ws/presence")
async def presence_ws(websocket: WebSocket) -> None:
    user = await _authenticate_ws(websocket)
    if not user:
        await websocket.close(code=4401)
        return

    await ws_hub.connect_presence(websocket, user_id=user.user_id)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        await ws_hub.disconnect(websocket)


@router.websocket("/ws/vehicles/{vehicle_id}/revisions/{revision_id}")
async def revision_sync_ws(websocket: WebSocket, vehicle_id: UUID, revision_id: UUID) -> None:
    user = await _authenticate_ws(websocket)
    if not user:
        await websocket.close(code=4401)
        return

    async with async_session_factory() as db:
        try:
            await get_revision_or_404(db, revision_id, vehicle_id)
        except Exception:
            await websocket.close(code=4404)
            return

    await ws_hub.connect(websocket, vehicle_id, revision_id, user_id=user.user_id)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        await ws_hub.disconnect(websocket)
