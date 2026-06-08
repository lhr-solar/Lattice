from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.config import settings
from app.services.vehicle_service import VehicleService

router = APIRouter(prefix="/dev-tools", tags=["dev-tools"])


def _assert_dev_mode() -> None:
    # Dev-only guard: only allow localhost/web dev CORS defaults.
    allowed = set(settings.cors_origins)
    if not allowed.issubset({"http://localhost:5173", "http://127.0.0.1:5173"}):
        raise HTTPException(status_code=403, detail="Dev tools are disabled outside local development")


@router.post("/vehicles/{vehicle_id}/clear-all", status_code=204)
async def clear_vehicle_data(vehicle_id: UUID, db: AsyncSession = Depends(get_db)) -> None:
    _assert_dev_mode()
    await VehicleService(db).delete_vehicle(vehicle_id)
    return None
