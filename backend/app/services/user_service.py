from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import hash_password, verify_password
from app.core.time import utc_now
from app.infra.db.models.user import User
from app.schemas.auth import UserCreate, UserResponse


class UserService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def ensure_admin_user(self) -> None:
        username = settings.admin_username.strip()
        password = settings.admin_password
        result = await self.db.execute(select(User).where(User.username == username))
        user = result.scalar_one_or_none()
        if user:
            if not user.is_admin:
                user.is_admin = True
            if not verify_password(password, user.password_hash):
                user.password_hash = hash_password(password)
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
        user = User(
            username=username,
            password_hash=hash_password(payload.password),
            is_admin=False,
            created_at=utc_now(),
        )
        self.db.add(user)
        await self.db.flush()
        return UserResponse(id=user.id, username=user.username, is_admin=user.is_admin)

    async def delete_user(self, user_id: UUID, acting_user_id: UUID) -> None:
        if user_id == acting_user_id:
            raise HTTPException(status_code=400, detail="Cannot delete your own account")
        user = await self.db.get(User, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        if user.is_admin:
            raise HTTPException(status_code=400, detail="Cannot delete admin accounts")
        await self.db.delete(user)
