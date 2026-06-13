"""pin_templates

Add pin template tables and pin_mapping on enclosure panel slots.

Revision ID: 005
Revises: 004
Create Date: 2026-06-13

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "pin_templates",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "vehicle_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("vehicles.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("pin_count", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.UniqueConstraint("vehicle_id", "name", name="uq_pin_template_vehicle_name"),
    )
    op.create_index("ix_pin_templates_vehicle_id", "pin_templates", ["vehicle_id"])

    op.create_table(
        "pin_template_connectors",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "pin_template_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("pin_templates.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "connector_template_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("connector_templates.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "pin_template_id", "connector_template_id", name="uq_pin_template_connector"
        ),
    )

    op.create_table(
        "pin_template_pins",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "pin_template_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("pin_templates.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("pin_number", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(128), nullable=True),
        sa.UniqueConstraint("pin_template_id", "pin_number", name="uq_pin_template_pin_number"),
    )

    op.add_column(
        "enclosure_template_panel_slots",
        sa.Column("pin_mapping", postgresql.JSONB(), nullable=False, server_default="[]"),
    )


def downgrade() -> None:
    op.drop_column("enclosure_template_panel_slots", "pin_mapping")
    op.drop_table("pin_template_pins")
    op.drop_table("pin_template_connectors")
    op.drop_table("pin_templates")
