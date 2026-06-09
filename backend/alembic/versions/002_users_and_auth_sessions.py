"""users_and_auth_sessions

Add users table and migrate user_sessions from display_name to user_id.

Revision ID: 002
Revises: 001
Create Date: 2026-06-08

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("username", sa.String(length=64), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("is_admin", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("username"),
    )
    op.create_index("ix_users_username", "users", ["username"], unique=True)

    # Legacy sessions used display_name; clear and replace with user_id FK.
    op.execute("DELETE FROM user_sessions")
    op.drop_column("user_sessions", "display_name")
    op.add_column("user_sessions", sa.Column("user_id", UUID(as_uuid=True), nullable=False))
    op.create_index("ix_user_sessions_user_id", "user_sessions", ["user_id"])
    op.create_foreign_key(
        "fk_user_sessions_user_id_users",
        "user_sessions",
        "users",
        ["user_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint("fk_user_sessions_user_id_users", "user_sessions", type_="foreignkey")
    op.drop_index("ix_user_sessions_user_id", table_name="user_sessions")
    op.drop_column("user_sessions", "user_id")
    op.add_column(
        "user_sessions",
        sa.Column("display_name", sa.String(length=255), nullable=False, server_default=""),
    )
    op.alter_column("user_sessions", "display_name", server_default=None)

    op.drop_index("ix_users_username", table_name="users")
    op.drop_table("users")
