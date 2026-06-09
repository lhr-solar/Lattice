from dataclasses import dataclass
from uuid import UUID

from fastapi import Cookie, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.time import utc_now
from app.infra.db.models.revision import UserSession
from app.infra.db.models.user import User


@dataclass(frozen=True)
class UserContext:
    user_id: UUID
    username: str
    is_admin: bool
    session_id: UUID


async def get_current_user(
    session_id: str | None = Cookie(default=None, alias="crimpassist_session"),
    db: AsyncSession = Depends(get_db),
) -> UserContext:
    if not session_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        parsed_session = UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid session")
    session = await db.get(UserSession, parsed_session)
    if not session:
        raise HTTPException(status_code=401, detail="Session expired")
    user = await db.get(User, session.user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    session.last_seen_at = utc_now()
    return UserContext(
        user_id=user.id,
        username=user.username,
        is_admin=user.is_admin,
        session_id=parsed_session,
    )


async def get_admin_user(user: UserContext = Depends(get_current_user)) -> UserContext:
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user
