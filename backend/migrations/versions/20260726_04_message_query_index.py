"""Add composite index for building room message queries."""

from alembic import op


revision = "20260726_04"
down_revision = "20260721_03"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_messages_building_room_status_created",
        "messages",
        ["building_id", "room_name", "status", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_messages_building_room_status_created",
        table_name="messages",
    )
