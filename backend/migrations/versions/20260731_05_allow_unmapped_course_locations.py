"""Allow imported courses to wait for a map building match."""

import sqlalchemy as sa
from alembic import op


revision = "20260731_05"
down_revision = "20260726_04"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("courses") as batch_op:
        batch_op.alter_column(
            "building_id",
            existing_type=sa.Integer(),
            existing_nullable=False,
            nullable=True,
        )


def downgrade() -> None:
    connection = op.get_bind()
    missing_count = connection.scalar(
        sa.text("SELECT COUNT(*) FROM courses WHERE building_id IS NULL")
    )
    if missing_count:
        raise RuntimeError(
            "Cannot downgrade while courses still have an unmapped building"
        )
    with op.batch_alter_table("courses") as batch_op:
        batch_op.alter_column(
            "building_id",
            existing_type=sa.Integer(),
            existing_nullable=True,
            nullable=False,
        )
