from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.auth_context import UserContext, get_admin_user
from app.schemas.auth import AdminUserResponse, UserCreate, UserResponse
from app.realtime.ws_hub import ws_hub
from app.schemas.vehicles import VehicleCreate, VehicleResponse, VehicleUpdate
from app.services.user_service import UserService
from app.services.vehicle_service import VehicleService

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/users", response_model=list[AdminUserResponse])
async def list_users(
    db: AsyncSession = Depends(get_db),
    _admin: UserContext = Depends(get_admin_user),
) -> list[AdminUserResponse]:
    users = await UserService(db).list_users()
    connected_ids = ws_hub.connected_user_ids()
    return [
        AdminUserResponse(
            id=user.id,
            username=user.username,
            is_admin=user.is_admin,
            is_connected=user.id in connected_ids,
        )
        for user in users
    ]


@router.get("/connected-count")
async def connected_count(
    _admin: UserContext = Depends(get_admin_user),
) -> dict[str, int]:
    return {"count": ws_hub.connected_count()}


@router.post("/users", response_model=UserResponse, status_code=201)
async def create_user(
    payload: UserCreate,
    db: AsyncSession = Depends(get_db),
    _admin: UserContext = Depends(get_admin_user),
) -> UserResponse:
    return await UserService(db).create_user(payload)


@router.delete("/users/{user_id}", status_code=204)
async def delete_user(
    user_id: UUID,
    db: AsyncSession = Depends(get_db),
    admin: UserContext = Depends(get_admin_user),
) -> None:
    await UserService(db).delete_user(user_id, admin.user_id)
    return None


@router.post("/vehicles", response_model=VehicleResponse, status_code=201)
async def create_vehicle(
    payload: VehicleCreate,
    db: AsyncSession = Depends(get_db),
    admin: UserContext = Depends(get_admin_user),
) -> VehicleResponse:
    return await VehicleService(db).create_vehicle(payload, admin.username)


@router.patch("/vehicles/{vehicle_id}", response_model=VehicleResponse)
async def update_vehicle(
    vehicle_id: UUID,
    payload: VehicleUpdate,
    db: AsyncSession = Depends(get_db),
    _admin: UserContext = Depends(get_admin_user),
) -> VehicleResponse:
    return await VehicleService(db).update_vehicle(vehicle_id, payload)


@router.delete("/vehicles/{vehicle_id}", status_code=204)
async def delete_vehicle(
    vehicle_id: UUID,
    db: AsyncSession = Depends(get_db),
    _admin: UserContext = Depends(get_admin_user),
) -> None:
    await VehicleService(db).delete_vehicle(vehicle_id)
    return None


@router.post("/vehicles/{vehicle_id}/clear-all", status_code=204)
async def clear_vehicle_data(
    vehicle_id: UUID,
    db: AsyncSession = Depends(get_db),
    admin: UserContext = Depends(get_admin_user),
) -> None:
    await VehicleService(db).clear_vehicle_data(vehicle_id, created_by=admin.username)
    return None
