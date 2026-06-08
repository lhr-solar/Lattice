"""connector_wire_gauge_awg

Revision ID: 004
Revises: 003
Create Date: 2026-06-07
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("connector_templates", sa.Column("wire_gauge_awg", sa.Numeric(4, 1), nullable=True))


def downgrade() -> None:
    op.drop_column("connector_templates", "wire_gauge_awg")
