from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.auth_context import UserContext, get_admin_user
from app.schemas.auth import (
    AdminUserResponse,
    BulkActionResponse,
    BulkCreateUsersResponse,
    DefaultPasswordResponse,
    DefaultPasswordUpdate,
    UserCreate,
    UserPasswordUpdate,
    UserResponse,
    UsersBulkCreate,
    UsersBulkDelete,
    UsersBulkPasswordUpdate,
)
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


@router.patch("/users/{user_id}/password", status_code=204)
async def update_user_password(
    user_id: UUID,
    payload: UserPasswordUpdate,
    db: AsyncSession = Depends(get_db),
    _admin: UserContext = Depends(get_admin_user),
) -> None:
    await UserService(db).update_password(user_id, payload.password)
    return None


@router.post("/users/bulk", response_model=BulkCreateUsersResponse, status_code=201)
async def create_users_bulk(
    payload: UsersBulkCreate,
    db: AsyncSession = Depends(get_db),
    _admin: UserContext = Depends(get_admin_user),
) -> BulkCreateUsersResponse:
    return await UserService(db).create_users_bulk(payload.usernames, payload.password)


@router.post("/users/bulk/delete", response_model=BulkActionResponse)
async def delete_users_bulk(
    payload: UsersBulkDelete,
    db: AsyncSession = Depends(get_db),
    admin: UserContext = Depends(get_admin_user),
) -> BulkActionResponse:
    return await UserService(db).delete_users_bulk(payload.user_ids, admin.user_id)


@router.patch("/users/bulk/password", response_model=BulkActionResponse)
async def update_users_password_bulk(
    payload: UsersBulkPasswordUpdate,
    db: AsyncSession = Depends(get_db),
    _admin: UserContext = Depends(get_admin_user),
) -> BulkActionResponse:
    return await UserService(db).update_passwords_bulk(payload.user_ids, payload.password)


@router.get("/settings/default-password", response_model=DefaultPasswordResponse)
async def get_default_password(
    db: AsyncSession = Depends(get_db),
    _admin: UserContext = Depends(get_admin_user),
) -> DefaultPasswordResponse:
    configured = await UserService(db).is_default_password_configured()
    return DefaultPasswordResponse(configured=configured)


@router.patch("/settings/default-password", response_model=DefaultPasswordResponse)
async def update_default_password(
    payload: DefaultPasswordUpdate,
    db: AsyncSession = Depends(get_db),
    _admin: UserContext = Depends(get_admin_user),
) -> DefaultPasswordResponse:
    await UserService(db).set_default_password(payload.password)
    return DefaultPasswordResponse(configured=True)


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
