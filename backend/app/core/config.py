from pydantic_settings import BaseSettings, SettingsConfigDict


def parse_cors_origins(value: str) -> list[str]:
    return [part.strip() for part in value.split(",") if part.strip()]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "postgresql+asyncpg://crimpassist:crimpassist@localhost:5432/crimpassist"
    cors_origins: str = "http://localhost:5173"
    admin_username: str = "admin"
    admin_password: str = "lhrs2025!"
    session_secret: str = "dev-secret-change-in-production"
    api_host: str = "0.0.0.0"
    api_port: int = 8000

    @property
    def cors_origin_list(self) -> list[str]:
        return parse_cors_origins(self.cors_origins)


settings = Settings()
