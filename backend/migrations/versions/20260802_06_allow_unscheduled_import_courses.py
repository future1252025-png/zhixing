"""Allow imported courses to wait for schedule times."""

import sqlalchemy as sa
from alembic import op


revision = "20260802_06"
down_revision = "20260731_05"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("courses") as batch_op:
        batch_op.alter_column(
            "start_time",
            existing_type=sa.String(length=5),
            existing_nullable=False,
            nullable=True,
        )
        batch_op.alter_column(
            "end_time",
            existing_type=sa.String(length=5),
            existing_nullable=False,
            nullable=True,
        )


def downgrade() -> None:
    connection = op.get_bind()
    missing_count = connection.scalar(
        sa.text(
            "SELECT COUNT(*) FROM courses "
            "WHERE start_time IS NULL OR end_time IS NULL"
        )
    )
    if missing_count:
        raise RuntimeError(
            "Cannot downgrade while courses still have an incomplete schedule"
        )
    with op.batch_alter_table("courses") as batch_op:
        batch_op.alter_column(
            "end_time",
            existing_type=sa.String(length=5),
            existing_nullable=True,
            nullable=False,
        )
        batch_op.alter_column(
            "start_time",
            existing_type=sa.String(length=5),
            existing_nullable=True,
            nullable=False,
        )
