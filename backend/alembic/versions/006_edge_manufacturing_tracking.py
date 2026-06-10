"""edge_manufacturing_tracking

Per-wire manufacturing and continuity tracking on connection edges.

Revision ID: 006
Revises: 005
Create Date: 2026-06-09

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "connection_edges",
        sa.Column("manufactured", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "connection_edges",
        sa.Column("manufactured_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "connection_edges",
        sa.Column("manufactured_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "connection_edges",
        sa.Column("manufactured_at_edit_sequence", sa.Integer(), nullable=True),
    )
    op.add_column(
        "connection_edges",
        sa.Column("continuity_checked", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "connection_edges",
        sa.Column("continuity_checked_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "connection_edges",
        sa.Column("continuity_checked_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "connection_edges",
        sa.Column("continuity_checked_at_edit_sequence", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_edge_manufactured_by_user",
        "connection_edges",
        "users",
        ["manufactured_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_edge_continuity_checked_by_user",
        "connection_edges",
        "users",
        ["continuity_checked_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.create_table(
        "edge_manufacturing_audits",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "connection_edge_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("connection_edges.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "revision_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("revisions.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("field", sa.String(64), nullable=False),
        sa.Column("previous_value", postgresql.JSONB(), nullable=True),
        sa.Column("new_value", postgresql.JSONB(), nullable=False),
        sa.Column(
            "changed_by_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("changed_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("edge_manufacturing_audits")
    op.drop_constraint("fk_edge_continuity_checked_by_user", "connection_edges", type_="foreignkey")
    op.drop_constraint("fk_edge_manufactured_by_user", "connection_edges", type_="foreignkey")
    op.drop_column("connection_edges", "continuity_checked_at_edit_sequence")
    op.drop_column("connection_edges", "continuity_checked_at")
    op.drop_column("connection_edges", "continuity_checked_by_user_id")
    op.drop_column("connection_edges", "continuity_checked")
    op.drop_column("connection_edges", "manufactured_at_edit_sequence")
    op.drop_column("connection_edges", "manufactured_at")
    op.drop_column("connection_edges", "manufactured_by_user_id")
    op.drop_column("connection_edges", "manufactured")
