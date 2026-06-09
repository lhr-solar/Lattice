from uuid import UUID

from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.time import utc_now
from app.infra.db.models.revision import UserSession
from app.schemas.session import SessionCreate, SessionResponse

router = APIRouter(prefix="/session", tags=["session"])


@router.post("", response_model=SessionResponse)
async def create_session(
    payload: SessionCreate,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> SessionResponse:
    now = utc_now()
    session = UserSession(display_name=payload.display_name.strip(), created_at=now, last_seen_at=now)
    db.add(session)
    await db.flush()
    response.set_cookie(
        key="crimpassist_session",
        value=str(session.id),
        httponly=True,
        samesite="lax",
        max_age=60 * 60 * 24 * 365,
    )
    return SessionResponse(session_id=session.id, display_name=session.display_name)


@router.get("/{session_id}", response_model=SessionResponse)
async def get_session(session_id: UUID, db: AsyncSession = Depends(get_db)) -> SessionResponse:
    session = await db.get(UserSession, session_id)
    if not session:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Session not found")
    return SessionResponse(session_id=session.id, display_name=session.display_name)
