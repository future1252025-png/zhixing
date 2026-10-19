"""Keep dated course time rules with semester settings."""
from alembic import op
import sqlalchemy as sa

revision = "20261009_13"
down_revision = "20260915_12"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("semester_settings", sa.Column("time_rules", sa.JSON(), nullable=False, server_default="[]"))


def downgrade():
    with op.batch_alter_table("semester_settings") as batch:
        batch.drop_column("time_rules")
