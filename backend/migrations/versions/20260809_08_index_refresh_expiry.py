"""Harden refresh cleanup and erase historical precise message locations."""

from alembic import op


revision = "20260809_08"
down_revision = "20260807_07"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_refresh_sessions_absolute_expires_at",
        "refresh_sessions",
        ["absolute_expires_at"],
        unique=False,
    )
    # Messages are publicly anonymous. Exact historical coordinates and their
    # acquisition source can re-identify senders, so remove them in place while
    # retaining the nullable columns for old database/client compatibility.
    op.execute(
        "UPDATE messages SET latitude = NULL, longitude = NULL, "
        "location_source = NULL"
    )


def downgrade() -> None:
    op.drop_index(
        "ix_refresh_sessions_absolute_expires_at",
        table_name="refresh_sessions",
    )
