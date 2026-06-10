"""initial_schema

Consolidated schema — creates all tables from SQLAlchemy models and seeds defaults.

Revision ID: 001
Revises:
Create Date: 2026-05-31

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# bcrypt hash for factory default password "123456"
ADMIN_PASSWORD_HASH = "$2b$12$RHev5cGznq8795sM6xF1V.trB.ps4nGBYwGj6WrhnrHfOYLjDAy/2"


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")
    from app.infra.db.base import Base
    from app.infra.db import models  # noqa: F401

    bind = op.get_bind()
    Base.metadata.create_all(bind)

    op.execute(
        sa.text(
            "INSERT INTO app_settings (key, value) VALUES ('default_user_password', '123456') "
            "ON CONFLICT (key) DO NOTHING"
        )
    )
    op.execute(
        sa.text(
            "INSERT INTO users (id, username, password_hash, is_admin, created_at) "
            "SELECT gen_random_uuid(), 'admin', :hash, true, NOW() "
            "WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'admin')"
        ).bindparams(hash=ADMIN_PASSWORD_HASH)
    )


def downgrade() -> None:
    from app.infra.db.base import Base
    from app.infra.db import models  # noqa: F401

    bind = op.get_bind()
    Base.metadata.drop_all(bind)
