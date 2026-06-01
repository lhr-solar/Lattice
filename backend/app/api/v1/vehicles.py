from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.auth_context import UserContext, get_optional_user_context
from app.schemas.vehicles import VehicleCreate, VehicleResponse, VehicleUpdate
from app.services.vehicle_service import VehicleService

router = APIRouter(prefix="/vehicles", tags=["vehicles"])


@router.get("", response_model=list[VehicleResponse])
async def list_vehicles(db: AsyncSession = Depends(get_db)) -> list[VehicleResponse]:
    return await VehicleService(db).list_vehicles()


@router.post("", response_model=VehicleResponse, status_code=201)
async def create_vehicle(
    payload: VehicleCreate,
    db: AsyncSession = Depends(get_db),
    user: UserContext | None = Depends(get_optional_user_context),
) -> VehicleResponse:
    created_by = user.display_name if user else None
    return await VehicleService(db).create_vehicle(payload, created_by)


@router.get("/{vehicle_id}", response_model=VehicleResponse)
async def get_vehicle(vehicle_id: UUID, db: AsyncSession = Depends(get_db)) -> VehicleResponse:
    vehicle = await VehicleService(db).get_vehicle(vehicle_id)
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return vehicle


@router.patch("/{vehicle_id}", response_model=VehicleResponse)
async def update_vehicle(
    vehicle_id: UUID,
    payload: VehicleUpdate,
    db: AsyncSession = Depends(get_db),
) -> VehicleResponse:
    return await VehicleService(db).update_vehicle(vehicle_id, payload)


@router.delete("/{vehicle_id}", status_code=204)
async def delete_vehicle(vehicle_id: UUID, db: AsyncSession = Depends(get_db)) -> None:
    await VehicleService(db).delete_vehicle(vehicle_id)
    return None
