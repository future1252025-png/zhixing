"""Add dated makeup snapshots and idempotent batch receipts."""
from alembic import op
import sqlalchemy as sa

revision = "20260915_12"
down_revision = "20260910_11"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("courses", sa.Column("makeup", sa.JSON(none_as_null=True), nullable=True))
    op.create_table(
        "course_makeup_requests",
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("request_id", sa.String(36), primary_key=True),
        sa.Column("payload_hash", sa.String(64), nullable=False),
        sa.Column("course_ids", sa.JSON(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("course_makeup_requests")
    with op.batch_alter_table("courses") as batch:
        batch.drop_column("makeup")
