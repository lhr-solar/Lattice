from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import hash_password
from app.core.time import utc_now
from app.infra.db.models.revision import UserSession
from app.infra.db.models.settings import DEFAULT_USER_PASSWORD_KEY, AppSetting
from app.infra.db.models.user import User
from app.schemas.auth import BulkActionResponse, BulkCreateUsersResponse, UserCreate, UserResponse


class UserService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def _get_setting(self, key: str) -> str | None:
        row = await self.db.get(AppSetting, key)
        return row.value if row else None

    async def _set_setting(self, key: str, value: str) -> None:
        row = await self.db.get(AppSetting, key)
        if row:
            row.value = value
        else:
            self.db.add(AppSetting(key=key, value=value))
        await self.db.flush()

    async def get_default_password(self) -> str:
        stored = await self._get_setting(DEFAULT_USER_PASSWORD_KEY)
        if stored:
            return stored
        return settings.admin_password

    async def is_default_password_configured(self) -> bool:
        return await self._get_setting(DEFAULT_USER_PASSWORD_KEY) is not None

    async def set_default_password(self, password: str) -> None:
        await self._set_setting(DEFAULT_USER_PASSWORD_KEY, password)
        return None

    async def ensure_admin_user(self) -> None:
        username = settings.admin_username.strip()
        password = settings.admin_password
        result = await self.db.execute(select(User).where(User.username == username))
        user = result.scalar_one_or_none()
        if user:
            if not user.is_admin:
                user.is_admin = True
            await self.db.flush()
            return
        self.db.add(
            User(
                username=username,
                password_hash=hash_password(password),
                is_admin=True,
                created_at=utc_now(),
            )
        )
        await self.db.flush()

    async def list_users(self) -> list[UserResponse]:
        result = await self.db.execute(select(User).order_by(User.username))
        users = result.scalars().all()
        return [UserResponse(id=u.id, username=u.username, is_admin=u.is_admin) for u in users]

    async def create_user(self, payload: UserCreate) -> UserResponse:
        username = payload.username.strip()
        existing = await self.db.execute(select(User).where(User.username == username))
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="Username already exists")
        password = payload.password or await self.get_default_password()
        if len(password) < 6:
            raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
        user = User(
            username=username,
            password_hash=hash_password(password),
            is_admin=False,
            created_at=utc_now(),
        )
        self.db.add(user)
        await self.db.flush()
        return UserResponse(id=user.id, username=user.username, is_admin=user.is_admin)

    async def update_password(self, user_id: UUID, password: str) -> None:
        user = await self.db.get(User, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        user.password_hash = hash_password(password)
        await self.db.execute(delete(UserSession).where(UserSession.user_id == user_id))
        await self.db.flush()

    async def delete_user(self, user_id: UUID, acting_user_id: UUID) -> None:
        if user_id == acting_user_id:
            raise HTTPException(status_code=400, detail="Cannot delete your own account")
        user = await self.db.get(User, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        if user.is_admin:
            raise HTTPException(status_code=400, detail="Cannot delete admin accounts")
        await self.db.execute(delete(UserSession).where(UserSession.user_id == user_id))
        await self.db.delete(user)

    async def create_users_bulk(
        self, usernames: list[str], password: str | None
    ) -> BulkCreateUsersResponse:
        resolved_password = password or await self.get_default_password()
        if len(resolved_password) < 6:
            raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

        seen: set[str] = set()
        normalized: list[str] = []
        for raw in usernames:
            username = raw.strip()
            if not username or username in seen:
                continue
            seen.add(username)
            normalized.append(username)

        if not normalized:
            raise HTTPException(status_code=400, detail="No valid usernames provided")

        existing_result = await self.db.execute(
            select(User.username).where(User.username.in_(normalized))
        )
        existing = set(existing_result.scalars().all())

        created_users: list[User] = []
        skipped: list[str] = []
        password_hash = hash_password(resolved_password)
        now = utc_now()

        for username in normalized:
            if username in existing:
                skipped.append(username)
                continue
            user = User(
                username=username,
                password_hash=password_hash,
                is_admin=False,
                created_at=now,
            )
            self.db.add(user)
            created_users.append(user)

        await self.db.flush()
        created = [
            UserResponse(id=u.id, username=u.username, is_admin=u.is_admin) for u in created_users
        ]
        return BulkCreateUsersResponse(created=created, skipped_usernames=skipped)

    async def delete_users_bulk(
        self, user_ids: list[UUID], acting_user_id: UUID
    ) -> BulkActionResponse:
        succeeded = 0
        failed = 0
        errors: list[str] = []

        for user_id in user_ids:
            try:
                await self.delete_user(user_id, acting_user_id)
                succeeded += 1
            except HTTPException as exc:
                failed += 1
                user = await self.db.get(User, user_id)
                label = user.username if user else str(user_id)
                errors.append(f"{label}: {exc.detail}")

        return BulkActionResponse(succeeded=succeeded, failed=failed, errors=errors)

    async def update_passwords_bulk(
        self, user_ids: list[UUID], password: str
    ) -> BulkActionResponse:
        if len(password) < 6:
            raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

        succeeded = 0
        failed = 0
        errors: list[str] = []
        password_hash = hash_password(password)

        for user_id in user_ids:
            user = await self.db.get(User, user_id)
            if not user:
                failed += 1
                errors.append(f"{user_id}: User not found")
                continue
            user.password_hash = password_hash
            await self.db.execute(delete(UserSession).where(UserSession.user_id == user_id))
            succeeded += 1

        await self.db.flush()
        return BulkActionResponse(succeeded=succeeded, failed=failed, errors=errors)
