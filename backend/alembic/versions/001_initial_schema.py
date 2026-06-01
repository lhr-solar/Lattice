"""initial_schema

Revision ID: 001
Revises:
Create Date: 2026-05-31

"""

from typing import Sequence, Union

from alembic import op

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")
    from app.infrastructure.db.base import Base
    from app.infrastructure.db import models  # noqa: F401

    bind = op.get_bind()
    Base.metadata.create_all(bind)


def downgrade() -> None:
    from app.infrastructure.db.base import Base
    from app.infrastructure.db import models  # noqa: F401

    bind = op.get_bind()
    Base.metadata.drop_all(bind)
