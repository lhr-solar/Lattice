from datetime import datetime, timezone


def utc_now() -> datetime:
    """Naive UTC for PostgreSQL TIMESTAMP WITHOUT TIME ZONE (asyncpg)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)
