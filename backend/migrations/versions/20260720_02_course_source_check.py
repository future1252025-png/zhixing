"""Add source kind integrity constraint to existing core journey databases."""

from alembic import op


revision = "20260720_02"
down_revision = "20260720_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("courses") as batch_op:
        batch_op.create_check_constraint(
            "ck_courses_source_kind",
            "source_kind IN ('manual', 'import')",
        )


def downgrade() -> None:
    with op.batch_alter_table("courses") as batch_op:
        batch_op.drop_constraint("ck_courses_source_kind", type_="check")
