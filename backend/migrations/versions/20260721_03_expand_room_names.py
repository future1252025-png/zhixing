"""Keep complete imported room names across courses and classroom messages."""

import sqlalchemy as sa
from alembic import op


revision = "20260721_03"
down_revision = "20260720_02"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("courses") as batch_op:
        batch_op.alter_column(
            "room_name",
            existing_type=sa.String(length=64),
            type_=sa.String(length=120),
            existing_nullable=False,
        )
    with op.batch_alter_table("messages") as batch_op:
        batch_op.alter_column(
            "room_name",
            existing_type=sa.String(length=64),
            type_=sa.String(length=120),
            existing_nullable=True,
        )


def downgrade() -> None:
    op.execute("UPDATE courses SET room_name = substr(room_name, 1, 64)")
    op.execute(
        "UPDATE messages SET room_name = substr(room_name, 1, 64) "
        "WHERE room_name IS NOT NULL"
    )
    with op.batch_alter_table("messages") as batch_op:
        batch_op.alter_column(
            "room_name",
            existing_type=sa.String(length=120),
            type_=sa.String(length=64),
            existing_nullable=True,
        )
    with op.batch_alter_table("courses") as batch_op:
        batch_op.alter_column(
            "room_name",
            existing_type=sa.String(length=120),
            type_=sa.String(length=64),
            existing_nullable=False,
        )
