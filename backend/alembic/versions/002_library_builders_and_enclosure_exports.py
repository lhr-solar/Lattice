"""library_builders_and_enclosure_exports

Revision ID: 002
Revises: 001
Create Date: 2026-06-07
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("connector_templates", sa.Column("male_crimp_part_number", sa.String(length=128), nullable=True))
    op.add_column("connector_templates", sa.Column("female_crimp_part_number", sa.String(length=128), nullable=True))
    op.add_column("connector_templates", sa.Column("key_code", sa.String(length=128), nullable=True))
    op.add_column(
        "connector_templates",
        sa.Column("default_is_panel_mount", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )

    op.add_column(
        "pcb_template_connector_slots",
        sa.Column("export_to_enclosure", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )

    op.create_table(
        "enclosure_template_pcb_slots",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("enclosure_template_id", sa.UUID(), nullable=False),
        sa.Column("slot_key", sa.String(length=128), nullable=False),
        sa.Column("pcb_template_id", sa.UUID(), nullable=False),
        sa.Column("position_index", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["enclosure_template_id"], ["enclosure_templates.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["pcb_template_id"], ["pcb_templates.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("enclosure_template_id", "slot_key"),
    )

    op.add_column("connector_instances", sa.Column("source_pcb_template_slot_id", sa.UUID(), nullable=True))
    op.add_column("connector_instances", sa.Column("source_pcb_instance_id", sa.UUID(), nullable=True))
    op.add_column("connector_instances", sa.Column("pin_origin_note", sa.String(length=255), nullable=True))
    op.create_foreign_key(
        "fk_connector_instances_source_pcb_template_slot_id",
        "connector_instances",
        "pcb_template_connector_slots",
        ["source_pcb_template_slot_id"],
        ["id"],
    )
    op.create_foreign_key(
        "fk_connector_instances_source_pcb_instance_id",
        "connector_instances",
        "pcb_instances",
        ["source_pcb_instance_id"],
        ["id"],
        ondelete="CASCADE",
    )

    op.alter_column("connector_templates", "default_is_panel_mount", server_default=None)
    op.alter_column("pcb_template_connector_slots", "export_to_enclosure", server_default=None)


def downgrade() -> None:
    op.drop_constraint(
        "fk_connector_instances_source_pcb_instance_id",
        "connector_instances",
        type_="foreignkey",
    )
    op.drop_constraint(
        "fk_connector_instances_source_pcb_template_slot_id",
        "connector_instances",
        type_="foreignkey",
    )
    op.drop_column("connector_instances", "pin_origin_note")
    op.drop_column("connector_instances", "source_pcb_instance_id")
    op.drop_column("connector_instances", "source_pcb_template_slot_id")

    op.drop_table("enclosure_template_pcb_slots")
    op.drop_column("pcb_template_connector_slots", "export_to_enclosure")

    op.drop_column("connector_templates", "default_is_panel_mount")
    op.drop_column("connector_templates", "key_code")
    op.drop_column("connector_templates", "female_crimp_part_number")
    op.drop_column("connector_templates", "male_crimp_part_number")
