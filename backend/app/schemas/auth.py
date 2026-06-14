from uuid import UUID

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=128)


class UserResponse(BaseModel):
    id: UUID
    username: str
    is_admin: bool


class AdminUserResponse(UserResponse):
    is_connected: bool = False


class UserCreate(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str | None = Field(default=None, min_length=6, max_length=128)


class UserPasswordUpdate(BaseModel):
    password: str = Field(min_length=6, max_length=128)


class DefaultPasswordResponse(BaseModel):
    configured: bool
    password: str


class DefaultPasswordUpdate(BaseModel):
    password: str = Field(min_length=6, max_length=128)


class UsersBulkCreate(BaseModel):
    usernames: list[str] = Field(min_length=1)
    password: str | None = Field(default=None, min_length=6, max_length=128)


class UsersBulkDelete(BaseModel):
    user_ids: list[UUID] = Field(min_length=1)


class UsersBulkPasswordUpdate(BaseModel):
    user_ids: list[UUID] = Field(min_length=1)
    password: str = Field(min_length=6, max_length=128)


class BulkCreateUsersResponse(BaseModel):
    created: list[UserResponse]
    skipped_usernames: list[str]


class BulkActionResponse(BaseModel):
    succeeded: int
    failed: int
    errors: list[str] = Field(default_factory=list)


class AuthResponse(BaseModel):
    user: UserResponse
