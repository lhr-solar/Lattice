"""user_sessions_cascade

Add ON DELETE CASCADE to user_sessions.user_id FK for existing databases.

Revision ID: 004
Revises: 003
Create Date: 2026-06-09

"""

from typing import Sequence, Union

from alembic import op

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint("fk_user_sessions_user_id_users", "user_sessions", type_="foreignkey")
    op.create_foreign_key(
        "fk_user_sessions_user_id_users",
        "user_sessions",
        "users",
        ["user_id"],
        ["id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    op.drop_constraint("fk_user_sessions_user_id_users", "user_sessions", type_="foreignkey")
    op.create_foreign_key(
        "fk_user_sessions_user_id_users",
        "user_sessions",
        "users",
        ["user_id"],
        ["id"],
    )
