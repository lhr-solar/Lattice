"""pin_name_library

Revision ID: 006
Revises: 005
Create Date: 2026-06-07
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

from migration_helpers import table_exists


revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    if table_exists("pin_name_library_entries"):
        return
    op.create_table(
        "pin_name_library_entries",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("vehicle_id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["vehicle_id"], ["vehicles.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("vehicle_id", "name", name="uq_pin_name_library_vehicle_name"),
    )
    op.create_index(
        "ix_pin_name_library_entries_vehicle_id",
        "pin_name_library_entries",
        ["vehicle_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_pin_name_library_entries_vehicle_id", table_name="pin_name_library_entries")
    op.drop_table("pin_name_library_entries")
