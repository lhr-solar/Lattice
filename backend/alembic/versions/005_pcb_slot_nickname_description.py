"""pcb_slot_nickname_description

Revision ID: 005
Revises: 004
Create Date: 2026-06-07
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

from migration_helpers import column_exists


revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    if not column_exists("pcb_template_connector_slots", "nickname"):
        op.add_column("pcb_template_connector_slots", sa.Column("nickname", sa.String(length=255), nullable=True))
    if not column_exists("pcb_template_connector_slots", "description"):
        op.add_column("pcb_template_connector_slots", sa.Column("description", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("pcb_template_connector_slots", "description")
    op.drop_column("pcb_template_connector_slots", "nickname")
