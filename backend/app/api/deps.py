from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession

from app.infra.db.session import async_session_factory
from app.services.revision_sync_service import flush_pending_broadcasts


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
            try:
                await flush_pending_broadcasts(session)
            except Exception:
                pass
        except Exception:
            await session.rollback()
            raise
