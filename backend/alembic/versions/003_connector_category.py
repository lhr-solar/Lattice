"""connector_category

Revision ID: 003
Revises: 002
Create Date: 2026-06-12

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "connector_templates",
        sa.Column(
            "connector_category",
            sa.String(length=32),
            nullable=False,
            server_default="wire_to_wire",
        ),
    )
    op.execute(
        """
        UPDATE connector_templates
        SET connector_category = 'wire_to_board'
        WHERE is_inline_template = false AND default_is_panel_mount = false
        """
    )


def downgrade() -> None:
    op.drop_column("connector_templates", "connector_category")
