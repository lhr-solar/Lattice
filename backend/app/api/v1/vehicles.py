from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.schemas.vehicles import VehicleResponse
from app.services.vehicle_service import VehicleService

router = APIRouter(prefix="/vehicles", tags=["vehicles"])


@router.get("", response_model=list[VehicleResponse])
async def list_vehicles(db: AsyncSession = Depends(get_db)) -> list[VehicleResponse]:
    return await VehicleService(db).list_vehicles()


@router.get("/{vehicle_id}", response_model=VehicleResponse)
async def get_vehicle(vehicle_id: UUID, db: AsyncSession = Depends(get_db)) -> VehicleResponse:
    vehicle = await VehicleService(db).get_vehicle(vehicle_id)
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return vehicle
