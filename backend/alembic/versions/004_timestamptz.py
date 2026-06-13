"""timestamptz

Convert naive timestamp columns to timezone-aware TIMESTAMPTZ.

Revision ID: 004
Revises: 003
Create Date: 2026-06-13

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# (table, column)
TIMESTAMPTZ_COLUMNS: list[tuple[str, str]] = [
    ("users", "created_at"),
    ("user_sessions", "created_at"),
    ("user_sessions", "last_seen_at"),
    ("revision_snapshots", "created_at"),
    ("revision_changes", "changed_at"),
    ("revisions", "snapshot_taken_at"),
    ("revisions", "created_at"),
    ("saved_views", "created_at"),
    ("pcb_instances", "created_at"),
    ("enclosure_instances", "created_at"),
    ("connector_instances", "created_at"),
    ("connection_edges", "manufactured_at"),
    ("connection_edges", "continuity_checked_at"),
    ("connection_edges", "created_at"),
    ("manufacturing_records", "built_at"),
    ("manufacturing_records", "continuity_checked_at"),
    ("edge_manufacturing_audits", "changed_at"),
    ("continuity_checks", "performed_at"),
]


def _alter_to_timestamptz(table: str, column: str) -> None:
    op.execute(
        sa.text(
            f'ALTER TABLE {table} ALTER COLUMN {column} TYPE TIMESTAMPTZ '
            f"USING {column} AT TIME ZONE 'UTC'"
        )
    )


def _alter_to_timestamp(table: str, column: str) -> None:
    op.execute(
        sa.text(
            f"ALTER TABLE {table} ALTER COLUMN {column} TYPE TIMESTAMP "
            f"USING {column} AT TIME ZONE 'UTC'"
        )
    )


def upgrade() -> None:
    for table, column in TIMESTAMPTZ_COLUMNS:
        _alter_to_timestamptz(table, column)


def downgrade() -> None:
    for table, column in reversed(TIMESTAMPTZ_COLUMNS):
        _alter_to_timestamp(table, column)
