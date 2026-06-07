"""inline_connector_support

Revision ID: 003
Revises: 002
Create Date: 2026-06-07
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "connector_templates",
        sa.Column("is_inline_template", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "connector_instances",
        sa.Column(
            "inline_gender",
            sa.Enum("male", "female", "hermaphroditic", "unknown", name="connectorgender"),
            nullable=True,
        ),
    )
    op.alter_column("connector_templates", "is_inline_template", server_default=None)


def downgrade() -> None:
    op.drop_column("connector_instances", "inline_gender")
    op.drop_column("connector_templates", "is_inline_template")
