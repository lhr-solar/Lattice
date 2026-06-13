"""nested_enclosures

Revision ID: 002
Revises: 001
Create Date: 2026-06-09

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "enclosure_instances",
        sa.Column("parent_enclosure_instance_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_enclosure_instances_parent_enclosure_instance_id",
        "enclosure_instances",
        "enclosure_instances",
        ["parent_enclosure_instance_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index(
        "ix_enclosure_instances_parent_enclosure_instance_id",
        "enclosure_instances",
        ["parent_enclosure_instance_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_enclosure_instances_parent_enclosure_instance_id",
        table_name="enclosure_instances",
    )
    op.drop_constraint(
        "fk_enclosure_instances_parent_enclosure_instance_id",
        "enclosure_instances",
        type_="foreignkey",
    )
    op.drop_column("enclosure_instances", "parent_enclosure_instance_id")
