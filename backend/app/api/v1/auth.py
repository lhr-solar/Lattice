from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.auth_context import UserContext, get_current_user
from app.core.security import verify_password
from app.core.time import utc_now
from app.infra.db.models.revision import UserSession
from app.infra.db.models.user import User
from app.schemas.auth import AuthResponse, LoginRequest, UserResponse

router = APIRouter(prefix="/auth", tags=["auth"])

SESSION_MAX_AGE = 60 * 60 * 24 * 365


def _set_session_cookie(response: Response, session_id: str) -> None:
    response.set_cookie(
        key="crimpassist_session",
        value=session_id,
        httponly=True,
        samesite="lax",
        max_age=SESSION_MAX_AGE,
    )


def _clear_session_cookie(response: Response) -> None:
    response.delete_cookie(key="crimpassist_session", httponly=True, samesite="lax")


@router.post("/login", response_model=AuthResponse)
async def login(
    payload: LoginRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> AuthResponse:
    username = payload.username.strip()
    result = await db.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    now = utc_now()
    session = UserSession(user_id=user.id, created_at=now, last_seen_at=now)
    db.add(session)
    await db.flush()
    _set_session_cookie(response, str(session.id))
    return AuthResponse(user=UserResponse(id=user.id, username=user.username, is_admin=user.is_admin))


@router.post("/logout", status_code=204)
async def logout(
    response: Response,
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    session = await db.get(UserSession, user.session_id)
    if session:
        await db.delete(session)
    _clear_session_cookie(response)
    return None


@router.get("/me", response_model=AuthResponse)
async def get_me(user: UserContext = Depends(get_current_user)) -> AuthResponse:
    return AuthResponse(
        user=UserResponse(id=user.user_id, username=user.username, is_admin=user.is_admin)
    )
