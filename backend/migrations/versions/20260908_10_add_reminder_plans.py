"""Add account-scoped reminder plans with optimistic concurrency."""
from alembic import op
import sqlalchemy as sa

revision = "20260908_10"
down_revision = "20260812_09"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "reminder_plans",
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("payload", sa.Text(), nullable=False),
        sa.CheckConstraint("revision > 0", name="ck_reminder_plans_revision"),
    )


def downgrade() -> None:
    op.drop_table("reminder_plans")
