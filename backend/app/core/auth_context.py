from dataclasses import dataclass
from uuid import UUID

from fastapi import Cookie, Header, HTTPException


@dataclass(frozen=True)
class UserContext:
    session_id: UUID | None
    display_name: str


async def get_user_context(
    x_user_name: str | None = Header(default=None, alias="X-User-Name"),
    session_id: str | None = Cookie(default=None, alias="crimpassist_session"),
) -> UserContext:
    name = (x_user_name or "").strip()
    if not name:
        raise HTTPException(status_code=401, detail="User name required. Set X-User-Name or create a session.")
    parsed_session: UUID | None = None
    if session_id:
        try:
            parsed_session = UUID(session_id)
        except ValueError:
            pass
    return UserContext(session_id=parsed_session, display_name=name)


async def get_optional_user_context(
    x_user_name: str | None = Header(default=None, alias="X-User-Name"),
    session_id: str | None = Cookie(default=None, alias="crimpassist_session"),
) -> UserContext | None:
    name = (x_user_name or "").strip()
    if not name:
        return None
    parsed_session: UUID | None = None
    if session_id:
        try:
            parsed_session = UUID(session_id)
        except ValueError:
            pass
    return UserContext(session_id=parsed_session, display_name=name)
