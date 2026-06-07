from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.config import settings
from app.infrastructure.db.models.catalog import ConnectorTemplate
from app.infrastructure.db.models.templates import EnclosureTemplate, PcbTemplate

router = APIRouter(prefix="/dev-tools", tags=["dev-tools"])


def _assert_dev_mode() -> None:
    # Dev-only guard: only allow localhost/web dev CORS defaults.
    allowed = set(settings.cors_origins)
    if not allowed.issubset({"http://localhost:5173", "http://127.0.0.1:5173"}):
        raise HTTPException(status_code=403, detail="Dev tools are disabled outside local development")


@router.post("/clear-libraries", status_code=204)
async def clear_libraries(db: AsyncSession = Depends(get_db)) -> None:
    _assert_dev_mode()

    # Order matters for FK dependencies.
    await db.execute(delete(EnclosureTemplate))
    await db.execute(delete(PcbTemplate))
    await db.execute(delete(ConnectorTemplate))
    await db.flush()
    return None
